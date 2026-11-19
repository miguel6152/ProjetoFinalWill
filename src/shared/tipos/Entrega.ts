export type ModoEntrega = 'simulado' | 'telegram';
export type EstadoTentativa = 'processando' | 'enviado' | 'simulado' | 'falhou' | 'incerto';
export interface TentativaDto {
  numero: number;
  modo: ModoEntrega;
  estado: EstadoTentativa;
  inicio: string;
  fim: string | null;
  motivo: string | null;
  proxima: string | null;
  mensagem_id: string | null;
}
export interface EntregaDto {
  modo: ModoEntrega;
  estado: EstadoTentativa | 'pendente' | 'inelegivel';
  motivo: string;
  pode_processar: boolean;
  tentativas: TentativaDto[];
}
export interface PreferenciaDto { id: number; nome: string; vinculado: boolean; autorizado: boolean; }
export interface AlterarPreferencia { id: number; chat: string | null; autorizar: boolean; }
