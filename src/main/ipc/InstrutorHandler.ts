import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { InstrutorService } from '../../services/InstrutorService';
import type { CanalInstrutor } from '../../services/InstrutorService';
import { ErroInstrutor } from '../../services/ErroInstrutor';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class InstrutorHandler {
  private readonly canais: readonly CanalInstrutor[] = ['instrutores:criar', 'instrutores:listar', 'instrutores:obter', 'instrutores:atualizar', 'instrutores:excluir'];
  private encerrado = false;
  public constructor(private readonly servico: InstrutorService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalInstrutor[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroInstrutor('INTERNO'); }
  }

  public async atender<C extends CanalInstrutor>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroInstrutor('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroInstrutor('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroInstrutor('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroInstrutor || erro instanceof ErroAutenticacao ? erro.codigo
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = new ErroInstrutor(codigo);
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message,
        ...(erro instanceof ErroInstrutor && erro.campos !== undefined ? { campos: erro.campos } : {}) } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
