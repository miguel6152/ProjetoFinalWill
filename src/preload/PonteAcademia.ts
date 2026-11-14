import { contextBridge } from 'electron';
import type { PonteAcademia as ContratoPonte } from '../shared/ipc/ContratoIpc';

class PonteAcademia {
  public expor(): void {
    if (!process.contextIsolated || !process.sandboxed) {
      throw new Error('A ponte exige isolamento de contexto e sandbox.');
    }
    const capacidades: Readonly<ContratoPonte> = Object.freeze({});
    contextBridge.exposeInMainWorld('academia', capacidades);
  }
}

new PonteAcademia().expor();
