import type { ContextoMigracao, Migracao } from '../Migracao';

export class Migracao006AuditoriaPagamentos implements Migracao {
  public readonly versao = 6;
  public readonly nome = 'auditoria_cancelamento_pagamentos';

  public aplicar(contexto: ContextoMigracao): undefined {
    contexto.executarEstrutura(`
      ALTER TABLE pagamentos ADD COLUMN cancelado_em TEXT;
      ALTER TABLE pagamentos ADD COLUMN motivo_cancelamento TEXT;
      ALTER TABLE pagamentos ADD COLUMN cancelado_por INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT;
      CREATE INDEX idx_pagamentos_cancelado_por ON pagamentos(cancelado_por);
      CREATE TRIGGER validar_cancelamento_pagamento_insert
      BEFORE INSERT ON pagamentos
      WHEN NEW.situacao = 'cancelado' AND (
        NEW.cancelado_em IS NULL OR NEW.motivo_cancelamento IS NULL OR trim(NEW.motivo_cancelamento) = '' OR NEW.cancelado_por IS NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'cancelamento sem auditoria');
      END;
      CREATE TRIGGER validar_cancelamento_pagamento
      BEFORE UPDATE OF situacao ON pagamentos
      WHEN NEW.situacao = 'cancelado' AND (
        NEW.cancelado_em IS NULL OR NEW.motivo_cancelamento IS NULL OR trim(NEW.motivo_cancelamento) = '' OR NEW.cancelado_por IS NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'cancelamento sem auditoria');
      END;
      CREATE TRIGGER proteger_pagamento_finalizado
      BEFORE UPDATE ON pagamentos
      WHEN OLD.situacao IN ('pago', 'cancelado') AND (
        NEW.matricula_id IS NOT OLD.matricula_id OR NEW.competencia IS NOT OLD.competencia OR
        NEW.data_vencimento IS NOT OLD.data_vencimento OR NEW.valor_centavos IS NOT OLD.valor_centavos OR
        NEW.pago_em IS NOT OLD.pago_em OR NEW.forma_pagamento IS NOT OLD.forma_pagamento OR
        NEW.situacao IS NOT OLD.situacao OR NEW.cancelado_em IS NOT OLD.cancelado_em OR
        NEW.motivo_cancelamento IS NOT OLD.motivo_cancelamento OR NEW.cancelado_por IS NOT OLD.cancelado_por OR
        NEW.criado_em IS NOT OLD.criado_em
      )
      BEGIN
        SELECT RAISE(ABORT, 'pagamento finalizado e imutavel');
      END;
      CREATE TRIGGER preservar_historico_pagamento
      BEFORE DELETE ON pagamentos
      BEGIN
        SELECT RAISE(ABORT, 'pagamentos nao podem ser removidos fisicamente');
      END;
    `);
  }
}
