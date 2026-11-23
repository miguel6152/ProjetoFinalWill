import type { NovaAula } from '../shared/tipos/Aula';

export interface Aula extends NovaAula {
  id: number;
  criado_em: string;
  atualizado_em: string;
}
