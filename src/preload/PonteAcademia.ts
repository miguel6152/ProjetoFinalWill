import { contextBridge, ipcRenderer } from 'electron';
import type { PonteAcademia as ContratoPonte } from '../shared/ipc/ContratoIpc';

class PonteAcademia {
  public expor(): void {
    if (!process.contextIsolated || !process.sandboxed) {
      throw new Error('A ponte exige isolamento de contexto e sandbox.');
    }
    const autenticacao: NonNullable<ContratoPonte['autenticacao']> = Object.freeze({
      entrar: (entrada) => ipcRenderer.invoke('auth:entrar', entrada),
      sessao: (entrada) => ipcRenderer.invoke('auth:sessao', entrada),
      sair: (entrada) => ipcRenderer.invoke('auth:sair', entrada)
    });
    const capacidades: Readonly<ContratoPonte> = Object.freeze({ autenticacao });
    contextBridge.exposeInMainWorld('academia', capacidades);
  }
}

new PonteAcademia().expor();
