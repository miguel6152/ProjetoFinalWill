import type { AlterarPreferencia, EntregaDto, ModoEntrega, PreferenciaDto } from '../tipos/Entrega';
import type { FiltroAvisos, AvisoDto } from '../tipos/Aviso';
import type { FiltroInadimplencia, ResumoInadimplencia } from '../tipos/Inadimplencia';
import type { NovaMensalidade, Recebimento, PagamentoDto, FiltroPagamentos } from '../tipos/Pagamento';
import type { EntradaLista, PaginaIpc as Pagina } from '../tipos/Paginacao';
import type { NovoAluno, AlunoDto, AlunoResumoDto, AlunoInstrutorDto } from '../tipos/Aluno';
import type { EnderecoDto } from '../tipos/Endereco';
import type { NovoPlano, PlanoDto } from '../tipos/Plano';
import type { NovoInstrutor, InstrutorDto } from '../tipos/Instrutor';
import type { NovaAula, AulaDto, FiltroAgenda } from '../tipos/Aula';
import type { ListaMatriculas, MatriculaDto, NovaMatricula } from '../tipos/Matricula';
export type { ListaMatriculas, MatriculaDto, NovaMatricula } from '../tipos/Matricula';
export type { NovoPlano, PlanoDto } from '../tipos/Plano';
export type { NovoInstrutor, InstrutorDto } from '../tipos/Instrutor';
export type { NovaAula, AulaDto, FiltroAgenda } from '../tipos/Aula';
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
  'avisos:entrega': { entrada: { id: number }; saida: EntregaDto };
  'avisos:processar': { entrada: { id: number; modo: ModoEntrega }; saida: EntregaDto };
  'avisos:preferencia': { entrada: { id: number }; saida: PreferenciaDto | null };
  'avisos:configurar': { entrada: AlterarPreferencia; saida: { salvo: boolean } };
  'avisos:listar': { entrada: FiltroAvisos; saida: AvisoDto[] };
  'avisos:verificar': { entrada: undefined; saida: { criados: number } };
  'avisos:ler': { entrada: { id: number }; saida: { lido: boolean } };
  'pagamentos:inadimplentes': { entrada: FiltroInadimplencia; saida: ResumoInadimplencia };
  'pagamentos:criar': { entrada: NovaMensalidade; saida: PagamentoDto };
  'pagamentos:listar': { entrada: FiltroPagamentos; saida: Pagina<PagamentoDto> };
  'pagamentos:obter': { entrada: { id: number }; saida: PagamentoDto };
  'pagamentos:quitar': { entrada: Recebimento; saida: PagamentoDto };
  'matriculas:criar': { entrada: NovaMatricula; saida: MatriculaDto };
  'matriculas:cancelar': { entrada: { id: number }; saida: MatriculaDto };
  'matriculas:encerrar': { entrada: { id: number }; saida: MatriculaDto };
  'matriculas:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
  'matriculas:listar': { entrada: ListaMatriculas; saida: Pagina<MatriculaDto> };
  'matriculas:obter': { entrada: { id: number }; saida: MatriculaDto };
  'planos:criar': { entrada: NovoPlano; saida: PlanoDto };
  'instrutores:criar': { entrada: NovoInstrutor; saida: InstrutorDto };
  'aulas:criar': { entrada: NovaAula; saida: AulaDto };
  'planos:listar': { entrada: EntradaLista; saida: Pagina<PlanoDto> };
  'instrutores:listar': { entrada: EntradaLista; saida: Pagina<InstrutorDto> };
  'aulas:listar': { entrada: FiltroAgenda; saida: Pagina<AulaDto> };
  'planos:obter': { entrada: { id: number }; saida: PlanoDto };
  'instrutores:obter': { entrada: { id: number }; saida: InstrutorDto };
  'aulas:obter': { entrada: { id: number }; saida: AulaDto };
  'planos:atualizar': { entrada: { id: number; referencia: string; alteracoes: Partial<NovoPlano> }; saida: PlanoDto };
  'instrutores:atualizar': { entrada: { id: number; referencia: string; alteracoes: Partial<NovoInstrutor> }; saida: InstrutorDto };
  'aulas:atualizar': { entrada: { id: number; referencia: string; alteracoes: Partial<NovaAula> }; saida: AulaDto };
  'planos:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
  'instrutores:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
  'aulas:excluir': { entrada: { id: number; referencia: string }; saida: { id: number; excluido: true } };
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
  readonly avisos?: {
    readonly entrega: MetodoIpc<'avisos:entrega'>;
    readonly processar: MetodoIpc<'avisos:processar'>;
    readonly preferencia: MetodoIpc<'avisos:preferencia'>;
    readonly configurar: MetodoIpc<'avisos:configurar'>;
    readonly listar: MetodoIpc<'avisos:listar'>;
    readonly verificar: MetodoIpc<'avisos:verificar'>;
    readonly ler: MetodoIpc<'avisos:ler'>;
  };
  readonly pagamentos?: {
    readonly inadimplentes: MetodoIpc<'pagamentos:inadimplentes'>;
    readonly criar: MetodoIpc<'pagamentos:criar'>;
    readonly listar: MetodoIpc<'pagamentos:listar'>;
    readonly obter: MetodoIpc<'pagamentos:obter'>;
    readonly quitar: MetodoIpc<'pagamentos:quitar'>;
  };
  readonly matriculas?: { readonly criar: MetodoIpc<'matriculas:criar'>; readonly listar: MetodoIpc<'matriculas:listar'>; readonly obter: MetodoIpc<'matriculas:obter'>; readonly cancelar: MetodoIpc<'matriculas:cancelar'>; readonly encerrar: MetodoIpc<'matriculas:encerrar'>; readonly excluir: MetodoIpc<'matriculas:excluir'> };
  readonly planos?: {
    readonly criar: MetodoIpc<'planos:criar'>;
    readonly listar: MetodoIpc<'planos:listar'>;
    readonly obter: MetodoIpc<'planos:obter'>;
    readonly atualizar: MetodoIpc<'planos:atualizar'>;
    readonly excluir: MetodoIpc<'planos:excluir'>;
  };
  readonly instrutores?: {
    readonly criar: MetodoIpc<'instrutores:criar'>;
    readonly listar: MetodoIpc<'instrutores:listar'>;
    readonly obter: MetodoIpc<'instrutores:obter'>;
    readonly atualizar: MetodoIpc<'instrutores:atualizar'>;
    readonly excluir: MetodoIpc<'instrutores:excluir'>;
  };
  readonly aulas?: {
    readonly criar: MetodoIpc<'aulas:criar'>;
    readonly listar: MetodoIpc<'aulas:listar'>;
    readonly obter: MetodoIpc<'aulas:obter'>;
    readonly atualizar: MetodoIpc<'aulas:atualizar'>;
    readonly excluir: MetodoIpc<'aulas:excluir'>;
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
