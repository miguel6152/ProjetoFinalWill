import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import { ViaCepService } from '../../services/ViaCepService';
import { ErroEndereco } from '../../services/ErroEndereco';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { Autorizador } from '../seguranca/Autorizador';
import { SessaoManager } from '../seguranca/SessaoManager';
import { AutenticacaoHandler } from './AutenticacaoHandler';

export class EnderecoHandler {
  private encerrado = false;
  public constructor(private readonly servico: ViaCepService, private readonly origem: AutenticacaoHandler,
    private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {
    ipcMain.handle('endereco:consultar-cep', (evento, ...argumentos: unknown[]) => this.atender(evento, argumentos));
  }

  public async atender(evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc['endereco:consultar-cep']['saida']>> {
    try {
      if (this.encerrado) throw new ErroAutenticacao('SEM_PERMISSAO');
      const contexto = this.origem.contexto(evento), versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
      const conferir = (): void => {
        if (this.encerrado) throw new ErroAutenticacao('SEM_PERMISSAO');
        this.origem.contexto(evento); this.sessoes.conferir(contexto, versao);
        if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroAutenticacao('NAO_AUTENTICADO');
      };
      await this.autorizador.exigirPerfil(contexto, ['admin', 'recepcao']); conferir();
      if (argumentos.length !== 1) throw new ErroAutenticacao('VALIDACAO');
      let resultado: Awaited<ReturnType<ViaCepService['consultar']>> | undefined;
      let falha: unknown;
      try { resultado = await this.servico.consultar(argumentos[0]); } catch (erro: unknown) { falha = erro; }
      // Revalidar também em falhas: logout, troca de conta, perfil ou credencial durante HTTP.
      conferir(); await this.autorizador.exigirPerfil(contexto, ['admin', 'recepcao']); conferir();
      if (resultado === undefined) throw falha;
      return { sucesso: true, dados: resultado };
    } catch (erro: unknown) {
      if (erro instanceof ErroEndereco) return { sucesso: false, erro: { codigo: erro.codigo, mensagem: erro.message } };
      const seguro = new ErroAutenticacao(erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO');
      return { sucesso: false, erro: seguro.paraPublico() };
    }
  }

  public encerrar(): void { this.encerrado = true; ipcMain.removeHandler('endereco:consultar-cep'); }
}
