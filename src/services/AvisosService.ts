import type { NotificacaoRepository } from '../repositories/NotificacaoRepository';
import { DataAcademia } from './DataAcademia';

export class AvisosService {
  // Ordem crescente: o primeiro marco alcançado é o mais recente.
  private static readonly marcos = [0, 3, 7] as const;
  private static readonly intervalo = 30 * 60 * 1000;
  private timer?: ReturnType<typeof setInterval> | undefined;

  public constructor(private readonly avisos: NotificacaoRepository) {}

  public static marco(diasRestantes: number): number | undefined {
    return diasRestantes < 0 ? undefined : this.marcos.find(dias => diasRestantes <= dias);
  }

  public verificar(agora = new Date()): { criados: number } {
    const hoje = DataAcademia.civil(agora), instante = agora.toISOString();
    return this.avisos.transacao(() => {
      this.avisos.expirar(hoje, instante);
      let criados = 0;
      for (const m of this.avisos.vigencias(hoje, Math.max(...AvisosService.marcos))) {
        const marco = AvisosService.marco(m.dias);
        if (marco !== undefined) {
          criados += this.avisos.registrar({ matricula_id: m.id, tipo: 'vencimento_plano',
            data_alvo: m.data_fim, antecedencia_dias: marco }, instante);
        }
      }
      return { criados };
    });
  }

  public iniciar(): void {
    if (this.timer) return;
    this.verificar();
    this.timer = setInterval(() => {
      try { this.verificar(); } catch { console.error('Falha na verificação periódica de avisos.'); }
    }, AvisosService.intervalo);
    this.timer.unref();
  }

  public encerrar(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
