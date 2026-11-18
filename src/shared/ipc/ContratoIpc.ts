import type { EntradaLista, PaginaIpc as Pagina } from '../tipos/Paginacao';
import type { NovoAluno, AlunoDto, AlunoResumoDto, AlunoInstrutorDto } from '../tipos/Aluno';
import type { EnderecoDto } from '../tipos/Endereco';
import type { NovoPlano, PlanoDto } from '../tipos/Plano';
import type { ListaMatriculas, MatriculaDto, NovaMatricula } from '../tipos/Matricula';
export type { ListaMatriculas, MatriculaDto, NovaMatricula } from '../tipos/Matricula';
export type { NovoPlano, PlanoDto } from '../tipos/Plano';
export type { NovoAluno, AlunoDto, AlunoResumoDto, AlunoInstrutorDto } from '../tipos/Aluno';
export type { EntradaLista, PaginaIpc as Pagina } from '../tipos/Paginacao';

import type { Perfil, SaidaAutenticacao, SaidaLogout, CredenciaisEntrada } from '../tipos/Autenticacao';
export type { Perfil, UsuarioSessao } from '../tipos/Autenticacao';
export type CodigoErro = 'VALIDACAO' | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' |
  'NAO_ENCONTRADO' | 'CONFLITO' | 'REDE' | 'INTERNO';
export type Resultado<T> = { sucesso: true; dados: T } | {
  sucesso: false;
  erro: { codigo: CodigoErro; mensagem: string; campos?: Record<string, string[]> };
};
export interface UsuarioDto {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
  /** Referência opaca de edição; não é credencial nem identidade interna. */
  referencia?: string;
}
export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  ativo: number;
}
export interface ContratoIpc {
  'matriculas:criar': { entrada: NovaMatricula; saida: MatriculaDto };
  'matriculas:listar': { entrada: ListaMatriculas; saida: Pagina<MatriculaDto> };
  'matriculas:obter': { entrada: { id: number }; saida: MatriculaDto };
  'planos:criar': { entrada: NovoPlano; saida: PlanoDto };
  'planos:listar': { entrada: EntradaLista; saida: Pagina<PlanoDto> };
  'planos:obter': { entrada: { id: number }; saida: PlanoDto };
  'planos:atualizar': { entrada: { id: number; referencia: string; alteracoes: Partial<NovoPlano> }; saida: PlanoDto };
  'planos:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
  'endereco:consultar-cep': { entrada: { cep: string }; saida: EnderecoDto };
  'alunos:criar': { entrada: NovoAluno; saida: AlunoDto };
  'alunos:listar': { entrada: EntradaLista; saida: Pagina<AlunoResumoDto> };
  'alunos:obter': { entrada: { id: number }; saida: AlunoDto | AlunoInstrutorDto };
  'alunos:atualizar': { entrada: { id: number; referencia: string; alteracoes: Partial<NovoAluno> }; saida: AlunoDto };
  'alunos:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
  'inicializacao:estado': { entrada: undefined; saida: { necessario: boolean } };
  'inicializacao:criar-admin': { entrada: { nome: string; email: string; senha: string }; saida: { criado: true } };
  'auth:entrar': { entrada: CredenciaisEntrada; saida: SaidaAutenticacao };
  'auth:sessao': { entrada: undefined; saida: SaidaAutenticacao };
  'auth:sair': { entrada: undefined; saida: SaidaLogout };
  'usuarios:criar': { entrada: NovoUsuario; saida: UsuarioDto };
  'usuarios:listar': { entrada: EntradaLista; saida: Pagina<UsuarioDto> };
  'usuarios:obter': { entrada: { id: number }; saida: UsuarioDto };
  'usuarios:atualizar': { entrada: { id: number; referencia?: string; alteracoes: Partial<Omit<NovoUsuario, 'senha'>> }; saida: UsuarioDto };
  'usuarios:alterar-senha': { entrada: { id: number; referencia?: string; senha: string }; saida: UsuarioDto };
  'usuarios:excluir': { entrada: { id: number; referencia?: string }; saida: { id: number; excluido: true } };
}
export type MetodoIpc<C extends keyof ContratoIpc> =
  (entrada: ContratoIpc[C]['entrada']) => Promise<Resultado<ContratoIpc[C]['saida']>>;

// Capacidades só serão expostas quando seus handlers seguros forem implementados.
// Não publicar invoke, nomes de canais ou métodos que simulem funcionalidades futuras.
export interface PonteAcademia {
  readonly matriculas?: { readonly criar: MetodoIpc<'matriculas:criar'>; readonly listar: MetodoIpc<'matriculas:listar'>; readonly obter: MetodoIpc<'matriculas:obter'> };
  readonly planos?: {
    readonly criar: MetodoIpc<'planos:criar'>;
    readonly listar: MetodoIpc<'planos:listar'>;
    readonly obter: MetodoIpc<'planos:obter'>;
    readonly atualizar: MetodoIpc<'planos:atualizar'>;
    readonly excluir: MetodoIpc<'planos:excluir'>;
  };
  readonly endereco?: { readonly consultarCep: MetodoIpc<'endereco:consultar-cep'> };
  readonly alunos?: {
    readonly criar: MetodoIpc<'alunos:criar'>;
    readonly listar: MetodoIpc<'alunos:listar'>;
    readonly obter: MetodoIpc<'alunos:obter'>;
    readonly atualizar: MetodoIpc<'alunos:atualizar'>;
    readonly excluir: MetodoIpc<'alunos:excluir'>;
  };
  readonly inicializacao?: {
    readonly estado: MetodoIpc<'inicializacao:estado'>;
    readonly criarAdministrador: MetodoIpc<'inicializacao:criar-admin'>;
  };
  readonly autenticacao?: {
    readonly entrar: MetodoIpc<'auth:entrar'>;
    readonly sessao: MetodoIpc<'auth:sessao'>;
    readonly sair: MetodoIpc<'auth:sair'>;
  };
  readonly usuarios?: {
    readonly criar: MetodoIpc<'usuarios:criar'>;
    readonly listar: MetodoIpc<'usuarios:listar'>;
    readonly obter: MetodoIpc<'usuarios:obter'>;
    readonly atualizar: MetodoIpc<'usuarios:atualizar'>;
    readonly excluir: MetodoIpc<'usuarios:excluir'>;
    readonly alterarSenha: MetodoIpc<'usuarios:alterar-senha'>;
  };
}
