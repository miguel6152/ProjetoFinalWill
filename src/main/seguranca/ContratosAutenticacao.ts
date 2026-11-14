import type { CredenciaisEntrada, Perfil, UsuarioSessao } from '../../shared/tipos/Autenticacao';

/** Projeção interna independente de tabela, driver e BaseRepository. */
export interface IdentidadeAutenticada {
  readonly id: number;
  readonly nome: string;
  readonly perfil: Perfil;
  readonly ativo: boolean;
}

/** Somente a consulta por email fornece o hash ao serviço de autenticação. */
export interface DadosAutenticacao extends IdentidadeAutenticada {
  readonly senhaHash: string;
}

export interface ContratoDadosAutenticacao {
  buscarPorEmail(emailNormalizado: string): Promise<DadosAutenticacao | undefined>;
  buscarIdentidadePorId(usuarioId: number): Promise<IdentidadeAutenticada | undefined>;
}

/** A 4.2 adota Argon2id conforme autorização, substituindo a previsão de bcrypt.
 * O hash codificado inclui algoritmo, salt e custo; nunca aceitar senha como hash.
 * Não normalizar/truncar senha; validar o limite em bytes antes de gerar.
 */
export interface ContratoHashSenha {
  gerar(senha: string): Promise<string>;
  verificar(senha: string, hashCodificado: string): Promise<boolean>;
  necessitaAtualizacao(hashCodificado: string): boolean;
}

/** Dependências por portas; nenhuma conexão SQLite chega ao serviço. */
export interface DependenciasAutenticacao {
  readonly dados: ContratoDadosAutenticacao;
  readonly hash: ContratoHashSenha;
  readonly sessoes: ContratoSessaoManager;
}

/** Consulta sessão pelo contexto confiável e relê identidade ativa/perfil atual.
 * Lista vazia nega acesso. Não cobre escopo de registros nem matriz de permissões.
 */
export interface ContratoAutorizador {
  exigirIdentidade(contexto: ContextoSessao): Promise<IdentidadeAutenticada>;
  exigirPerfil(contexto: ContextoSessao, permitidos: readonly Perfil[]): Promise<IdentidadeAutenticada>;
}

/** Identidade obtida pelo Main após validar remetente e frame, nunca do payload IPC. */
export interface ContextoSessao { readonly webContentsId: number }

/** Estado privado do Main. Perfil e atividade devem ser relidos antes de autorizar. */
export interface SessaoInterna {
  readonly usuarioId: number;
  readonly criadaEm: string;
}

/** Contrato completo para integração futura com sessões. A 4.2 implementa só entrar,
 * como verificação de credenciais: seu retorno ainda não representa sessão estabelecida.
 */
export interface ContratoAutenticacaoService {
  entrar(credenciais: CredenciaisEntrada, contexto: ContextoSessao): Promise<UsuarioSessao>;
  obterSessao(contexto: ContextoSessao): Promise<UsuarioSessao>;
  sair(contexto: ContextoSessao): void;
}

/** Sessões somente em memória no Main, vinculadas ao webContents confiável. */
export interface ContratoSessaoManager {
  estabelecer(contexto: ContextoSessao, usuarioId: number): void;
  obter(contexto: ContextoSessao): Readonly<SessaoInterna> | undefined;
  encerrar(contexto: ContextoSessao): void;
  encerrarTodas(): void;
}
