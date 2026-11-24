import { BrowserWindow, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PreparacaoDemonstracaoHandler } from './demo/PreparacaoDemonstracaoHandler';

export class JanelaPrepararDemonstracao {
  public async abrir(visivel = true): Promise<BrowserWindow> {
    const pagina = path.join(__dirname, '../renderer/PrepararDemonstracao.html');
    const urlPermitida = pathToFileURL(pagina).href;
    const sessao = session.fromPartition('academia-demo-setup');
    sessao.setPermissionRequestHandler((_conteudo, _permissao, responder): void => responder(false));
    sessao.setPermissionCheckHandler((): boolean => false);
    const janela = new BrowserWindow({
      width: 560,
      height: 600,
      resizable: false,
      show: false,
      title: 'Preparar demonstração',
      webPreferences: {
        preload: path.join(__dirname, '../preload/PontePreparacaoDemonstracao.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        session: sessao
      }
    });
    let preparando = false;
    janela.on('close', (evento): void => { if (preparando) evento.preventDefault(); });
    janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    janela.webContents.on('will-navigate', (evento, destino): void => {
      if (destino !== urlPermitida) evento.preventDefault();
    });
    janela.webContents.on('will-attach-webview', (evento): void => evento.preventDefault());
    janela.removeMenu();
    const handler = new PreparacaoDemonstracaoHandler(janela, urlPermitida, estado => { preparando = estado; });
    handler.registrar();
    try {
      await janela.loadFile(pagina);
      if (visivel) janela.show();
      return janela;
    } catch {
      janela.destroy();
      throw new Error('Não foi possível abrir a tela de preparação da demonstração.');
    }
  }
}
