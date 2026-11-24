export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao' | 'transferencia';
export type SituacaoPagamento = 'pendente' | 'pago' | 'cancelado';

export interface NovaMensalidade {
  matricula_id: number;
  competencia: string;
  data_vencimento: string;
  valor_centavos: number;
}

export interface Recebimento {
  id: number;
  data: string;
  forma_pagamento: FormaPagamento;
}

export type AlteracoesPagamento = Partial<Pick<NovaMensalidade, 'competencia' | 'data_vencimento' | 'valor_centavos'>>;

export interface AtualizacaoPagamento {
  id: number;
  referencia: string;
  alteracoes: AlteracoesPagamento;
}

export interface CancelamentoPagamento {
  id: number;
  referencia: string;
  motivo: string;
}

export interface FiltroPagamentos {
  pagina: number;
  tamanho: number;
  aluno_id?: number;
  competencia?: string;
  situacao?: SituacaoPagamento;
}

export interface PagamentoDto extends NovaMensalidade {
  id: number;
  aluno_nome: string;
  aluno_id: number;
  situacao: SituacaoPagamento;
  pago_em: string | null;
  forma_pagamento: FormaPagamento | null;
  criado_em: string;
  atualizado_em: string;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  cancelado_por: number | null;
  cancelado_por_nome: string | null;
  referencia?: string;
}
