import { z } from 'zod';
import type { ContratoIpc, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { MatriculaRepository } from '../repositories/MatriculaRepository';
import { ErroMatricula } from './ErroMatricula';
import { ValidacaoPlano } from './ValidacaoPlano';
import { ErroPlano } from './ErroPlano';

export type CanalMatricula = Extract<keyof ContratoIpc, `matriculas:${string}`>;
const id = z.number().int().positive().safe();
const lista = z.object({ pagina: id, tamanho: z.number().int().min(1).max(100), aluno_id: id.optional(), plano_id: id.optional(), situacao: z.enum(['ativa', 'cancelada', 'encerrada']).optional() }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));
const alvo = z.object({ id }).strict();
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(valor => {
  const tempo = Date.parse(`${valor}T00:00:00.000Z`);
  return valor.slice(0, 4) !== '0000' && Number.isFinite(tempo) && new Date(tempo).toISOString().slice(0, 10) === valor;
}, 'Informe uma data válida.');
const criar = z.object({ aluno_id: id, plano_id: id, data_inicio: dataCivil, data_fim: dataCivil,
  valor_contratado_centavos: z.number().int().min(0).safe() }).strict().refine(v => v.data_fim >= v.data_inicio, 'A data final deve ser igual ou posterior à inicial.');
export class MatriculaService {
  public constructor(private readonly repository: MatriculaRepository, private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}
  public async executar(canal: CanalMatricula, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<ContratoIpc[CanalMatricula]['saida']> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = ['admin', 'recepcao'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    try { ValidacaoPlano.objeto(entrada); } catch (erro: unknown) { if (erro instanceof ErroPlano) throw new ErroMatricula('VALIDACAO'); throw erro; }
    const operacao = (): ContratoIpc[CanalMatricula]['saida'] => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroMatricula('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroMatricula('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroMatricula('SEM_PERMISSAO');
      if (canal === 'matriculas:criar') {
        const resultado = criar.safeParse(entrada);
        if (!resultado.success) throw new ErroMatricula('VALIDACAO', { dados: ['Confira aluno, plano, datas e valor contratado.'] });
        const dados = resultado.data;
        if (!this.repository.alunoExiste(dados.aluno_id)) throw new ErroMatricula('VALIDACAO', { aluno_id: ['Aluno não encontrado.'] });
        if (!this.repository.planoAtivo(dados.plano_id)) throw new ErroMatricula('VALIDACAO', { plano_id: ['Plano inexistente ou inativo.'] });
        if (this.repository.sobrepoe(dados.aluno_id, dados.data_inicio, dados.data_fim)) throw new ErroMatricula('CONFLITO', { datas: ['O aluno já possui matrícula ativa em período sobreposto.'] });
        return this.repository.cadastrar(dados);
      }
      if (canal === 'matriculas:listar') {
        const resultado = lista.safeParse(entrada);
        if (!resultado.success) throw new ErroMatricula('VALIDACAO');
        const f = resultado.data;
        return this.repository.listar({ pagina: f.pagina, tamanho: f.tamanho, ...(f.aluno_id === undefined ? {} : { aluno_id: f.aluno_id }), ...(f.plano_id === undefined ? {} : { plano_id: f.plano_id }), ...(f.situacao === undefined ? {} : { situacao: f.situacao }) });
      }
      const resultado = alvo.safeParse(entrada);
      if (!resultado.success) throw new ErroMatricula('VALIDACAO');
      const matricula = this.repository.detalhes(resultado.data.id);
      if (matricula === undefined) throw new ErroMatricula('NAO_ENCONTRADO');
      if (canal === 'matriculas:cancelar' || canal === 'matriculas:encerrar') {
        if (matricula.situacao !== 'ativa') throw new ErroMatricula('CONFLITO', { situacao: ['Somente matrículas ativas podem ser alteradas.'] });
        const agora = new Date();
        const hoje = `${String(agora.getFullYear()).padStart(4, '0')}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
        if (canal === 'matriculas:encerrar' && matricula.data_fim >= hoje) throw new ErroMatricula('VALIDACAO', { data_fim: ['O encerramento só é permitido a partir do dia seguinte à data final.'] });
        if (!this.repository.alterarSituacao(matricula.id, canal === 'matriculas:cancelar' ? 'cancelada' : 'encerrada')) throw new ErroMatricula('CONFLITO');
        const atualizado = this.repository.detalhes(matricula.id);
        if (atualizado === undefined) throw new ErroMatricula('INTERNO');
        return atualizado;
      }
      return matricula;
    };
    return canal === 'matriculas:criar' || canal === 'matriculas:cancelar' || canal === 'matriculas:encerrar' ? this.repository.escritaAtomica(operacao) : this.repository.atomico(operacao);
  }
}
