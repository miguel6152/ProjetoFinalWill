export interface FiltroRelatorio { inicio: string; fim: string; aluno_id?: number; aula_id?: number }
export interface PontoEvolucao {
  id: number; realizada_em: string; instrutor_id: number; peso_kg: number; altura_cm: number;
  cintura_cm: number | null; quadril_cm: number | null; braco_cm: number | null; coxa_cm: number | null;
}
export interface EvolucaoDto { aluno_id: number; inicio: string; fim: string; pontos: PontoEvolucao[] }
export interface FrequenciaDto {
  inicio: string; fim: string;
  itens: { aluno_id: number; nome: string; presentes: number; ausentes: number; nao_registradas: number; percentual_presenca: number | null }[];
}
