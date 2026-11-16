import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { ProvisionamentoService } from '../../services/ProvisionamentoService';
import { ErroUsuario } from '../../services/ErroUsuario';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { SessaoManager } from '../seguranca/SessaoManager';
import { AutenticacaoHandler } from './AutenticacaoHandler';

type CanalInicializacao = 'inicializacao:estado' | 'inicializacao:criar-admin';

export class InicializacaoHandler {
  private readonly canais: readonly CanalInicializacao[] = ['inicializacao:estado', 'inicializacao:criar-admin'];
  private encerrado = false;

  public constructor(private readonly servico: ProvisionamentoService,
    private readonly origem: AutenticacaoHandler, private readonly sessoes: SessaoManager) {
    const registrados: CanalInicializacao[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch {
      for (const canal of registrados) ipcMain.removeHandler(canal);
      throw new ErroUsuario('INTERNO');
    }
  }

  public async atender<C extends CanalInicializacao>(canal: C,
    evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroUsuario('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento), versao = this.sessoes.versao(contexto);
      const conferir = (): void => {
        if (this.encerrado) throw new ErroUsuario('SEM_PERMISSAO');
        this.origem.contexto(evento);
        this.sessoes.conferir(contexto, versao);
      };
      if (canal === 'inicializacao:estado' ? argumentos.length > 1 || argumentos[0] !== undefined : argumentos.length !== 1) {
        throw new ErroUsuario('VALIDACAO');
      }
      const dados = canal === 'inicializacao:estado' ? this.servico.estado()
        : await this.servico.criarAdministrador(argumentos[0], conferir, contexto);
      conferir();
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const seguro = new ErroUsuario(erro instanceof ErroUsuario || erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO');
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
