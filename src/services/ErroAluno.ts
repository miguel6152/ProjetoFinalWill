import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export class ErroAluno extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>,
    public readonly campos?: Record<string, string[]>) {
    const mensagens = {
      VALIDACAO: 'Confira os campos do aluno.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.',
      SEM_PERMISSAO: 'Operação de alunos não permitida.', NAO_ENCONTRADO: 'Aluno não encontrado.',
      CONFLITO: 'CPF já cadastrado, aluno alterado ou vínculos impedem a operação. Consulte novamente; alunos com vínculos podem ser desativados.',
      INTERNO: 'Não foi possível concluir a operação de alunos. Tente novamente.'
    };
    super(mensagens[codigo]);
    this.name = 'ErroAluno';
  }
}
