import type { PagamentoDto } from '../shared/tipos/Pagamento';

export interface Pagamento extends Omit<PagamentoDto, 'aluno_nome' | 'aluno_id' | 'cancelado_por_nome' | 'referencia'> {}
