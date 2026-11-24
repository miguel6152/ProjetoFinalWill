import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { AutenticacaoHandler } from './AutenticacaoHandler';
import type { RelatorioService } from '../../services/RelatorioService';
import type { SessaoManager } from '../seguranca/SessaoManager';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import type { Resultado } from '../../shared/ipc/ContratoIpc';
import type { EvolucaoDto, FrequenciaDto } from '../../shared/tipos/Relatorio';

export class RelatorioHandler {
  private encerrado = false;
  public constructor(private readonly servico: RelatorioService, private readonly origem: AutenticacaoHandler,
    private readonly sessoes: SessaoManager) {
    for (const tipo of ['evolucao','frequencia'] as const)
      ipcMain.handle('relatorios:' + tipo, (evento, ...args: unknown[]) => this.atender(tipo, evento, args));
  }
  private async atender(tipo: 'evolucao' | 'frequencia', evento: IpcMainInvokeEvent, args: unknown[]): Promise<Resultado<EvolucaoDto | FrequenciaDto>> {
    try {
      const contexto = this.origem.contexto(evento), versao = this.sessoes.versao(contexto);
      if (this.encerrado) throw new ErroAutenticacao('NAO_AUTENTICADO');
      if (args.length !== 1) throw new ErroAutenticacao('VALIDACAO');
      const dados = await this.servico.consultar(tipo, args[0], contexto);
      this.origem.contexto(evento); this.sessoes.conferir(contexto, versao);
      if (this.encerrado) throw new ErroAutenticacao('NAO_AUTENTICADO');
      return { sucesso: true, dados };
    } catch (erro: unknown) {
      const codigo = erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO';
      const mensagens = { VALIDACAO: 'Confira os filtros e o período máximo de 366 dias.',
        NAO_AUTENTICADO: 'Sua sessão terminou. Entre novamente.', SEM_PERMISSAO: 'Você não tem permissão para este relatório.',
        INTERNO: 'API de relatórios indisponível. Tente novamente.' };
      return { sucesso: false, erro: { codigo, mensagem: mensagens[codigo] } };
    }
  }
  public encerrar(): void {
    this.encerrado = true;
    ipcMain.removeHandler('relatorios:evolucao'); ipcMain.removeHandler('relatorios:frequencia');
  }
}
