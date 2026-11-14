import { Conexao } from './Conexao';
import type { Migracao } from './Migracao';
import { EscopoMigracao } from './EscopoMigracao';
import { types } from 'node:util';

export class Migrador {
  public constructor(private readonly conexao: Conexao, private readonly migrations: readonly Migracao[]) {}

  public executar(): void {
    const ordenadas: Migracao[] = [...this.migrations].sort((a, b): number => a.versao - b.versao);
    for (const [indice, migracao] of ordenadas.entries()) {
      if (migracao.versao !== indice + 1 || migracao.nome.trim() === '') {
        throw new Error('Sequência de migrations inválida.');
      }
    }
    this.conexao.transacao((): void => {
      this.conexao.executarEstrutura(`
        CREATE TABLE IF NOT EXISTS migrations (
          versao INTEGER PRIMARY KEY CHECK (versao > 0),
          nome TEXT NOT NULL,
          aplicada_em TEXT NOT NULL
        ) STRICT;
      `);
    });
    // Cada migration e seu registro são uma unidade atômica. Versões anteriores
    // concluídas permanecem se uma versão posterior falhar.
    this.conexao.transacao((): void => this.validarHistorico(ordenadas));
    for (const migracao of ordenadas) {
      this.conexao.transacao((): void => {
        this.validarHistorico(ordenadas);
        const aplicada = this.conexao.preparar<[number], { nome: string }>(
          'SELECT nome FROM migrations WHERE versao = ?'
        ).get(migracao.versao);
        if (aplicada !== undefined) return;
        const escopo: EscopoMigracao = new EscopoMigracao((sql: string): void => this.conexao.executarEstrutura(sql));
        let retorno: unknown;
        try {
          retorno = migracao.aplicar(escopo.contexto);
        } finally {
          // Revogar antes de inspecionar o retorno, registrar a versão ou sair
          // da transação. Uma Promise não é cancelada por lançar uma exceção.
          escopo.revogar();
        }
        if (retorno !== undefined) {
          if (types.isPromise(retorno)) {
            // Consumir rejeições nativas tardias sem executar thenables arbitrários.
            // Isso não cancela o trabalho: seu acesso ao banco já foi revogado.
            void Promise.prototype.then.call(retorno, undefined, (): undefined => undefined);
          }
          throw new Error('Migration deve ser síncrona e retornar somente undefined.');
        }
        this.conexao.preparar<[number, string, string], never>(
          'INSERT INTO migrations (versao, nome, aplicada_em) VALUES (?, ?, ?)'
        ).run(migracao.versao, migracao.nome, new Date().toISOString());
      });
    }
  }

  private validarHistorico(ordenadas: readonly Migracao[]): void {
    const aplicadas = this.conexao.preparar<[], { versao: number; nome: string }>(
      'SELECT versao, nome FROM migrations ORDER BY versao'
    ).all();
    for (const [indice, aplicada] of aplicadas.entries()) {
      const esperada: Migracao | undefined = ordenadas[indice];
      if (aplicada.versao !== indice + 1 || esperada?.versao !== aplicada.versao || esperada.nome !== aplicada.nome) {
        throw new Error('Histórico de migrations incompatível com esta aplicação.');
      }
    }
  }
}
