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
export class MatriculaService {
  public constructor(private readonly repository: MatriculaRepository, private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}
  public async executar(canal: CanalMatricula, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<ContratoIpc[CanalMatricula]['saida']> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = ['admin', 'recepcao'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    try { ValidacaoPlano.objeto(entrada); } catch (erro: unknown) { if (erro instanceof ErroPlano) throw new ErroMatricula('VALIDACAO'); throw erro; }
    return this.repository.atomico(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroMatricula('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroMatricula('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroMatricula('SEM_PERMISSAO');
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
      return matricula;
    });
  }
}
