import { z } from 'zod';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MatriculaDto } from '../shared/tipos/Matricula';
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
const alvoExclusao = alvo.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(valor => {
  const tempo = Date.parse(`${valor}T00:00:00.000Z`);
  return valor.slice(0, 4) !== '0000' && Number.isFinite(tempo) && new Date(tempo).toISOString().slice(0, 10) === valor;
}, 'Informe uma data válida.');
const criar = z.object({ aluno_id: id, plano_id: id, data_inicio: dataCivil, data_fim: dataCivil,
  valor_contratado_centavos: z.number().int().min(0).safe() }).strict().refine(v => v.data_fim >= v.data_inicio, 'A data final deve ser igual ou posterior à inicial.');
const atualizar = alvo.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/), alteracoes: criar }).strict();
export class MatriculaService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: MatriculaRepository, private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}
  public async executar(canal: CanalMatricula, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<ContratoIpc[CanalMatricula]['saida']> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = canal === 'matriculas:excluir' ? ['admin'] : ['admin', 'recepcao'];
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
        return this.dto(this.repository.cadastrar(dados));
      }
      if (canal === 'matriculas:listar') {
        const resultado = lista.safeParse(entrada);
        if (!resultado.success) throw new ErroMatricula('VALIDACAO');
        const f = resultado.data;
        return this.repository.listar({ pagina: f.pagina, tamanho: f.tamanho, ...(f.aluno_id === undefined ? {} : { aluno_id: f.aluno_id }), ...(f.plano_id === undefined ? {} : { plano_id: f.plano_id }), ...(f.situacao === undefined ? {} : { situacao: f.situacao }) });
      }
      if (canal === 'matriculas:atualizar') {
        const resultado = atualizar.safeParse(entrada);
        if (!resultado.success) throw new ErroMatricula('VALIDACAO', { dados: ['Confira aluno, plano ativo, datas e valor contratado.'] });
        const { id: matriculaId, referencia, alteracoes } = resultado.data;
        const atual = this.repository.detalhes(matriculaId);
        if (atual === undefined) throw new ErroMatricula('NAO_ENCONTRADO');
        if (!timingSafeEqual(Buffer.from(referencia, 'hex'), Buffer.from(this.referencia(atual), 'hex'))) {
          throw new ErroMatricula('CONFLITO', { dados: ['A matrícula foi alterada. Consulte novamente.'] });
        }
        if (atual.situacao !== 'ativa') throw new ErroMatricula('CONFLITO', { situacao: ['Somente matrículas ativas podem ser editadas.'] });
        if (this.repository.possuiVinculos(atual.id)) {
          throw new ErroMatricula('CONFLITO', { vinculos: ['Matrículas com pagamentos ou notificações vinculados não podem ser editadas para preservar o histórico.'] });
        }
        if (!this.repository.alunoExiste(alteracoes.aluno_id)) throw new ErroMatricula('VALIDACAO', { aluno_id: ['Aluno não encontrado.'] });
        if (!this.repository.planoAtivo(alteracoes.plano_id)) throw new ErroMatricula('VALIDACAO', { plano_id: ['Plano inexistente ou inativo.'] });
        if (this.repository.sobrepoe(alteracoes.aluno_id, alteracoes.data_inicio, alteracoes.data_fim, atual.id)) {
          throw new ErroMatricula('CONFLITO', { datas: ['O aluno já possui matrícula ativa em período sobreposto.'] });
        }
        if (!this.repository.atualizar(atual.id, atual.atualizado_em, alteracoes)) {
          throw new ErroMatricula('CONFLITO', { dados: ['A matrícula mudou. Consulte novamente antes de editar.'] });
        }
        const atualizada = this.repository.detalhes(atual.id);
        if (atualizada === undefined) throw new ErroMatricula('INTERNO');
        return this.dto(atualizada);
      }
      const resultado = (canal === 'matriculas:excluir' ? alvoExclusao : alvo).safeParse(entrada);
      if (!resultado.success) throw new ErroMatricula('VALIDACAO');
      const matricula = this.repository.detalhes(resultado.data.id);
      if (matricula === undefined) throw new ErroMatricula('NAO_ENCONTRADO');
      if (canal === 'matriculas:excluir') {
        if (!('referencia' in resultado.data) || typeof resultado.data.referencia !== 'string' || !timingSafeEqual(Buffer.from(resultado.data.referencia, 'hex'), Buffer.from(this.referencia(matricula), 'hex'))) throw new ErroMatricula('CONFLITO', { dados: ['A matrícula foi alterada. Consulte novamente.'] });
        if (this.repository.possuiVinculos(matricula.id)) throw new ErroMatricula('CONFLITO', { vinculos: ['Matrícula com pagamentos ou notificações vinculados não pode ser excluída.'] });
        if (!this.repository.delete(matricula.id)) throw new ErroMatricula('NAO_ENCONTRADO');
        return { id: matricula.id, excluido: true };
      }
      if (canal === 'matriculas:cancelar' || canal === 'matriculas:encerrar') {
        if (matricula.situacao !== 'ativa') throw new ErroMatricula('CONFLITO', { situacao: ['Somente matrículas ativas podem ser alteradas.'] });
        const agora = new Date();
        const hoje = `${String(agora.getFullYear()).padStart(4, '0')}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
        if (canal === 'matriculas:encerrar' && matricula.data_fim >= hoje) throw new ErroMatricula('VALIDACAO', { data_fim: ['O encerramento só é permitido a partir do dia seguinte à data final.'] });
        if (!this.repository.alterarSituacao(matricula.id, canal === 'matriculas:cancelar' ? 'cancelada' : 'encerrada')) throw new ErroMatricula('CONFLITO');
        const atualizado = this.repository.detalhes(matricula.id);
        if (atualizado === undefined) throw new ErroMatricula('INTERNO');
        return this.dto(atualizado);
      }
      return this.dto(matricula);
    };
    return canal === 'matriculas:criar' || canal === 'matriculas:atualizar' || canal === 'matriculas:cancelar' || canal === 'matriculas:encerrar' || canal === 'matriculas:excluir' ? this.repository.escritaAtomica(operacao) : this.repository.atomico(operacao);
  }
  private referencia(m: MatriculaDto): string {
    return createHmac('sha256', this.chave).update(JSON.stringify([m.id, m.aluno_id, m.aluno_nome, m.plano_id, m.plano_nome, m.data_inicio, m.data_fim, m.valor_contratado_centavos, m.situacao, m.criado_em, m.atualizado_em])).digest('hex');
  }
  private dto(m: MatriculaDto): MatriculaDto { return { ...m, referencia: this.referencia(m) }; }
}
