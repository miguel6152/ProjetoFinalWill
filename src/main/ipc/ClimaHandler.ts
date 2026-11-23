import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { Resultado } from '../../shared/ipc/ContratoIpc';
import type { AulaDto } from '../../shared/tipos/Aula';
import type { ClimaDto } from '../../shared/tipos/Clima';
import type { AulaService } from '../../services/AulaService';
import type { ClimaService } from '../../services/ClimaService';
import type { SessaoManager } from '../seguranca/SessaoManager';
import { ErroAula } from '../../services/ErroAula';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import type { AutenticacaoHandler } from './AutenticacaoHandler';

export class ClimaHandler {
  private encerrado = false;
  public constructor(private readonly clima: ClimaService, private readonly aulas: AulaService,
    private readonly origem: AutenticacaoHandler, private readonly sessoes: SessaoManager) {
    ipcMain.handle('clima:consultar-aula', (evento, ...argumentos: unknown[]) => this.atender(evento, argumentos));
  }
  public async atender(evento: Pick<IpcMainInvokeEvent,'sender'|'senderFrame'>, argumentos: unknown[]): Promise<Resultado<ClimaDto>> {
    try {
      const contexto = this.origem.contexto(evento), versao = this.sessoes.versao(contexto);
      const conferir = (): void => {
        if (this.encerrado) throw new ErroAula('SEM_PERMISSAO');
        this.origem.contexto(evento); this.sessoes.conferir(contexto, versao);
      };
      conferir();
      if (argumentos.length !== 1) throw new ErroAula('VALIDACAO');
      const aula = await this.aulas.executar('aulas:obter', argumentos[0], contexto, conferir) as AulaDto;
      const previsao = await this.clima.consultar(aula);
      conferir();
      const atual = await this.aulas.executar('aulas:obter', argumentos[0], contexto, conferir) as AulaDto;
      if (atual.referencia !== aula.referencia) throw new ErroAula('CONFLITO');
      return { sucesso: true, dados: previsao };
    } catch (erro: unknown) {
      const seguro = new ErroAula(erro instanceof ErroAula || erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO');
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message } };
    }
  }
  public encerrar(): void { this.encerrado = true; ipcMain.removeHandler('clima:consultar-aula'); }
}
