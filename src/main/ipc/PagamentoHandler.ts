import { ZodError } from 'zod';
import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { PagamentoService } from '../../services/PagamentoService';
import type { CanalPagamento } from '../../services/PagamentoService';
import { ErroPagamento } from '../../services/ErroPagamento';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class PagamentoHandler {
  private readonly canais: readonly CanalPagamento[] = ['pagamentos:criar', 'pagamentos:listar', 'pagamentos:obter', 'pagamentos:quitar'];
  private encerrado = false;
  public constructor(private readonly servico: PagamentoService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalPagamento[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroPagamento('INTERNO'); }
  }

  public async atender<C extends CanalPagamento>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroPagamento('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroPagamento('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroPagamento('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroAutenticacao || erro instanceof ErroPagamento ? erro.codigo
        : erro instanceof ZodError ? 'VALIDACAO'
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = erro instanceof ErroPagamento ? erro : new ErroPagamento(codigo);
      return { sucesso: false, erro: { codigo, mensagem: seguro.message } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
