import type { ContratoIpc, Perfil, UsuarioSessao } from '../src/shared/ipc/ContratoIpc';
import type { CredenciaisEntrada } from '../src/shared/tipos/Autenticacao';
import type { ContratoAutenticacaoService, ContratoSessaoManager, SessaoInterna } from '../src/main/seguranca/ContratosAutenticacao';
import type { CodigoErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import type { ContratoDadosAutenticacao, ContratoHashSenha, ContratoAutorizador, IdentidadeAutenticada, DadosAutenticacao, ContextoSessao } from '../src/main/seguranca/ContratosAutenticacao';

type Igual<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type Exigir<T extends true> = T;
export type PortasAutenticacao = [
  Exigir<Igual<ReturnType<ContratoDadosAutenticacao['buscarPorEmail']>, Promise<DadosAutenticacao | undefined>>>,
  Exigir<Igual<ReturnType<ContratoDadosAutenticacao['buscarIdentidadePorId']>, Promise<IdentidadeAutenticada | undefined>>>,
  Exigir<Igual<keyof IdentidadeAutenticada, 'id' | 'nome' | 'perfil' | 'ativo'>>,
  Exigir<Igual<ReturnType<ContratoHashSenha['verificar']>, Promise<boolean>>>,
  Exigir<Igual<ReturnType<ContratoHashSenha['gerar']>, Promise<string>>>,
  Exigir<Igual<ReturnType<ContratoHashSenha['necessitaAtualizacao']>, boolean>>,
  Exigir<Igual<keyof DadosAutenticacao, keyof IdentidadeAutenticada | 'senhaHash'>>,
  Exigir<Igual<keyof ContextoSessao, 'webContentsId'>>,
  Exigir<Igual<Parameters<ContratoAutorizador['exigirPerfil']>, [ContextoSessao, readonly Perfil[]]>>,
  Exigir<Igual<ReturnType<ContratoAutorizador['exigirIdentidade']>, Promise<IdentidadeAutenticada>>>
];
export type ContratosAutenticacao = [
  Exigir<Igual<Perfil, 'admin' | 'recepcao' | 'instrutor'>>,
  Exigir<Igual<keyof CredenciaisEntrada, 'email' | 'senha'>>,
  Exigir<Igual<keyof UsuarioSessao, 'id' | 'nome' | 'perfil'>>,
  Exigir<Igual<keyof SessaoInterna, 'usuarioId' | 'criadaEm'>>,
  Exigir<Igual<ContratoIpc['auth:entrar'], { entrada: { email: string; senha: string }; saida: { usuario: UsuarioSessao } }>>,
  Exigir<Igual<ContratoIpc['auth:sessao'], { entrada: undefined; saida: { usuario: UsuarioSessao } }>>,
  Exigir<Igual<ContratoIpc['auth:sair'], { entrada: undefined; saida: { encerrada: true } }>>,
  Exigir<Igual<ReturnType<ContratoAutenticacaoService['entrar']>, Promise<UsuarioSessao>>>,
  Exigir<Igual<Parameters<ContratoAutenticacaoService['entrar']>, [CredenciaisEntrada, ContextoSessao]>>,
  Exigir<Igual<ReturnType<ContratoAutenticacaoService['obterSessao']>, Promise<UsuarioSessao>>>,
  Exigir<Igual<ReturnType<ContratoAutenticacaoService['sair']>, void>>,
  Exigir<Igual<Parameters<ContratoSessaoManager['estabelecer']>, [ContextoSessao, number]>>,
  Exigir<Igual<ReturnType<ContratoSessaoManager['encerrar']>, void>>,
  Exigir<Igual<ReturnType<ContratoSessaoManager['encerrarTodas']>, void>>,
  Exigir<Igual<ReturnType<ContratoSessaoManager['obter']>, Readonly<SessaoInterna> | undefined>>
];
// @ts-expect-error Perfil externo desconhecido.
const perfil: Perfil = 'visitante';
// @ts-expect-error Senha não é um número.
const entrada: CredenciaisEntrada = { email: 'teste@example.invalid', senha: 123 };
// @ts-expect-error DTO público não declara hash.
type HashPublico = UsuarioSessao['senha_hash'];
// @ts-expect-error Sessão interna não guarda senha.
type SenhaInterna = SessaoInterna['senha'];
// @ts-expect-error Códigos internos não ampliam os códigos IPC.
const codigo: CodigoErroAutenticacao = 'USUARIO_INEXISTENTE';
