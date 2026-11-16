import type { ContextoSessao, ContratoSessaoManager, SessaoInterna } from './ContratosAutenticacao';
import { ErroAutenticacao } from './ErroAutenticacao';
import { ValidacaoAutenticacao } from '../../services/ValidacaoAutenticacao';
import { PoliticaSessao } from './PoliticaSessao';

type RegistroContexto = { versao: symbol; sessao?: Readonly<SessaoInterna>; inicio?: number; ultimoUso?: number };

/** O registro é exclusivo do Main; encerrar invalida também operações assíncronas. */
export class SessaoManager implements ContratoSessaoManager {
  private readonly contextos = new Map<number, RegistroContexto>();

  public constructor(private readonly politica: PoliticaSessao = new PoliticaSessao()) {}

  public registrar(contexto: ContextoSessao): void {
    const id = this.id(contexto);
    if (this.contextos.has(id)) throw new ErroAutenticacao('SEM_PERMISSAO');
    this.contextos.set(id, { versao: Symbol() });
  }

  public remover(contexto: ContextoSessao): void { this.contextos.delete(this.id(contexto)); }

  public versao(contexto: ContextoSessao): symbol {
    const registro = this.contextos.get(this.id(contexto));
    if (registro === undefined) throw new ErroAutenticacao('SEM_PERMISSAO');
    this.expirar(registro);
    return registro.versao;
  }

  public conferir(contexto: ContextoSessao, versao: symbol): void {
    const registro = this.contextos.get(this.id(contexto));
    if (registro !== undefined) this.expirar(registro);
    if (registro?.versao !== versao) throw new ErroAutenticacao('NAO_AUTENTICADO');
  }

  public estabelecer(contexto: ContextoSessao, usuarioId: number, identidadeConta: string, versaoCredencial: number): void {
    if (!ValidacaoAutenticacao.identidade.shape.id.safeParse(usuarioId).success) throw new ErroAutenticacao('VALIDACAO');
    const registro = this.contextos.get(this.id(contexto));
    if (registro === undefined) throw new ErroAutenticacao('SEM_PERMISSAO');
    if (!ValidacaoAutenticacao.identidade.shape.identidadeConta.safeParse(identidadeConta).success) throw new ErroAutenticacao('VALIDACAO');
    if (!ValidacaoAutenticacao.identidade.shape.versaoCredencial.safeParse(versaoCredencial).success) throw new ErroAutenticacao('VALIDACAO');
    const agora = this.politica.agora();
    registro.inicio = agora; registro.ultimoUso = agora;
    registro.sessao = Object.freeze({ usuarioId, identidadeConta, versaoCredencial, criadaEm: new Date(agora).toISOString() });
  }

  public obter(contexto: ContextoSessao): Readonly<SessaoInterna> | undefined {
    const registro = this.contextos.get(this.id(contexto));
    if (registro === undefined) return undefined;
    this.expirar(registro);
    if (registro.sessao !== undefined) registro.ultimoUso = this.politica.agora();
    return registro.sessao;
  }

  public encerrar(contexto: ContextoSessao): void {
    const registro = this.contextos.get(this.id(contexto));
    if (registro !== undefined) {
      registro.versao = Symbol();
      delete registro.sessao;
      delete registro.inicio; delete registro.ultimoUso;
    }
  }

  public encerrarTodas(): void { this.contextos.clear(); }

  /** Chamado sincronamente após COMMIT. Não atinge sessões de conta substituta. */
  public revogarIdentidade(identidadeConta: string): void {
    for (const [webContentsId, registro] of this.contextos) {
      if (registro.sessao?.identidadeConta === identidadeConta) this.encerrar({ webContentsId });
    }
  }

  /** Sinal antigo não encerra sessão autenticada com credencial posterior. */
  public revogarCredencial(identidadeConta: string, versaoAnterior: number): void {
    for (const [webContentsId, registro] of this.contextos) {
      if (registro.sessao?.identidadeConta === identidadeConta && registro.sessao.versaoCredencial <= versaoAnterior) {
        this.encerrar({ webContentsId });
      }
    }
  }

  private expirar(registro: RegistroContexto): void {
    if (registro.sessao !== undefined && registro.inicio !== undefined && registro.ultimoUso !== undefined
        && this.politica.vencida(registro.inicio, registro.ultimoUso, this.politica.agora())) {
      registro.versao = Symbol(); delete registro.sessao; delete registro.inicio; delete registro.ultimoUso;
    }
  }

  private id(contexto: ContextoSessao): number {
    ValidacaoAutenticacao.exigirObjetoPlano(contexto, ['webContentsId']);
    const resultado = ValidacaoAutenticacao.contexto.safeParse(contexto);
    if (!resultado.success) throw new ErroAutenticacao('VALIDACAO');
    return resultado.data.webContentsId;
  }
}
