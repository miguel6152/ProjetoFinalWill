export interface ContextoMigracao {
  executarEstrutura(sql: string): void;
}

export interface Migracao {
  readonly versao: number;
  readonly nome: string;
  // Diferente de void, undefined não aceita funções que retornam Promise.
  aplicar(contexto: ContextoMigracao): undefined;
}
