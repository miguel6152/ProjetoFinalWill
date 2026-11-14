import type Database = require('better-sqlite3');
import { Conexao } from '../src/database/Conexao';

/** Instrumentação exclusiva dos testes; não altera a conexão da aplicação. */
export class ConexaoObservadaTeste extends Conexao {
  public readonly consultas: string[] = [];
  public antesListagem: (() => void) | undefined;

  public override preparar<Entrada extends unknown[], Saida>(sql: string): Database.Statement<Entrada, Saida> {
    this.consultas.push(sql);
    if (sql.includes(' LIMIT ? OFFSET ?')) {
      const executar = this.antesListagem;
      this.antesListagem = undefined;
      executar?.();
    }
    return super.preparar<Entrada, Saida>(sql);
  }
}
