import type { ContextoSessao, ContratoSessaoManager, SessaoInterna } from './ContratosAutenticacao';
import { ErroAutenticacao } from './ErroAutenticacao';
import { ValidacaoAutenticacao } from '../../services/ValidacaoAutenticacao';

/** O registro é exclusivo do Main; encerrar invalida também operações assíncronas. */
export class SessaoManager implements ContratoSessaoManager {
  private readonly contextos = new Map<number, { versao: symbol; sessao?: Readonly<SessaoInterna> }>();

  public registrar(contexto: ContextoSessao): void {
    const id = this.id(contexto);
    if (this.contextos.has(id)) throw new ErroAutenticacao('SEM_PERMISSAO');
    this.contextos.set(id, { versao: Symbol() });
  }

  public remover(contexto: ContextoSessao): void { this.contextos.delete(this.id(contexto)); }

  public versao(contexto: ContextoSessao): symbol {
    const registro = this.contextos.get(this.id(contexto));
    if (registro === undefined) throw new ErroAutenticacao('SEM_PERMISSAO');
    return registro.versao;
  }

  public conferir(contexto: ContextoSessao, versao: symbol): void {
    if (this.contextos.get(this.id(contexto))?.versao !== versao) throw new ErroAutenticacao('NAO_AUTENTICADO');
  }

  public estabelecer(contexto: ContextoSessao, usuarioId: number): void {
    if (!ValidacaoAutenticacao.identidade.shape.id.safeParse(usuarioId).success) throw new ErroAutenticacao('VALIDACAO');
    const registro = this.contextos.get(this.id(contexto));
    if (registro === undefined) throw new ErroAutenticacao('SEM_PERMISSAO');
    registro.sessao = Object.freeze({ usuarioId, criadaEm: new Date().toISOString() });
  }

  public obter(contexto: ContextoSessao): Readonly<SessaoInterna> | undefined {
    return this.contextos.get(this.id(contexto))?.sessao;
  }

  public encerrar(contexto: ContextoSessao): void {
    const registro = this.contextos.get(this.id(contexto));
    if (registro !== undefined) {
      registro.versao = Symbol();
      delete registro.sessao;
    }
  }

  public encerrarTodas(): void { this.contextos.clear(); }

  private id(contexto: ContextoSessao): number {
    ValidacaoAutenticacao.exigirObjetoPlano(contexto, ['webContentsId']);
    const resultado = ValidacaoAutenticacao.contexto.safeParse(contexto);
    if (!resultado.success) throw new ErroAutenticacao('VALIDACAO');
    return resultado.data.webContentsId;
  }
}
