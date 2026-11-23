import { randomBytes } from 'node:crypto';
import type { ContratoAutenticacaoService, DependenciasAutenticacao, IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';
import type { UsuarioSessao } from '../shared/tipos/Autenticacao';
import { ValidacaoAutenticacao } from './ValidacaoAutenticacao';
import { LimitadorLogin } from '../main/seguranca/LimitadorLogin';

/** Implementa somente a verificação de credenciais da 4.2, sem estabelecer sessão. */
export class AutenticacaoService implements Pick<ContratoAutenticacaoService, 'entrar'> {
  private hashAusente: Promise<string> | undefined;

  public constructor(private readonly dependencias: Pick<DependenciasAutenticacao, 'dados' | 'hash'>,
    private readonly limitador: LimitadorLogin = new LimitadorLogin()) {}

  public async entrar(credenciais: unknown, contexto: unknown): Promise<UsuarioSessao> {
    const atual = await this.verificarCredenciais(credenciais, contexto);
    return { id: atual.id, nome: atual.nome, perfil: atual.perfil };
  }

  /** Porta interna do Main: o vínculo da conta nunca é copiado para DTO público. */
  public async verificarCredenciais(credenciais: unknown, contexto: unknown): Promise<IdentidadeAutenticada> {
    let liberar: (() => void) | undefined;
    // Contexto vem do Main; validá-lo não prova a origem de um evento IPC.
    try {
      ValidacaoAutenticacao.exigirObjetoPlano(credenciais, ['email', 'senha']);
      ValidacaoAutenticacao.exigirObjetoPlano(contexto, ['webContentsId']);
      const entrada = ValidacaoAutenticacao.credenciais.safeParse(credenciais);
      const origem = ValidacaoAutenticacao.contexto.safeParse(contexto);
      if (!entrada.success || !origem.success) throw new ErroAutenticacao('VALIDACAO');
      liberar = this.limitador.admitir(origem.data);

      // Toda tentativa válida aguarda a mesma inicialização, inclusive conta existente.
      const hashAusente = await this.obterHashAusente();
      const encontrado = await this.dependencias.dados.buscarPorEmail(entrada.data.email);
      const usuario = encontrado === undefined ? undefined : ValidacaoAutenticacao.dados.parse(encontrado);
      const confere = await this.dependencias.hash.verificar(entrada.data.senha, usuario?.senhaHash ?? hashAusente);
      // Conferir a senha antes de decidir atividade evita um atalho para contas inativas.
      if (usuario === undefined || !usuario.ativo || !confere) throw new ErroAutenticacao('NAO_AUTENTICADO');
      // Nova leitura após await evita retornar identidade desativada/alterada durante o hash.
      const atual = await this.dependencias.dados.buscarIdentidadePorId(usuario.id);
      const identidade = atual === undefined ? undefined : ValidacaoAutenticacao.identidade.parse(atual);
      if (identidade === undefined || !identidade.ativo || identidade.id !== usuario.id
          || identidade.identidadeConta !== usuario.identidadeConta || identidade.versaoCredencial !== usuario.versaoCredencial) {
        throw new ErroAutenticacao('NAO_AUTENTICADO');
      }
      return identidade;
    } catch (erro: unknown) {
      if (erro instanceof ErroAutenticacao) throw new ErroAutenticacao(erro.codigo);
      throw new ErroAutenticacao('INTERNO');
    } finally {
      liberar?.();
    }
  }

  private obterHashAusente(): Promise<string> {
    if (this.hashAusente === undefined) {
      this.hashAusente = this.dependencias.hash.gerar(randomBytes(32).toString('hex')).catch((): never => {
        this.hashAusente = undefined;
        throw new ErroAutenticacao('INTERNO');
      });
    }
    return this.hashAusente;
  }
}
