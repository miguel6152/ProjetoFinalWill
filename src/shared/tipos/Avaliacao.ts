export interface NovaAvaliacao {
  aluno_id:number;
  instrutor_id?:number | undefined;
  realizada_em:string;
  peso_kg:number;
  altura_cm:number;
  cintura_cm?:number | null | undefined;
  quadril_cm?:number | null | undefined;
  braco_cm?:number | null | undefined;
  coxa_cm?:number | null | undefined;
  observacoes?:string | null | undefined;
}
export interface AvaliacaoDto {
  id:number; aluno_id:number; instrutor_id:number; realizada_em:string;
  peso_kg:number; altura_cm:number; cintura_cm:number|null; quadril_cm:number|null;
  braco_cm:number|null; coxa_cm:number|null; observacoes:string|null;
  criado_em:string; atualizado_em:string; referencia:string;
}
export interface FiltroAvaliacoes {pagina:number;tamanho:number;aluno_id?:number|undefined;inicio?:string|undefined;fim?:string|undefined}
