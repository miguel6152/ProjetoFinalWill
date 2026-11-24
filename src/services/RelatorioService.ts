import { z } from 'zod';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import type { Autorizador } from '../main/seguranca/Autorizador';
import type { SessaoManager } from '../main/seguranca/SessaoManager';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';
import type { EvolucaoDto, FrequenciaDto } from '../shared/tipos/Relatorio';

/** Cliente HTTP exclusivo do Main: nunca consulta SQLite como alternativa. */
export class RelatorioService {
  private static readonly id = z.number().int().positive().safe();
  private static readonly medida = z.number().positive().nullable();
  private static readonly evolucao = z.object({
    aluno_id: this.id, inicio: z.iso.date(), fim: z.iso.date(),
    pontos: z.array(z.object({ id: this.id, realizada_em: z.iso.date(), instrutor_id: this.id,
      peso_kg: z.number().positive(), altura_cm: z.number().positive(), cintura_cm: this.medida,
      quadril_cm: this.medida, braco_cm: this.medida, coxa_cm: this.medida })).max(1000)
  });
  private static readonly frequencia = z.object({ inicio: z.string(), fim: z.string(),
    itens: z.array(z.object({ aluno_id: this.id, nome: z.string(), presentes: z.number().int().nonnegative(),
      ausentes: z.number().int().nonnegative(), nao_registradas: z.number().int().nonnegative(),
      percentual_presenca: z.number().min(0).max(100).nullable() })).max(1000)
  });
  public constructor(private readonly acesso: (contexto: ContextoSessao) => { endereco: string; token: string },
    private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}

  public async consultar(tipo: 'evolucao' | 'frequencia', entrada: unknown, contexto: ContextoSessao): Promise<EvolucaoDto | FrequenciaDto> {
    const sessao = this.sessoes.obter(contexto), versao = this.sessoes.versao(contexto);
    const identidade = await this.autorizador.exigirPerfil(contexto, tipo === 'evolucao' ? ['admin','instrutor'] : ['admin','recepcao','instrutor']);
    const schema = tipo === 'evolucao'
      ? z.object({ aluno_id: RelatorioService.id, inicio: z.iso.date(), fim: z.iso.date() }).strict()
      : z.object({ aluno_id: RelatorioService.id.optional(), aula_id: RelatorioService.id.optional(),
        inicio: z.iso.datetime({offset:true}), fim: z.iso.datetime({offset:true}) }).strict();
    const filtro = schema.safeParse(entrada);
    if (!filtro.success || Date.parse(filtro.data.fim) < Date.parse(filtro.data.inicio)
      || Date.parse(filtro.data.fim) - Date.parse(filtro.data.inicio) > 366 * 86400000) throw new ErroAutenticacao('VALIDACAO');
    this.sessoes.conferir(contexto, versao);
    const { endereco, token } = this.acesso(contexto);
    const url = new URL('/relatorios/' + tipo, endereco);
    for (const [chave, valor] of Object.entries(filtro.data)) url.searchParams.set(chave, String(valor));
    const resposta = await fetch(url, { headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!resposta.ok) {
      await resposta.body?.cancel();
      throw new ErroAutenticacao(resposta.status === 401 ? 'NAO_AUTENTICADO' : resposta.status === 403 ? 'SEM_PERMISSAO' : resposta.status === 400 ? 'VALIDACAO' : 'INTERNO');
    }
    const dados = await resposta.json() as unknown;
    this.sessoes.conferir(contexto, versao);
    if (this.sessoes.obter(contexto) !== sessao) throw new ErroAutenticacao('NAO_AUTENTICADO');
    const atual = await this.autorizador.exigirPerfil(contexto, tipo === 'evolucao' ? ['admin','instrutor'] : ['admin','recepcao','instrutor']);
    if (atual.perfil !== identidade.perfil) throw new ErroAutenticacao('SEM_PERMISSAO');
    return tipo === 'evolucao' ? RelatorioService.evolucao.parse(dados) : RelatorioService.frequencia.parse(dados);
  }
}
