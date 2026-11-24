import type { NovoPlano } from '../shared/tipos/Plano';

export interface Plano extends NovoPlano {
  id: number;
  criado_em: string;
  atualizado_em: string;
}
