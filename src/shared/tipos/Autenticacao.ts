/** Contratos serializáveis; não contêm estado interno, hash ou token. */
export type Perfil = 'admin' | 'recepcao' | 'instrutor';
export interface CredenciaisEntrada { email: string; senha: string }
export interface UsuarioSessao { id: number; nome: string; perfil: Perfil }
export interface SaidaAutenticacao { usuario: UsuarioSessao }
export interface SaidaLogout { encerrada: true }
