export interface PrevisaoHora {
  inicio_em: string;
  fim_em: string;
  probabilidade_chuva: number | null;
  precipitacao_mm: number | null;
}
export interface ClimaDto {
  disponivel: boolean;
  motivo: string | null;
  origem: 'provedor' | 'cache' | 'simulacao' | 'local';
  consultado_em: string;
  limiar: number;
  alerta: boolean | null;
  horas: PrevisaoHora[];
}
