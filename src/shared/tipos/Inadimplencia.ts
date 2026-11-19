export interface FiltroInadimplencia {
  busca?: string | undefined;
  inicio?: string | undefined;
  fim?: string | undefined;
  ordem: 'atraso' | 'valor';
}

export interface MensalidadeVencida {
  id: number;
  matricula_id: number;
  competencia: string;
  data_vencimento: string;
  valor_centavos: number;
  dias_atraso: number;
}

export interface DividaAluno {
  aluno_id: number;
  nome: string;
  quantidade: number;
  total_centavos: number;
  vencimento_mais_antigo: string;
  mensalidades: MensalidadeVencida[];
}

export interface ResumoInadimplencia {
  data_referencia: string;
  quantidade_alunos: number;
  total_centavos: number;
  alunos: DividaAluno[];
}
