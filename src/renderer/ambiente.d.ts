import type { PonteAcademia } from '../shared/ipc/ContratoIpc';

declare global {
  interface Window { readonly academia: Readonly<PonteAcademia> }
}
export {};
