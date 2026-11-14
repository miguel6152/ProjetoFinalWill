import assert from 'node:assert/strict';
import { setImmediate as proximoTurno } from 'node:timers/promises';
import { Conexao } from '../src/database/Conexao';
import type { ContextoMigracao, Migracao } from '../src/database/Migracao';
import { Migrador } from '../src/database/Migrador';

type Caso = 'sincrona' | 'async_function' | 'promise' | 'promise_like' | 'then_getter' | 'then_funcao' | 'retorno_invalido' | 'excecao';

export class VerificarMigrationsSincronas {
  public async executar(): Promise<void> {
    const rejeicoesNaoTratadas: unknown[] = [];
    const registrarRejeicao = (motivo: unknown): void => { rejeicoesNaoTratadas.push(motivo); };
    process.on('unhandledRejection', registrarRejeicao);
    try {
      for (const caso of ['sincrona', 'async_function', 'promise', 'promise_like', 'then_getter', 'then_funcao', 'retorno_invalido', 'excecao'] as const) {
        await this.verificarCaso(caso);
      }
      await proximoTurno();
      assert.deepEqual(rejeicoesNaoTratadas, [], 'Promise inválida não pode produzir rejeição global não tratada.');
    } finally {
      process.removeListener('unhandledRejection', registrarRejeicao);
    }
  }

  private async verificarCaso(caso: Caso): Promise<void> {
    const conexao: Conexao = new Conexao(':memory:');
    const tarefas: Promise<void>[] = [];
    let rejeitada: Promise<never> | undefined;
    let continuacoesBloqueadas: number = 0;
    let acessosThen: number = 0;
    const anterior: Migracao = {
      versao: 1, nome: 'anterior_teste', aplicar: (contexto): undefined => {
        contexto.executarEstrutura("CREATE TABLE anterior (valor TEXT NOT NULL); INSERT INTO anterior VALUES ('preservado');");
      }
    };
    try {
      new Migrador(conexao, [anterior]).executar();
      const historicoAnterior = conexao.preparar<[], unknown>('SELECT * FROM migrations').all();
      const aplicar = (contexto: ContextoMigracao): unknown => {
        assert.ok(Object.isFrozen(contexto));
        assert.deepEqual(Object.keys(contexto), ['executarEstrutura']);
        contexto.executarEstrutura('CREATE TABLE efeito_antes (id INTEGER PRIMARY KEY);');
        // Guardar a própria função também não pode contornar a revogação.
        const executarGuardado: (sql: string) => void = contexto.executarEstrutura;
        const tentarDepois = (executar: (sql: string) => void): void => {
          assert.throws(() => executar("INSERT INTO anterior VALUES ('tardia'); CREATE TABLE efeito_tardio(id INTEGER PRIMARY KEY);"), /Escopo da migration revogado/);
          continuacoesBloqueadas++;
        };
        // Microtask e timer somente serão executados depois de sair da transação.
        tarefas.push(Promise.resolve().then((): void => tentarDepois(executarGuardado)));
        tarefas.push(new Promise<void>((resolver, rejeitar): void => {
          setTimeout((): void => {
            try {
              tentarDepois((sql): void => contexto.executarEstrutura(sql));
              resolver();
            } catch (erro: unknown) {
              rejeitar(erro);
            }
          }, 0);
        }));
        if (caso === 'promise') {
          rejeitada = Promise.resolve().then((): never => { throw new Error('falha assíncrona prevista'); });
          return rejeitada;
        }
        if (caso === 'promise_like' || caso === 'then_funcao') {
          const then = (): never => {
            acessosThen++;
            throw new Error('Thenable não deve ser executado.');
          };
          return caso === 'promise_like' ? { then } : Object.assign((): undefined => undefined, { then });
        }
        if (caso === 'then_getter') {
          return Object.defineProperty({}, 'then', {
            get: (): never => {
              acessosThen++;
              throw new Error('Getter then não deve ser avaliado.');
            }
          });
        }
        if (caso === 'excecao') throw new Error('falha síncrona prevista');
        return caso === 'retorno_invalido' ? 1 : undefined;
      };
      // A coerção é intencional e restrita ao teste: simula JS ou código que
      // contornou o compilador, para provar a proteção de runtime.
      const operacao: (contexto: ContextoMigracao) => unknown = caso === 'async_function'
        ? async (contexto): Promise<undefined> => {
          aplicar(contexto);
          await Promise.resolve();
          return undefined;
        }
        : aplicar;
      const candidata: Migracao = { versao: 2, nome: 'candidata_teste', aplicar: operacao } as unknown as Migracao;
      const migrador: Migrador = new Migrador(conexao, [anterior, candidata]);
      if (caso === 'sincrona') {
        migrador.executar();
      } else {
        assert.throws(() => migrador.executar(), caso === 'excecao' ? /falha síncrona prevista/ : /Migration deve ser síncrona/);
      }
      // A detecção/rollback é imediata, antes de qualquer continuação assíncrona.
      this.verificarEstado(conexao, caso === 'sincrona', historicoAnterior);
      await Promise.all(tarefas);
      await proximoTurno();
      if (rejeitada !== undefined) await assert.rejects(rejeitada, /falha assíncrona prevista/);
      assert.equal(continuacoesBloqueadas, 2);
      assert.equal(acessosThen, 0);
      this.verificarEstado(conexao, caso === 'sincrona', historicoAnterior);
      console.log(`OK síncrona/${caso}: histórico, rollback/commit e duas escritas tardias bloqueadas.`);
    } finally {
      await Promise.allSettled(tarefas);
      conexao.fechar();
    }
  }

  private verificarEstado(conexao: Conexao, concluida: boolean, historicoAnterior: unknown[]): void {
    const historico = conexao.preparar<[], unknown>('SELECT * FROM migrations WHERE versao=1').all();
    assert.deepEqual(historico, historicoAnterior, 'Versão anterior deve permanecer intacta.');
    assert.equal(conexao.preparar<[], { total: number }>('SELECT count(*) AS total FROM migrations WHERE versao=2').get()?.total, concluida ? 1 : 0);
    assert.equal(conexao.preparar<[], { total: number }>("SELECT count(*) AS total FROM sqlite_master WHERE name='efeito_antes'").get()?.total, concluida ? 1 : 0);
    assert.equal(conexao.preparar<[], { total: number }>("SELECT count(*) AS total FROM sqlite_master WHERE name='efeito_tardio'").get()?.total, 0);
    assert.deepEqual(conexao.preparar<[], { valor: string }>('SELECT valor FROM anterior').all(), [{ valor: 'preservado' }]);
  }
}
