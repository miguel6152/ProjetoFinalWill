import type { NovoInstrutor } from '../shared/tipos/Instrutor';

export interface Instrutor extends NovoInstrutor {
  id: number;
  criado_em: string;
  atualizado_em: string;
}
