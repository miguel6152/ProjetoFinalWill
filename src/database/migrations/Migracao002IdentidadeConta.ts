import type { ContextoMigracao, Migracao } from '../Migracao';

/** Identidade de conta independente do ROWID; não altera a migration publicada. */
export class Migracao002IdentidadeConta implements Migracao {
  public readonly versao = 2;
  public readonly nome = 'identidade_conta';
  public aplicar(contexto: ContextoMigracao): undefined {
    contexto.executarEstrutura(`
      ALTER TABLE usuarios ADD COLUMN identidade_conta TEXT NOT NULL DEFAULT '';
      UPDATE usuarios SET identidade_conta = lower(hex(randomblob(16)));
      CREATE UNIQUE INDEX idx_usuarios_identidade_conta ON usuarios(identidade_conta);
      CREATE TRIGGER usuarios_identidade_gerar AFTER INSERT ON usuarios
      BEGIN
        UPDATE usuarios SET identidade_conta = lower(hex(randomblob(16))) WHERE id = NEW.id;
      END;
      CREATE TRIGGER usuarios_identidade_entrada BEFORE INSERT ON usuarios
      WHEN NEW.identidade_conta <> ''
      BEGIN SELECT RAISE(ABORT, 'Identidade gerenciada pelo banco.'); END;
      CREATE TRIGGER usuarios_identidade_imutavel BEFORE UPDATE OF identidade_conta ON usuarios
      WHEN OLD.identidade_conta <> '' AND NEW.identidade_conta <> OLD.identidade_conta
      BEGIN SELECT RAISE(ABORT, 'Identidade imutavel.'); END;
    `);
  }
}
