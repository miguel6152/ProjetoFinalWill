export type Perfil = 'admin' | 'recepcao' | 'instrutor';
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
}
export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  ativo: number;
}
export interface UsuarioSessao { id: number; nome: string; perfil: Perfil }
export interface EntradaLista { pagina: number; tamanho: number; busca?: string }
export interface Pagina<T> { itens: T[]; total: number; pagina: number; tamanho: number }
export interface ContratoIpc {
  'auth:entrar': { entrada: { email: string; senha: string }; saida: { usuario: UsuarioSessao } };
  'auth:sessao': { entrada: undefined; saida: { usuario: UsuarioSessao } };
  'auth:sair': { entrada: undefined; saida: { encerrada: true } };
  'usuarios:criar': { entrada: NovoUsuario; saida: UsuarioDto };
  'usuarios:listar': { entrada: EntradaLista; saida: Pagina<UsuarioDto> };
  'usuarios:obter': { entrada: { id: number }; saida: UsuarioDto };
  'usuarios:atualizar': { entrada: { id: number; alteracoes: Partial<NovoUsuario> }; saida: UsuarioDto };
  'usuarios:excluir': { entrada: { id: number }; saida: { id: number; excluido: true } };
}
export type MetodoIpc<C extends keyof ContratoIpc> =
  (entrada: ContratoIpc[C]['entrada']) => Promise<Resultado<ContratoIpc[C]['saida']>>;

// Capacidades só serão expostas quando seus handlers seguros forem implementados.
// Não publicar invoke, nomes de canais ou métodos que simulem funcionalidades futuras.
export interface PonteAcademia {
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
  };
}
