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
}
