import type { ContextoMigracao, Migracao } from '../Migracao';

export class Migracao004AvisosInternos implements Migracao {
  public readonly versao = 4;
  public readonly nome = 'avisos_internos';

  public aplicar(contexto: ContextoMigracao): undefined {
    contexto.executarEstrutura(`
      ALTER TABLE notificacoes ADD COLUMN data_alvo TEXT;
      ALTER TABLE notificacoes ADD COLUMN antecedencia_dias INTEGER CHECK (antecedencia_dias >= 0);
      ALTER TABLE notificacoes ADD COLUMN lido_em TEXT;
      ALTER TABLE notificacoes ADD COLUMN invalidado_em TEXT;
      CREATE UNIQUE INDEX uq_aviso_vigencia ON notificacoes(tipo, matricula_id, data_alvo, antecedencia_dias)
        WHERE data_alvo IS NOT NULL AND canal='interno';
      CREATE TRIGGER invalidar_avisos_da_matricula AFTER UPDATE OF situacao, data_fim ON matriculas
      WHEN NEW.situacao <> 'ativa' OR NEW.data_fim <> OLD.data_fim
      BEGIN
        UPDATE notificacoes SET invalidado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE matricula_id=NEW.id AND canal='interno' AND data_alvo IS NOT NULL AND invalidado_em IS NULL;
      END;
      CREATE TRIGGER cancelar_entrega_obsoleta AFTER UPDATE OF invalidado_em ON notificacoes
      WHEN NEW.invalidado_em IS NOT NULL AND OLD.invalidado_em IS NULL AND NEW.situacao IN ('pendente','falhou')
      BEGIN
        UPDATE notificacoes SET situacao='cancelada' WHERE id=NEW.id;
      END;
    `);
  }
}
