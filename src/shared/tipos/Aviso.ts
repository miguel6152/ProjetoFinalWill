export interface EventoVencimento {
  matricula_id: number;
  data_alvo: string;
  antecedencia_dias: number;
  tipo: 'vencimento_plano';
}

export interface AvisoDto extends EventoVencimento {
  id: number;
  aluno_nome: string;
  criado_em: string;
  lido_em: string | null;
  invalidado_em: string | null;
}

export interface FiltroAvisos {
  busca: string;
  estado: 'ativos' | 'nao_lidos' | 'lidos' | 'invalidados' | 'todos';
}
