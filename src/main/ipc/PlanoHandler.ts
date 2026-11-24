import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { PlanoService } from '../../services/PlanoService';
import type { CanalPlano } from '../../services/PlanoService';
import { ErroPlano } from '../../services/ErroPlano';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class PlanoHandler {
  private readonly canais: readonly CanalPlano[] = ['planos:criar', 'planos:listar', 'planos:obter', 'planos:atualizar', 'planos:excluir'];
  private encerrado = false;
  public constructor(private readonly servico: PlanoService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalPlano[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroPlano('INTERNO'); }
  }

  public async atender<C extends CanalPlano>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroPlano('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroPlano('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroPlano('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroPlano || erro instanceof ErroAutenticacao ? erro.codigo
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = new ErroPlano(codigo);
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message,
        ...(erro instanceof ErroPlano && erro.campos !== undefined ? { campos: erro.campos } : {}) } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
