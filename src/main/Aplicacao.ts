import { app, BrowserWindow, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { JanelaPrincipal } from './JanelaPrincipal';
import { Composicao } from './Composicao';
import path from 'node:path';
import { IdentidadeAplicacao } from '../shared/IdentidadeAplicacao';
import { JanelaPrepararDemonstracao } from './JanelaPrepararDemonstracao';

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
    if (process.argv.includes('--preparar-demo')) {
      void app.whenReady().then(async (): Promise<void> => { await new JanelaPrepararDemonstracao().abrir(); }).catch((): void => {
        dialog.showErrorBox('Preparar demonstração', 'Não foi possível abrir a tela de preparação. Nenhum banco foi alterado.');
        app.exit(1);
      });
      return;
    }
    void app.whenReady().then((): Promise<void> => {
      const demo = process.argv.includes('--demo');
      const banco = path.join(app.getPath('userData'), demo ? 'academia-demo.sqlite3' : 'academia.sqlite3');
      if (demo && !existsSync(banco)) {
        dialog.showErrorBox('Modo demonstração', 'O banco de demonstração ainda não foi preparado. Use o atalho “Preparar demonstração” no Menu Iniciar.');
        app.exit(1);
        return Promise.resolve();
      }
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
