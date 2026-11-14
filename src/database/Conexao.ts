import Database = require('better-sqlite3');

export class Conexao {
  private readonly banco: Database.Database;

  public constructor(caminho: string) {
    this.banco = new Database(caminho, { timeout: 5000 });
    try {
      this.banco.pragma('foreign_keys = ON');
      if (this.banco.pragma('foreign_keys', { simple: true }) !== 1) {
        throw new Error('Integridade referencial indisponível.');
      }
    } catch (erro: unknown) {
      this.banco.close();
      throw erro;
    }
  }

  // Somente camadas confiáveis no Main recebem esta conexão. Nunca expor pelo IPC.
  public preparar<Entrada extends unknown[], Saida>(sql: string): Database.Statement<Entrada, Saida> {
    return this.banco.prepare<Entrada, Saida>(sql);
  }

  // Destinado a DDL fixo das migrations; dados variáveis usam preparar().run(...).
  public executarEstrutura(sql: string): void {
    this.banco.exec(sql);
  }

  public transacao<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T {
    return this.banco.transaction((): T => {
      const resultado: T = operacao();
      if (resultado !== null && typeof resultado === 'object' && 'then' in resultado) {
        throw new Error('Transações exigem operações síncronas.');
      }
      return resultado;
    }).immediate();
  }

  public fechar(): void {
    if (this.banco.open) this.banco.close();
  }
}
