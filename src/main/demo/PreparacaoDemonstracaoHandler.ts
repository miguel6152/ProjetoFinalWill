import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { PreparadorDemonstracao } from './PreparadorDemonstracao';
import type { RespostaPreparacaoDemonstracao } from '../../shared/PreparacaoDemonstracao';

export class PreparacaoDemonstracaoHandler {
  private processando = false;
  private preparada = false;
  private readonly preparador = new PreparadorDemonstracao();

  public constructor(
    private readonly janela: BrowserWindow,
    private readonly urlPermitida: string,
    private readonly aoPreparar: (preparando: boolean) => void
  ) {}

  public registrar(): void {
    ipcMain.handle('demo:preparar', (evento: IpcMainInvokeEvent, senha: unknown, confirmacao: unknown) =>
      this.preparar(evento, senha, confirmacao));
    ipcMain.handle('demo:abrir', (evento: IpcMainInvokeEvent) => {
      if (!this.origemValida(evento) || !this.preparada) throw new Error('Prepare o banco de demonstração antes de abri-lo.');
      const argumentos = process.argv.slice(1).filter(argumento => argumento !== '--preparar-demo' && argumento !== '--demo');
      app.relaunch({ args: [...argumentos, '--demo'] });
      app.quit();
    });
    ipcMain.handle('demo:cancelar', (evento: IpcMainInvokeEvent) => {
      if (!this.origemValida(evento)) throw new Error('Origem da solicitação inválida.');
      if (this.processando) return false;
      this.janela.close();
      return true;
    });
    this.janela.once('closed', () => {
      ipcMain.removeHandler('demo:preparar');
      ipcMain.removeHandler('demo:abrir');
      ipcMain.removeHandler('demo:cancelar');
    });
  }

  private async preparar(evento: IpcMainInvokeEvent, senha: unknown, confirmacao: unknown): Promise<RespostaPreparacaoDemonstracao> {
    if (!this.origemValida(evento)) throw new Error('Origem da solicitação inválida.');
    if (this.processando) return { sucesso: false, mensagem: 'A preparação já está em andamento.' };
    if (typeof senha !== 'string' || typeof confirmacao !== 'string') {
      return { sucesso: false, mensagem: 'Informe e confirme uma senha.' };
    }
    this.processando = true;
    this.aoPreparar(true);
    try {
      const estado = await this.preparador.executar(app.getPath('userData'), senha, confirmacao);
      this.preparada = true;
      return { sucesso: true, estado };
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : '';
      const permitidas = [
        'A senha precisa ter pelo menos 15 caracteres.',
        'A senha excede o limite de 1024 bytes.',
        'As senhas não coincidem.',
        'Já existe um banco demo não reconhecido; nada foi alterado.',
        'Banco demo incompleto; nada foi alterado.',
        'Banco demo com vínculos inválidos; nada foi alterado.'
      ];
      return { sucesso: false, mensagem: permitidas.includes(mensagem)
        ? mensagem
        : 'Não foi possível preparar a demonstração. Os bancos existentes foram preservados.' };
    } finally {
      this.processando = false;
      this.aoPreparar(false);
    }
  }

  private origemValida(evento: IpcMainInvokeEvent): boolean {
    return evento.sender === this.janela.webContents && evento.senderFrame?.url === this.urlPermitida;
  }
}
