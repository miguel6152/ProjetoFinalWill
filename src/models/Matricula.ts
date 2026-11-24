import type { SituacaoMatricula } from '../shared/tipos/Matricula';
export interface Matricula {
  id: number; aluno_id: number; plano_id: number; data_inicio: string; data_fim: string;
  valor_contratado_centavos: number; situacao: SituacaoMatricula; criado_em: string; atualizado_em: string;
}
