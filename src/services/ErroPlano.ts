import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroPlano extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos do plano.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de planos não permitida.', NAO_ENCONTRADO: 'Plano não encontrado.',
      CONFLITO: 'O plano foi alterado ou possui matrículas vinculadas. Consulte novamente; planos com vínculos podem ser desativados.',
      INTERNO: 'Não foi possível concluir a operação de planos. Tente novamente.'
    };
    super(mensagens[codigo]); this.name = 'ErroPlano';
  }
}
