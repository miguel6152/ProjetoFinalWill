import type { CodigoErro } from '../shared/ipc/ContratoIpc';
export class ErroMatricula extends Error {
  public constructor(public readonly codigo: Exclude<CodigoErro, 'REDE'>, public readonly campos?: Record<string, string[]>) {
    const mensagens = { VALIDACAO: 'Confira os filtros da matrícula.', NAO_AUTENTICADO: 'Sessão inválida. Entre novamente.', SEM_PERMISSAO: 'Consulta de matrículas não permitida.', NAO_ENCONTRADO: 'Matrícula não encontrada.', CONFLITO: 'Não foi possível consultar a matrícula.', INTERNO: 'Não foi possível consultar as matrículas. Tente novamente.' };
    super(mensagens[codigo]); this.name = 'ErroMatricula';
  }
}
