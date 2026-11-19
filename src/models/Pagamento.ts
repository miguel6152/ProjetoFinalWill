import type { PagamentoDto } from '../shared/tipos/Pagamento';

export interface Pagamento extends Omit<PagamentoDto, 'aluno_nome' | 'aluno_id'> {
  criado_em: string;
  atualizado_em: string;
}
