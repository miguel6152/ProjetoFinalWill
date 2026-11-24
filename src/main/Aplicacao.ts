import { app, BrowserWindow, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { JanelaPrincipal } from './JanelaPrincipal';
import { Composicao } from './Composicao';
import path from 'node:path';
import { IdentidadeAplicacao } from '../shared/IdentidadeAplicacao';

class Aplicacao {
  private readonly composicao: Composicao = new Composicao();

  public iniciar(): void {
    IdentidadeAplicacao.configurar(app);
    // A composição já capturou o token no Main. Os processos das janelas não precisam herdá-lo.
    delete process.env.TELEGRAM_BOT_TOKEN;
    app.on('before-quit', (): void => this.composicao.encerrar());
    app.on('window-all-closed', (): void => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', (): void => {
      if (BrowserWindow.getAllWindows().length === 0) void this.abrirJanela();
    });
    void app.whenReady().then((): Promise<void> => {
      const demo = process.argv.includes('--demo');
      const banco = path.join(app.getPath('userData'), demo ? 'academia-demo.sqlite3' : 'academia.sqlite3');
      if (demo && !existsSync(banco)) throw new Error('Banco demo ausente. Execute npm run demo:seed primeiro.');
      this.composicao.iniciar(banco);
      return this.abrirJanela();
    }).catch((): void => {
      this.composicao.encerrar();
      dialog.showErrorBox('Sistema de Academia', 'Não foi possível preparar o banco. Verifique as permissões da pasta de dados e a versão da aplicação. Nenhum dado foi descartado.');
      app.exit(1);
    });
  }

  private async abrirJanela(): Promise<void> {
    try {
      await new JanelaPrincipal().abrir(true, (janela, url): void => this.composicao.vincularJanela(janela, url));
    } catch {
      this.composicao.encerrar();
      dialog.showErrorBox('Sistema de Academia', 'Não foi possível abrir a interface. Execute o build novamente.');
      app.exit(1);
    }
  }
}

new Aplicacao().iniciar();
