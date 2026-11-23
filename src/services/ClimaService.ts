import { z } from 'zod';
import type { AulaDto } from '../shared/tipos/Aula';
import type { ClimaDto, PrevisaoHora } from '../shared/tipos/Clima';

export class ClimaService {
  private readonly cache = new Map<string, { expira: number; dados: ClimaDto }>();
  private static readonly resposta = z.object({
    hourly_units: z.object({ time: z.literal('unixtime'), precipitation: z.literal('mm'), precipitation_probability: z.literal('%') }),
    hourly: z.object({
      time: z.array(z.number().int().safe()).max(500),
      precipitation: z.array(z.number().nonnegative().nullable()).max(500),
      precipitation_probability: z.array(z.number().min(0).max(100).nullable()).max(500)
    })
  });

  public constructor(private readonly transporte: typeof fetch = fetch,
    private readonly agora: () => number = Date.now,
    private readonly limiar = Number(process.env.CLIMA_LIMIAR_PERCENTUAL ?? 60),
    private readonly prazoMs = 8000, private readonly simulacao = false) {
    if (!Number.isFinite(limiar) || limiar < 0 || limiar > 100) throw new Error('Limiar de chuva inválido.');
  }

  public async consultar(aula: AulaDto): Promise<ClimaDto> {
    const instante = this.agora();
    const vazio: ClimaDto = { disponivel: false, motivo: null, origem: 'local',
      consultado_em: new Date(instante).toISOString(), limiar: this.limiar, alerta: null, horas: [] };
    if (!aula.ao_ar_livre) return { ...vazio, motivo: 'Aula interna.' };
    const inicio = Date.parse(aula.inicio_em), fim = Date.parse(aula.fim_em);
    const hoje = Math.floor(instante / 86400000) * 86400000;
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio || inicio < hoje || fim >= hoje + 16 * 86400000)
      return { ...vazio, motivo: 'Data fora do horizonte de previsão.' };
    if (aula.latitude === null || aula.longitude === null || !Number.isFinite(aula.latitude) ||
        !Number.isFinite(aula.longitude) || Math.abs(aula.latitude) > 90 || Math.abs(aula.longitude) > 180)
      return { ...vazio, motivo: 'Coordenadas indisponíveis.' };
    const chave = JSON.stringify([aula.latitude, aula.longitude, inicio, fim]);
    const salvo = this.cache.get(chave);
    if (salvo && salvo.expira > instante) return { ...salvo.dados, origem: this.simulacao ? 'simulacao' : 'cache' };
    const controle = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const prazo = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => { controle.abort(); rejeitar(new Error('Tempo limite da consulta excedido.')); }, this.prazoMs);
      });
      const dados = await Promise.race([this.obter(aula, inicio, fim, vazio, controle.signal), prazo]);
      if (dados.disponivel) {
        if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(chave, { expira: instante + 300000, dados });
      }
      return dados;
    } catch {
      return { ...vazio, motivo: 'Previsão indisponível. O provedor falhou ou excedeu o tempo limite.' };
    } finally { clearTimeout(temporizador); controle.abort(); }
  }

  private async obter(aula: AulaDto, inicio: number, fim: number, base: ClimaDto, signal: AbortSignal): Promise<ClimaDto> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(aula.latitude), longitude: String(aula.longitude),
      hourly: 'precipitation_probability,precipitation', precipitation_unit: 'mm',
      timezone: 'UTC', timeformat: 'unixtime', forecast_days: '16' }).toString();
    const resposta = await this.transporte(url, { signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!resposta.ok) { await resposta.body?.cancel(); throw new Error('Provedor indisponível.'); }
    const validado = ClimaService.resposta.parse(await resposta.json()).hourly;
    if (validado.time.length !== validado.precipitation.length || validado.time.length !== validado.precipitation_probability.length ||
        validado.time.some((hora, i) => i > 0 && hora - validado.time[i - 1]! !== 3600)) throw new Error('Série horária inválida.');
    const horas: PrevisaoHora[] = [];
    // Os dois campos descrevem a hora que termina no timestamp fornecido.
    for (let final = Math.floor(inicio / 3600000) * 3600000 + 3600000; final - 3600000 < fim; final += 3600000) {
      const indice = validado.time.indexOf(final / 1000);
      horas.push({ inicio_em: new Date(final - 3600000).toISOString(), fim_em: new Date(final).toISOString(),
        probabilidade_chuva: validado.precipitation_probability[indice] ?? null,
        precipitacao_mm: validado.precipitation[indice] ?? null });
    }
    const completa = horas.every(hora => hora.probabilidade_chuva !== null && hora.precipitacao_mm !== null);
    return { ...base, origem: this.simulacao ? 'simulacao' : 'provedor', horas, disponivel: completa,
      motivo: completa ? null : 'Previsão parcial ou fora do horizonte do provedor.',
      alerta: completa ? horas.some(hora => hora.probabilidade_chuva! >= this.limiar) : null };
  }
}
