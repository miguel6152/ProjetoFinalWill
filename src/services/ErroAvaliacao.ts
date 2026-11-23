import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroAvaliacao extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos da avaliação.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de avaliações não permitida.', NAO_ENCONTRADO: 'Inscrição não encontrada.',
      CONFLITO: 'A avaliação mudou. Consulte novamente antes de salvar.',
      INTERNO: 'Não foi possível concluir a operação de avaliacoes. Tente novamente.'
    };
    super(mensagens[codigo]); this.name = 'ErroAvaliacao';
  }
}
