import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroInstrutor extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos do instrutor.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de instrutores não permitida.', NAO_ENCONTRADO: 'Instrutor não encontrado.',
      CONFLITO: 'Confira se a conta já está vinculada, se o cadastro mudou ou se há aulas ou avaliações impedindo a exclusão.',
      INTERNO: 'Não foi possível concluir a operação de instrutores. Tente novamente.'
    };
    super(mensagens[codigo]); this.name = 'ErroInstrutor';
  }
}
