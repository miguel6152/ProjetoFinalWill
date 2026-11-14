import { app, BrowserWindow, dialog } from 'electron';
import { JanelaPrincipal } from './JanelaPrincipal';

class Aplicacao {
  public iniciar(): void {
    app.on('window-all-closed', (): void => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', (): void => {
      if (BrowserWindow.getAllWindows().length === 0) void this.abrirJanela();
    });
    void app.whenReady().then(() => this.abrirJanela()).catch((): void => {
      dialog.showErrorBox('Sistema de Academia', 'Não foi possível iniciar a aplicação.');
      app.exit(1);
    });
  }

  private async abrirJanela(): Promise<void> {
    try {
      await new JanelaPrincipal().abrir();
    } catch {
      dialog.showErrorBox('Sistema de Academia', 'Não foi possível abrir a interface. Execute o build novamente.');
      app.exit(1);
    }
  }
}

new Aplicacao().iniciar();
