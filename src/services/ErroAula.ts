import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroAula extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos da aula.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de aulas não permitida.', NAO_ENCONTRADO: 'Aula não encontrada.',
      CONFLITO: 'Confira a versão da aula, as vagas e as inscrições vinculadas.',
      INTERNO: 'Não foi possível concluir a operação de aulas. Tente novamente.'
    };
    super(mensagens[codigo]); this.name = 'ErroAula';
  }
}
