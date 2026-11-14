import { BrowserWindow, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class JanelaPrincipal {
  public async abrir(visivel: boolean = true): Promise<BrowserWindow> {
    const pagina: string = path.join(__dirname, '../renderer/index.html');
    const urlPermitida: string = pathToFileURL(pagina).href;
    const sessao = session.fromPartition('academia');
    sessao.setPermissionRequestHandler((_conteudo, _permissao, responder): void => responder(false));
    sessao.setPermissionCheckHandler((): boolean => false);
    const janela = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      title: 'Sistema de Academia',
      webPreferences: {
        preload: path.join(__dirname, '../preload/PonteAcademia.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        session: sessao
      }
    });
    janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    janela.webContents.on('will-navigate', (evento, destino): void => {
      if (destino !== urlPermitida) evento.preventDefault();
    });
    janela.webContents.on('will-attach-webview', (evento): void => evento.preventDefault());
    janela.removeMenu();
    try {
      await janela.loadFile(pagina);
      if (visivel) janela.show();
      return janela;
    } catch {
      janela.destroy();
      throw new Error('Não foi possível carregar a janela principal.');
    }
  }
}
