import type { CodigoErro } from '../shared/ipc/ContratoIpc';

const mensagens = {
  VALIDACAO: 'Confira os dados da mensalidade.',
  NAO_AUTENTICADO: 'Sua sessão terminou. Entre novamente.',
  SEM_PERMISSAO: 'Seu perfil não pode acessar mensalidades.',
  NAO_ENCONTRADO: 'Mensalidade não encontrada.',
  CONFLITO: 'Já existe um lançamento para esta matrícula e competência.',
  INTERNO: 'Não foi possível concluir a operação.'
};

export class ErroPagamento extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>, mensagem = mensagens[codigo]) {
    super(mensagem);
  }
}
