import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron';
import type { ContratoIpc, Resultado } from '../../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../seguranca/ContratosAutenticacao';
import { ErroAutenticacao } from '../seguranca/ErroAutenticacao';
import { SessaoManager } from '../seguranca/SessaoManager';
import { SessaoAutenticacaoService } from '../../services/SessaoAutenticacaoService';

type Canal = 'auth:entrar' | 'auth:sessao' | 'auth:sair';

export class AutenticacaoHandler {
  private readonly janelas = new Map<WebContents, { janela: BrowserWindow; url: string; limpar: () => void }>();
  private readonly canais: readonly Canal[] = ['auth:entrar', 'auth:sessao', 'auth:sair'];
  private encerrado = false;

  public constructor(private readonly servico: SessaoAutenticacaoService, private readonly sessoes: SessaoManager) {
    const registrados: Canal[] = [];
    try {
      for (const canal of this.canais) {
        ipcMain.handle(canal, (evento: IpcMainInvokeEvent, ...argumentos: unknown[]) => this.atender(canal, evento, argumentos));
        registrados.push(canal);
      }
    } catch {
      for (const canal of registrados) ipcMain.removeHandler(canal);
      throw new ErroAutenticacao('INTERNO');
    }
  }

  /** Executado apenas para a BrowserWindow criada pelo Main, antes de carregar o renderer. */
  public vincular(janela: BrowserWindow, url: string): void {
    const conteudo = janela.webContents;
    if (this.encerrado || janela.isDestroyed() || conteudo.isDestroyed() || this.janelas.has(conteudo)) throw new ErroAutenticacao('SEM_PERMISSAO');
    const contexto = { webContentsId: conteudo.id };
    this.sessoes.registrar(contexto);
    const invalidar = (): void => this.sessoes.encerrar(contexto);
    const navegar = (_evento: unknown, _url: string, _mesmoDocumento: boolean, principal: boolean): void => {
      if (principal) invalidar();
    };
    const limpar = (): void => {
      this.sessoes.remover(contexto);
      this.janelas.delete(conteudo);
      janela.removeListener('closed', limpar);
      conteudo.removeListener('destroyed', limpar);
      conteudo.removeListener('render-process-gone', invalidar);
      conteudo.removeListener('did-start-navigation', navegar);
    };
    this.janelas.set(conteudo, { janela, url, limpar });
    janela.once('closed', limpar);
    conteudo.once('destroyed', limpar);
    conteudo.on('render-process-gone', invalidar);
    conteudo.on('did-start-navigation', navegar);
  }

  public encerrar(): void {
    if (this.encerrado) return;
    this.encerrado = true;
    for (const registro of [...this.janelas.values()]) registro.limpar();
    this.sessoes.encerrarTodas();
    for (const canal of this.canais) ipcMain.removeHandler(canal);
  }

  public async atender<C extends Canal>(canal: C, evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
    argumentos: readonly unknown[]): Promise<Resultado<ContratoIpc[C]['saida']>> {
    try {
      const contexto = this.contexto(evento);
      if (argumentos.length > 1 || (canal !== 'auth:entrar' && argumentos[0] !== undefined)) {
        throw new ErroAutenticacao('VALIDACAO');
      }
      if (canal === 'auth:sair') {
        const versao = this.sessoes.versao(contexto);
        const sessao = this.sessoes.obter(contexto);
        // Sem sessão, sair cancela o login pendente sincronicamente. Falhas da
        // consulta são propagadas sem executar ações contra uma sessão posterior.
        if (sessao !== undefined) await this.servico.obterSessao(contexto);
        this.contexto(evento);
        this.sessoes.conferir(contexto, versao);
        if (this.sessoes.obter(contexto) !== sessao) throw new ErroAutenticacao('NAO_AUTENTICADO');
        this.servico.sair(contexto);
        return { sucesso: true, dados: { encerrada: true } };
      }
      const operacao = canal === 'auth:entrar'
        ? this.servico.entrar(argumentos[0], contexto)
        : this.servico.obterSessao(contexto);
      const versao = this.sessoes.versao(contexto);
      const usuario = await operacao;
      this.contexto(evento);
      this.sessoes.conferir(contexto, versao);
      return { sucesso: true, dados: { usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil } } };
    } catch (erro: unknown) {
      const seguro = new ErroAutenticacao(erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO');
      return { sucesso: false, erro: seguro.paraPublico() };
    }
  }

  public contexto(evento: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): ContextoSessao {
    const conteudo = evento.sender;
    const registro = this.janelas.get(conteudo);
    if (registro === undefined || registro.janela.isDestroyed() || conteudo.isDestroyed()
        || evento.senderFrame === null || evento.senderFrame !== conteudo.mainFrame
        || evento.senderFrame.isDestroyed() || evento.senderFrame.url !== registro.url
        || conteudo.getURL() !== registro.url) throw new ErroAutenticacao('SEM_PERMISSAO');
    return { webContentsId: conteudo.id };
  }
}
