import type { ContextoSessao, ContratoAutenticacaoService } from '../main/seguranca/ContratosAutenticacao';
import type { UsuarioSessao } from '../shared/tipos/Autenticacao';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { Autorizador } from '../main/seguranca/Autorizador';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';
import { ValidacaoAutenticacao } from './ValidacaoAutenticacao';

/** Coordena a verificação da 4.2 sem alterar seu contrato parcial. */
export class SessaoAutenticacaoService implements ContratoAutenticacaoService {
  private readonly pendentes = new Set<number>();

  public constructor(private readonly credenciais: {
    entrar(entrada: unknown, contexto: ContextoSessao): Promise<UsuarioSessao>;
  },
    private readonly sessoes: SessaoManager, private readonly autorizador: Autorizador) {}

  public async entrar(credenciais: unknown, contexto: ContextoSessao): Promise<UsuarioSessao> {
    this.validar(contexto);
    const id = contexto.webContentsId;
    if (this.pendentes.has(id)) throw new ErroAutenticacao('SEM_PERMISSAO');
    this.sessoes.encerrar(contexto);
    const versao = this.sessoes.versao(contexto);
    this.pendentes.add(id);
    try {
      const usuario = await this.credenciais.entrar(credenciais, contexto);
      this.sessoes.conferir(contexto, versao);
      this.sessoes.estabelecer(contexto, usuario.id);
      return await this.obterSessao(contexto);
    } catch (erro: unknown) {
      // Não apagar uma sessão posterior quando uma operação antiga terminar.
      try { this.sessoes.conferir(contexto, versao); this.sessoes.encerrar(contexto); } catch { /* já invalidada */ }
      throw new ErroAutenticacao(erro instanceof ErroAutenticacao ? erro.codigo : 'INTERNO');
    } finally {
      this.pendentes.delete(id);
    }
  }

  public async obterSessao(contexto: ContextoSessao): Promise<UsuarioSessao> {
    this.validar(contexto);
    const versao = this.sessoes.versao(contexto);
    const atual = await this.autorizador.exigirPerfil(contexto, ['admin', 'recepcao', 'instrutor']);
    this.sessoes.conferir(contexto, versao);
    return { id: atual.id, nome: atual.nome, perfil: atual.perfil };
  }

  public sair(contexto: ContextoSessao): void {
    this.validar(contexto);
    const existente = this.sessoes.obter(contexto);
    this.sessoes.encerrar(contexto); // cancela inclusive login ainda pendente
    if (existente === undefined) throw new ErroAutenticacao('NAO_AUTENTICADO');
  }

  private validar(contexto: ContextoSessao): void {
    ValidacaoAutenticacao.exigirObjetoPlano(contexto, ['webContentsId']);
    if (!ValidacaoAutenticacao.contexto.safeParse(contexto).success) throw new ErroAutenticacao('VALIDACAO');
  }
}
