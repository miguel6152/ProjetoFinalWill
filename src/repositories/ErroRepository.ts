export type CodigoErroRepository =
  'CONFIGURACAO_INVALIDA' | 'ENTRADA_INVALIDA' | 'CONFLITO' | 'INDISPONIVEL' | 'INTERNO';

export class ErroRepository extends Error {
  public readonly codigo: CodigoErroRepository;

  public constructor(codigo: unknown) {
    const mensagens: Record<CodigoErroRepository, string> = {
      CONFIGURACAO_INVALIDA: 'Configuração de persistência inválida.',
      ENTRADA_INVALIDA: 'Dados de persistência inválidos.',
      CONFLITO: 'A operação conflita com os dados existentes.',
      INDISPONIVEL: 'O banco de dados está indisponível no momento.',
      INTERNO: 'Não foi possível concluir a operação de persistência.'
    };
    const seguro: CodigoErroRepository = typeof codigo === 'string' && Object.hasOwn(mensagens, codigo)
      ? codigo as CodigoErroRepository : 'INTERNO';
    super(mensagens[seguro]);
    this.name = 'ErroRepository';
    this.codigo = seguro;
  }
}
