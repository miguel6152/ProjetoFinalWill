import type { CodigoErro } from '../shared/ipc/ContratoIpc';
export class ErroMatricula extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>, public readonly campos?: Record<string, string[]>) {
    const mensagens = { VALIDACAO: 'Confira os dados da matrícula.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.', SEM_PERMISSAO: 'Operação de matrículas não permitida.', NAO_ENCONTRADO: 'Matrícula não encontrada.', CONFLITO: 'A operação está em conflito com o estado atual da matrícula.', INTERNO: 'Não foi possível concluir a operação de matrícula. Tente novamente.' };
    super(mensagens[codigo]); this.name = 'ErroMatricula';
  }
}
