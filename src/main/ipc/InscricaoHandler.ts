import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { InscricaoService } from '../../services/InscricaoService';
import type { CanalInscricao } from '../../services/InscricaoService';
import { ErroInscricao } from '../../services/ErroInscricao';
import { ErroRepository } from '../../repositories/ErroRepository';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class InscricaoHandler {
  private readonly canais: readonly CanalInscricao[] = ['inscricoes:criar', 'inscricoes:listar', 'inscricoes:obter', 'inscricoes:atualizar', 'inscricoes:excluir'];
  private encerrado = false;
  public constructor(private readonly servico: InscricaoService, private readonly origem: AutenticacaoHandler) {
    const registrados: CanalInscricao[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch { for (const canal of registrados) ipcMain.removeHandler(canal); throw new ErroInscricao('INTERNO'); }
  }

  public async atender<C extends CanalInscricao>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      if (this.encerrado || !this.canais.includes(canal)) throw new ErroInscricao('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento);
      if (argumentos.length !== 1) throw new ErroInscricao('VALIDACAO');
      const dados = await this.servico.executar(canal, argumentos[0], contexto, () => {
        if (this.encerrado) throw new ErroInscricao('SEM_PERMISSAO');
        this.origem.contexto(evento);
      });
      this.origem.contexto(evento);
      return { sucesso: true, dados: dados as ContratoIpc[C]['saida'] };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroInscricao || erro instanceof ErroAutenticacao ? erro.codigo
        : erro instanceof ErroRepository && erro.codigo === 'CONFLITO' ? 'CONFLITO' : 'INTERNO';
      const seguro = new ErroInscricao(codigo);
      return { sucesso: false, erro: { codigo: seguro.codigo, mensagem: seguro.message,
        ...(erro instanceof ErroInscricao && erro.campos !== undefined ? { campos: erro.campos } : {}) } };
    }
  }

  public encerrar(): void {
    this.encerrado = true;
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }
}
