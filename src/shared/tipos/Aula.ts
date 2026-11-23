export interface NovaAula {
  instrutor_id: number;
  modalidade: 'musculacao' | 'funcional' | 'danca';
  inicio_em: string;
  fim_em: string;
  capacidade: number;
  situacao: 'agendada' | 'cancelada' | 'concluida';
  local: string;
  ao_ar_livre: number;
  latitude: number | null;
  longitude: number | null;
}
export interface FiltroAgenda {
  pagina: number;
  tamanho: number;
  inicio?: string | undefined;
  fim?: string | undefined;
  instrutor_id?: number | undefined;
}
export interface AulaDto extends NovaAula {
  id: number;
  criado_em: string;
  atualizado_em: string;
  /** Referência de concorrência emitida pelo Main; não concede permissão. */
  referencia: string;
}
