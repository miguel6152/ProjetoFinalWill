import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroUsuario extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>) {
    const mensagens = {
      VALIDACAO: 'Dados de usuário inválidos.', NAO_AUTENTICADO: 'Sessão inválida.',
      SEM_PERMISSAO: 'Operação não permitida.', NAO_ENCONTRADO: 'Usuário não encontrado.',
      CONFLITO: 'A operação conflita com usuários ou vínculos existentes.',
      INTERNO: 'Não foi possível concluir a operação de usuários.'
    };
    super(mensagens[codigo]);
    this.name = 'ErroUsuario';
  }
}
