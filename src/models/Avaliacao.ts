import type { AvaliacaoDto } from '../shared/tipos/Avaliacao';
export type Avaliacao = Omit<AvaliacaoDto, 'referencia'>;
