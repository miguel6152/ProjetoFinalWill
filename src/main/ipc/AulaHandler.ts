import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { AulaService } from '../../services/AulaService';
import type { CanalAula } from '../../services/AulaService';
import { ErroAula } from '../../services/ErroAula';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class AulaHandler {
  private readonly canais: readonly CanalAula[] = ['aulas:criar', 'aulas:listar', 'aulas:obter', 'aulas:atualizar', 'aulas:excluir'];
  private encerrado = false;
  public constructor(private readonly servico: AulaService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalAula[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroAula('INTERNO'); }
  }

  public async atender<C extends CanalAula>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroAula('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroAula('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroAula('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroAula || erro instanceof ErroAutenticacao ? erro.codigo
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = new ErroAula(codigo);
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message,
        ...(erro instanceof ErroAula && erro.campos !== undefined ? { campos: erro.campos } : {}) } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
