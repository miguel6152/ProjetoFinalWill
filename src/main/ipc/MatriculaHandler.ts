import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { MatriculaService } from '../../services/MatriculaService';
import type { CanalMatricula } from '../../services/MatriculaService';
import { ErroMatricula } from '../../services/ErroMatricula';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class MatriculaHandler {
  private readonly canais: readonly CanalMatricula[] = ['matriculas:criar', 'matriculas:listar', 'matriculas:obter'];
  private encerrado = false;
  public constructor(private readonly servico: MatriculaService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalMatricula[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroMatricula('INTERNO'); }
  }

  public async atender<C extends CanalMatricula>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroMatricula('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroMatricula('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroMatricula('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroMatricula || erro instanceof ErroAutenticacao ? erro.codigo
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = new ErroMatricula(codigo);
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message,
        ...(erro instanceof ErroMatricula && erro.campos !== undefined ? { campos: erro.campos } : {}) } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
