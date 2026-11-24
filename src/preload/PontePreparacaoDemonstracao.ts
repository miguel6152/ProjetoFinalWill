import { contextBridge, ipcRenderer } from 'electron';
import type { PontePreparacaoDemonstracao } from '../shared/PreparacaoDemonstracao';

class PontePreparacaoDemo {
  public expor(): void {
    if (!process.contextIsolated || !process.sandboxed) throw new Error('A preparação demo exige sandbox e isolamento.');
    const ponte: Readonly<PontePreparacaoDemonstracao> = Object.freeze({
      preparar: (senha: string, confirmacao: string) => ipcRenderer.invoke('demo:preparar', senha, confirmacao),
      abrir: () => ipcRenderer.invoke('demo:abrir'),
      cancelar: () => ipcRenderer.invoke('demo:cancelar')
    });
    contextBridge.exposeInMainWorld('preparacaoDemo', ponte);
  }
}

new PontePreparacaoDemo().expor();
