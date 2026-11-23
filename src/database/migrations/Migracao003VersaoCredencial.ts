import type { ContextoMigracao, Migracao } from '../Migracao';

/** Revogação persistente sem alterar a identidade imutável da conta. */
export class Migracao003VersaoCredencial implements Migracao {
  public readonly versao = 3;
  public readonly nome = 'versao_credencial';

  public aplicar(contexto: ContextoMigracao): undefined {
    contexto.executarEstrutura(`
      ALTER TABLE usuarios ADD COLUMN versao_credencial INTEGER NOT NULL DEFAULT 1
        CHECK (versao_credencial BETWEEN 1 AND 9007199254740991);
      CREATE TRIGGER usuarios_credencial_avancar AFTER UPDATE OF senha_hash ON usuarios
      WHEN OLD.senha_hash <> NEW.senha_hash
      BEGIN
        UPDATE usuarios SET versao_credencial = versao_credencial + 1 WHERE id = NEW.id;
      END;
      CREATE TRIGGER usuarios_credencial_monotona BEFORE UPDATE OF versao_credencial ON usuarios
      WHEN NEW.versao_credencial <> OLD.versao_credencial + 1
      BEGIN SELECT RAISE(ABORT, 'Versao de credencial invalida.'); END;
    `);
  }
}
