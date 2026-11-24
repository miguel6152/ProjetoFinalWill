import type { ContextoMigracao, Migracao } from '../Migracao';

export class Migracao005Entregas implements Migracao {
  public readonly versao = 5;
  public readonly nome = 'historico_entregas';
  public aplicar(contexto: ContextoMigracao): undefined {
    contexto.executarEstrutura(`
      CREATE TABLE entrega_tentativas (
        aviso_id INTEGER NOT NULL REFERENCES notificacoes(id) ON DELETE RESTRICT,
        numero INTEGER NOT NULL CHECK(numero > 0),
        modo TEXT NOT NULL CHECK(modo IN ('simulado','telegram')),
        estado TEXT NOT NULL CHECK(estado IN ('processando','enviado','simulado','falhou','incerto')),
        inicio TEXT NOT NULL, fim TEXT, motivo TEXT, proxima TEXT, mensagem_id TEXT,
        PRIMARY KEY(aviso_id,numero)
      ) STRICT;
      CREATE UNIQUE INDEX entrega_em_andamento ON entrega_tentativas(aviso_id) WHERE estado='processando';
      CREATE INDEX entrega_limite ON entrega_tentativas(proxima) WHERE motivo='Limite de requisições.';
    `);
  }
}
