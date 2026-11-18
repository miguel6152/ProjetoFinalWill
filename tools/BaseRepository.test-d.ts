import type { BaseRepository } from '../src/repositories/BaseRepository';
import type { ColunaAnulavel, DadosAtualizacao, DadosCriacao, DefinicaoRepository, RegistroPersistido, RegistroSqlite } from '../src/repositories/TiposRepository';
import type { ContratoIpc, EntradaLista as EntradaListaIpc, Pagina as PaginaIpc, UsuarioDto } from '../src/shared/ipc/ContratoIpc';
import type { EntradaLista, Pagina, Paginacao } from '../src/shared/tipos/Paginacao';

interface RegistroTeste extends RegistroPersistido {
  nome: string;
  observacao: string | null;
  quantidade: number;
}
type Atualizaveis = 'nome' | 'observacao';
type ExigirVerdade<T extends true> = T;
type Igual<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type Criacao = DadosCriacao<RegistroTeste>;
type Atualizacao = DadosAtualizacao<RegistroTeste, Atualizaveis>;
type DadosValidos = { nome: string; observacao: string | null; quantidade: number };
type Mapa = DefinicaoRepository<RegistroTeste, Atualizaveis>['colunas'];
type Repositorio = BaseRepository<RegistroTeste, Atualizaveis>;
type EntradaListaAnterior = { pagina: number; tamanho: number; busca?: string };
type PaginaAnterior<T> = { itens: T[]; total: number; pagina: number; tamanho: number };

// Testes estáticos: não executam CRUD. Campos ocultados pelo estreitamento de
// uma variável e coerções explícitas continuam exigindo validação de runtime.
export type EntradasRepository = [
  ExigirVerdade<DadosValidos extends Criacao ? true : false>,
  ExigirVerdade<{ nome: ''; observacao: null; quantidade: 0 } extends Criacao ? true : false>,
  ExigirVerdade<(DadosValidos & { id: number }) extends Criacao ? false : true>,
  ExigirVerdade<(DadosValidos & { criado_em: string }) extends Criacao ? false : true>,
  ExigirVerdade<(DadosValidos & { atualizado_em: string }) extends Criacao ? false : true>,
  ExigirVerdade<(DadosValidos & { id: undefined }) extends Criacao ? false : true>,
  ExigirVerdade<{ id: number } extends Atualizacao ? false : true>,
  ExigirVerdade<{ criado_em: string } extends Atualizacao ? false : true>,
  ExigirVerdade<{ atualizado_em: string } extends Atualizacao ? false : true>,
  ExigirVerdade<{ nome: undefined } extends Atualizacao ? false : true>,
  ExigirVerdade<{ observacao: undefined } extends Atualizacao ? false : true>,
  ExigirVerdade<{ nome: null } extends Atualizacao ? false : true>,
  ExigirVerdade<{ observacao: null } extends Atualizacao ? true : false>,
  ExigirVerdade<{ quantidade: number } extends Atualizacao ? false : true>,
  ExigirVerdade<{ nome: string; quantidade: number } extends Atualizacao ? false : true>,
  ExigirVerdade<{ nome: number; observacao: null; quantidade: number } extends Criacao ? false : true>,
  ExigirVerdade<{ nome: string; quantidade: number } extends Criacao ? false : true>,
  ExigirVerdade<Igual<ColunaAnulavel<RegistroTeste>, 'observacao'>>
];

export type ConfiguracoesRepository = [
  ExigirVerdade<Omit<Mapa, 'id'> extends Mapa ? false : true>,
  ExigirVerdade<Omit<Mapa, 'observacao'> extends Mapa ? false : true>,
  ExigirVerdade<Omit<Mapa, 'quantidade'> extends Mapa ? false : true>,
  ExigirVerdade<Igual<keyof Mapa, keyof RegistroTeste>>,
  ExigirVerdade<{ tipo: 'TEXT'; anulavel: false; atualizavel: true } extends Mapa['observacao'] ? false : true>,
  ExigirVerdade<{ tipo: 'TEXT'; anulavel: true; atualizavel: true } extends Mapa['nome'] ? false : true>,
  ExigirVerdade<{ tipo: 'INTEGER'; anulavel: false; atualizavel: true } extends Mapa['quantidade'] ? false : true>,
  ExigirVerdade<{ tipo: 'INTEGER'; anulavel: false; atualizavel: false } extends Mapa['id'] ? true : false>,
  ExigirVerdade<{ tipo: 'INTEGER'; anulavel: false; atualizavel: true } extends Mapa['id'] ? false : true>,
  ExigirVerdade<{ tipo: 'TEXT'; anulavel: false; atualizavel: true } extends Mapa['criado_em'] ? false : true>,
  ExigirVerdade<{ tipo: 'INTEGER'; anulavel: false; atualizavel: true } extends Mapa['nome'] ? false : true>,
  ExigirVerdade<{ tipo: 'TEXT'; anulavel: false; atualizavel: false } extends Mapa['quantidade'] ? false : true>
];

export type ValoresPersistiveis = [
  ExigirVerdade<RegistroTeste extends RegistroSqlite<RegistroTeste> ? true : false>,
  ExigirVerdade<(RegistroPersistido & { valor: Date }) extends RegistroSqlite<RegistroPersistido & { valor: Date }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor: object }) extends RegistroSqlite<RegistroPersistido & { valor: object }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor: () => void }) extends RegistroSqlite<RegistroPersistido & { valor: () => void }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor: boolean }) extends RegistroSqlite<RegistroPersistido & { valor: boolean }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor: string[] }) extends RegistroSqlite<RegistroPersistido & { valor: string[] }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor: undefined }) extends RegistroSqlite<RegistroPersistido & { valor: undefined }> ? false : true>,
  ExigirVerdade<(RegistroPersistido & { valor?: string }) extends RegistroSqlite<RegistroPersistido & { valor?: string }> ? false : true>
];

// @ts-expect-error Date não é um escalar de persistência.
type RepositorioComDate = BaseRepository<RegistroPersistido & { valor: Date }>;
// @ts-expect-error Objetos arbitrários não podem ser usados como valores persistidos.
type DefinicaoComObjeto = DefinicaoRepository<RegistroPersistido & { valor: object }>;
// @ts-expect-error ID não pode ser incluído nas chaves atualizáveis.
type AtualizacaoComId = DadosAtualizacao<RegistroTeste, 'id'>;

export type OperacoesRepository = [
  ExigirVerdade<Igual<ReturnType<Repositorio['create']>, RegistroTeste>>,
  ExigirVerdade<Igual<ReturnType<Repositorio['findById']>, RegistroTeste | undefined>>,
  ExigirVerdade<Igual<ReturnType<Repositorio['update']>, RegistroTeste | undefined>>,
  ExigirVerdade<Igual<Parameters<Repositorio['update']>[1], Atualizacao>>,
  ExigirVerdade<Igual<ReturnType<Repositorio['delete']>, boolean>>,
  ExigirVerdade<Igual<Parameters<Repositorio['findAll']>[0], Paginacao>>,
  ExigirVerdade<Igual<ReturnType<Repositorio['findAll']>, Pagina<RegistroTeste>>>,
  ExigirVerdade<Igual<Pagina<RegistroTeste>['totalPaginas'], number>>,
  ExigirVerdade<'busca' extends keyof Paginacao ? false : true>
];

export type CompatibilidadeIpc = [
  ExigirVerdade<Igual<EntradaListaIpc, EntradaListaAnterior>>,
  ExigirVerdade<Igual<EntradaLista, EntradaListaAnterior>>,
  ExigirVerdade<Igual<PaginaIpc<UsuarioDto>, PaginaAnterior<UsuarioDto>>>,
  ExigirVerdade<Igual<ContratoIpc['usuarios:listar']['entrada'], EntradaListaAnterior>>,
  ExigirVerdade<Igual<ContratoIpc['usuarios:listar']['saida'], PaginaAnterior<UsuarioDto>>>,
  ExigirVerdade<Igual<keyof ContratoIpc,
    'auth:entrar' | 'auth:sessao' | 'auth:sair' | 'usuarios:criar' | 'usuarios:listar' |
    'usuarios:obter' | 'usuarios:atualizar' | 'usuarios:excluir' | 'usuarios:alterar-senha' |
    'inicializacao:estado' | 'inicializacao:criar-admin' |
    'alunos:criar' | 'alunos:listar' | 'alunos:obter' | 'alunos:atualizar' | 'alunos:excluir' | 'endereco:consultar-cep' |
    'planos:criar' | 'planos:listar' | 'planos:obter' | 'planos:atualizar' | 'planos:excluir' |
    'matriculas:criar' | 'matriculas:listar' | 'matriculas:obter'>>
];
