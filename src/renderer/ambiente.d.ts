import type { PonteAcademia } from '../shared/ipc/ContratoIpc';
import type { PontePreparacaoDemonstracao } from '../shared/PreparacaoDemonstracao';

declare global {
  interface Window {
    readonly academia: Readonly<PonteAcademia>;
    readonly preparacaoDemo?: Readonly<PontePreparacaoDemonstracao>;
  }
}
export {};
