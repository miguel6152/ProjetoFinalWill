import type { ContextoMigracao } from './Migracao';

export class EscopoMigracao {
  #executar: ((sql: string) => void) | undefined;
  public readonly contexto: Readonly<ContextoMigracao>;

  public constructor(executar: (sql: string) => void) {
    this.#executar = executar;
    // Não publicar conexão, statements, revogação ou referências ao driver.
    // A função também continua protegida se a migration guardar só sua referência.
    this.contexto = Object.freeze({
      executarEstrutura: (sql: string): void => {
        if (this.#executar === undefined) throw new Error('Escopo da migration revogado.');
        this.#executar(sql);
      }
    });
  }

  public revogar(): void {
    this.#executar = undefined;
  }
}
