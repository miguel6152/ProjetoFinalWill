export type CodigoErroAutenticacao = 'VALIDACAO' | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'INTERNO';

/** Não recebe causa, credencial, SQL ou mensagem externa. */
export class ErroAutenticacao extends Error {
  public readonly codigo: CodigoErroAutenticacao;

  public constructor(codigo: unknown) {
    const mensagens: Record<CodigoErroAutenticacao, string> = {
      VALIDACAO: 'Dados de autenticação inválidos.',
      NAO_AUTENTICADO: 'Não foi possível autenticar a sessão.',
      SEM_PERMISSAO: 'Operação não permitida.',
      INTERNO: 'Não foi possível concluir a autenticação.'
    };
    const seguro: CodigoErroAutenticacao = typeof codigo === 'string' && Object.hasOwn(mensagens, codigo)
      ? codigo as CodigoErroAutenticacao : 'INTERNO';
    super(mensagens[seguro]);
    this.name = 'ErroAutenticacao';
    this.codigo = seguro;
  }

  /** Projeção explícita para a futura fronteira IPC, sem stack ou cause. */
  public paraPublico(): { codigo: CodigoErroAutenticacao; mensagem: string } {
    return { codigo: this.codigo, mensagem: this.message };
  }
}
