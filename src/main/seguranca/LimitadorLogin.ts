import { z } from 'zod';
import type { ContextoSessao } from './ContratosAutenticacao';
import { ErroAutenticacao } from './ErroAutenticacao';

/** Limites do processo, sem bloquear contas por email alegado por terceiros. */
export class LimitadorLogin {
  private tentativas: { instante: number; contexto: number }[] = [];
  private concorrentes = 0;
  private ultimoInstante = 0;
  private readonly limites: { porJanela: number; porProcesso: number; simultaneos: number; intervaloMs: number };
  private readonly relogio: () => number;

  public constructor(opcoes: { porJanela?: number; porProcesso?: number; simultaneos?: number; intervaloMs?: number; agora?: () => number } = {}) {
    const positivo = z.number().int().positive().safe();
    const entrada = z.object({ porJanela: positivo.max(10000), porProcesso: positivo.max(10000), simultaneos: positivo.max(16), intervaloMs: positivo })
      .refine(v => v.porJanela <= v.porProcesso).safeParse({ porJanela: opcoes.porJanela ?? 30,
        porProcesso: opcoes.porProcesso ?? 120, simultaneos: opcoes.simultaneos ?? 4, intervaloMs: opcoes.intervaloMs ?? 60_000 });
    if (!entrada.success) throw new ErroAutenticacao('INTERNO');
    this.limites = entrada.data; this.relogio = opcoes.agora ?? Date.now;
  }

  public static doAmbiente(ambiente: NodeJS.ProcessEnv = process.env): LimitadorLogin {
    return new LimitadorLogin({
      ...(ambiente.LOGIN_POR_JANELA === undefined ? {} : { porJanela: Number(ambiente.LOGIN_POR_JANELA) }),
      ...(ambiente.LOGIN_POR_PROCESSO === undefined ? {} : { porProcesso: Number(ambiente.LOGIN_POR_PROCESSO) }),
      ...(ambiente.LOGIN_SIMULTANEOS === undefined ? {} : { simultaneos: Number(ambiente.LOGIN_SIMULTANEOS) })
    });
  }

  public admitir(contexto: ContextoSessao): () => void {
    if (!Number.isSafeInteger(contexto.webContentsId) || contexto.webContentsId < 1) throw new ErroAutenticacao('VALIDACAO');
    const agora = this.relogio();
    if (!Number.isSafeInteger(agora) || agora < this.ultimoInstante) throw new ErroAutenticacao('SEM_PERMISSAO');
    this.ultimoInstante = agora;
    this.tentativas = this.tentativas.filter(t => agora - t.instante < this.limites.intervaloMs);
    if (this.concorrentes >= this.limites.simultaneos || this.tentativas.length >= this.limites.porProcesso
      || this.tentativas.filter(t => t.contexto === contexto.webContentsId).length >= this.limites.porJanela) {
      throw new ErroAutenticacao('SEM_PERMISSAO');
    }
    this.tentativas.push({ instante: agora, contexto: contexto.webContentsId });
    this.concorrentes++;
    let liberada = false;
    return (): void => { if (!liberada) { liberada = true; this.concorrentes--; } };
  }
}
