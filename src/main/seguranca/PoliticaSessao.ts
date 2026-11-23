import { z } from 'zod';
import { ErroAutenticacao } from './ErroAutenticacao';

export class PoliticaSessao {
  public readonly inatividadeMs: number;
  public readonly duracaoMaximaMs: number;
  private readonly relogio: () => number;

  public constructor(opcoes: { inatividadeMs?: number; duracaoMaximaMs?: number; agora?: () => number } = {}) {
    const entrada = z.object({ inatividadeMs: z.number().int().positive().safe(), duracaoMaximaMs: z.number().int().positive().safe() })
      .refine(v => v.duracaoMaximaMs >= v.inatividadeMs).safeParse({
        inatividadeMs: opcoes.inatividadeMs ?? 30 * 60_000,
        duracaoMaximaMs: opcoes.duracaoMaximaMs ?? 8 * 60 * 60_000
      });
    if (!entrada.success) throw new ErroAutenticacao('INTERNO');
    this.inatividadeMs = entrada.data.inatividadeMs;
    this.duracaoMaximaMs = entrada.data.duracaoMaximaMs;
    this.relogio = opcoes.agora ?? Date.now;
  }

  public static doAmbiente(ambiente: NodeJS.ProcessEnv = process.env): PoliticaSessao {
    return new PoliticaSessao({
      ...(ambiente.SESSAO_INATIVIDADE_MS === undefined ? {} : { inatividadeMs: Number(ambiente.SESSAO_INATIVIDADE_MS) }),
      ...(ambiente.SESSAO_DURACAO_MAXIMA_MS === undefined ? {} : { duracaoMaximaMs: Number(ambiente.SESSAO_DURACAO_MAXIMA_MS) })
    });
  }

  public agora(): number {
    const agora = this.relogio();
    if (!Number.isSafeInteger(agora) || agora < 0) throw new ErroAutenticacao('INTERNO');
    return agora;
  }

  public vencida(inicio: number, ultimoUso: number, agora: number): boolean {
    return agora < inicio || agora < ultimoUso || agora - inicio >= this.duracaoMaximaMs || agora - ultimoUso >= this.inatividadeMs;
  }
}
