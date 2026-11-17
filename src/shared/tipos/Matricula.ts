export type SituacaoMatricula = 'ativa' | 'cancelada' | 'encerrada';
export interface MatriculaDto {
  id: number; aluno_id: number; aluno_nome: string; plano_id: number; plano_nome: string;
  data_inicio: string; data_fim: string; valor_contratado_centavos: number;
  situacao: SituacaoMatricula; criado_em: string; atualizado_em: string;
}
export interface ListaMatriculas {
  pagina: number; tamanho: number; aluno_id?: number; plano_id?: number; situacao?: SituacaoMatricula;
}
