import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroInscricao extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos da inscrição.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de inscrições não permitida.', NAO_ENCONTRADO: 'Inscrição não encontrada.',
      CONFLITO: 'Confira a matrícula, a situação da aula, as vagas e a chamada. Atualize os dados antes de tentar novamente.',
      INTERNO: 'Não foi possível concluir a operação de inscricoes. Tente novamente.'
    };
    super(mensagens[codigo]); this.name = 'ErroInscricao';
  }
}
