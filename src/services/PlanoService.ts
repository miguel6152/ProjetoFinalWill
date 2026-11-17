import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Plano } from '../models/Plano';
import type { ContratoIpc, PlanoDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { PlanoRepository } from '../repositories/PlanoRepository';
import { ErroPlano } from './ErroPlano';
import { ValidacaoPlano } from './ValidacaoPlano';

export type CanalPlano = Extract<keyof ContratoIpc, `planos:${string}`>;
type Saida = ContratoIpc[CanalPlano]['saida'];

export class PlanoService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: PlanoRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalPlano, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = canal === 'planos:listar' || canal === 'planos:obter' ? ['admin','recepcao'] : ['admin'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoPlano.objeto(entrada);
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroPlano('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroPlano('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroPlano('SEM_PERMISSAO');
      if (canal === 'planos:criar') return this.dto(this.repository.create(this.validar(ValidacaoPlano.criar, entrada)));
      if (canal === 'planos:listar') {
        const lista = this.validar(ValidacaoPlano.lista, entrada);
        const pagina = this.repository.listar({ pagina: lista.pagina, tamanho: lista.tamanho,
          ...(lista.busca === undefined ? {} : { busca: lista.busca }) });
        return { ...pagina, itens: pagina.itens.map(plano => this.dto(plano)) };
      }
      const alvo = canal === 'planos:atualizar' ? this.validar(ValidacaoPlano.atualizar, entrada)
        : canal === 'planos:excluir' ? this.validar(ValidacaoPlano.alvo, entrada) : this.validar(ValidacaoPlano.id, entrada);
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined) throw new ErroPlano('NAO_ENCONTRADO');
      if (canal === 'planos:obter') return this.dto(atual);
      const referencia = this.validar(ValidacaoPlano.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia,'hex'),Buffer.from(this.referencia(atual),'hex'))) throw new ErroPlano('CONFLITO');
      if (canal === 'planos:excluir') {
        if (!this.repository.delete(alvo.id)) throw new ErroPlano('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoPlano.atualizar, entrada).alteracoes;
      const completos = this.validar(ValidacaoPlano.criar, { nome: atual.nome, duracao_meses: atual.duracao_meses,
        valor_centavos: atual.valor_centavos, ativo: atual.ativo, ...patch });
      // Somente planos são alterados; valores e datas contratados das matrículas permanecem intactos.
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroPlano('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) (campos[problema.path.join('.') || 'dados'] ??= []).push(problema.message);
    throw new ErroPlano('VALIDACAO',campos);
  }

  private dto(plano: Plano): PlanoDto {
    return { id: plano.id, nome: plano.nome, duracao_meses: plano.duracao_meses, valor_centavos: plano.valor_centavos,
      ativo: plano.ativo, criado_em: plano.criado_em, atualizado_em: plano.atualizado_em, referencia: this.referencia(plano) };
  }

  private referencia(plano: Plano): string {
    return createHmac('sha256',this.chave).update(JSON.stringify([plano.id,plano.nome,plano.duracao_meses,
      plano.valor_centavos,plano.ativo,plano.criado_em,plano.atualizado_em])).digest('hex');
  }
}
