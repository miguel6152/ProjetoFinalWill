import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { ErroRepository } from '../src/repositories/ErroRepository';
import type { Paginacao } from '../src/shared/tipos/Paginacao';
import { ConexaoObservadaTeste } from './ConexaoObservadaTeste';
import { RepositoryLeituraTeste } from './RepositoryLeituraTeste';

class VerificarLeiturasRepository {
  private grupos: number = 0;

  public async executar(): Promise<void> {
    const limite = setTimeout((): void => app.exit(1), 30000);
    try {
      await app.whenReady();
      this.verificarLeituras();
      this.verificarPaginacaoExata();
      this.verificarTransacaoExterna();
      this.verificarLimiteMaximo();
      this.verificarConcorrencia();
      console.log(`OK: ${this.grupos} grupos de leituras no Electron ${process.versions.electron}; somente memória/temporários.`);
      clearTimeout(limite);
      app.exit(0);
    } catch (erro: unknown) {
      clearTimeout(limite);
      console.error(erro);
      app.exit(1);
    }
  }

  private criarEstrutura(conexao: Conexao): void {
    conexao.executarEstrutura(`
      CREATE TABLE pais_leitura (id INTEGER PRIMARY KEY);
      INSERT INTO pais_leitura (id) VALUES (1);
      CREATE TABLE registros_leitura (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        observacao TEXT,
        quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
        pai_id INTEGER NOT NULL REFERENCES pais_leitura(id) ON DELETE RESTRICT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        campo_interno TEXT NOT NULL DEFAULT 'não selecionar'
      );
    `);
  }

  private inserir(conexao: Conexao, id: number): void {
    conexao.preparar<[number, string, string | null, number, string, string], never>(
      'INSERT INTO registros_leitura (id, nome, observacao, quantidade, pai_id, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run(id, id === 1 ? '' : `Registro fictício ${id}`, id === 1 ? null : 'Teste', id - 1,
      '2026-11-13T12:00:00.000Z', '2026-11-13T12:00:00.000Z');
  }

  private verificarLeituras(): void {
    const conexao = new ConexaoObservadaTeste(':memory:');
    try {
      this.criarEstrutura(conexao);
      const repository = new RepositoryLeituraTeste(conexao);
      assert.equal(repository.findById(1), undefined);
      assert.deepEqual(repository.findAll({ pagina: 1, tamanho: 10 }), {
        itens: [], total: 0, totalPaginas: 0, pagina: 1, tamanho: 10
      });
      this.ok('tabela vazia, ausência e zero páginas');

      // Inverter varreduras sem ORDER BY impede um falso positivo causado
      // pela ordem natural da INTEGER PRIMARY KEY. Afeta somente este banco em memória.
      conexao.executarEstrutura('PRAGMA reverse_unordered_selects = ON');
      assert.equal(conexao.preparar<[], { reverse_unordered_selects: number }>(
        'PRAGMA reverse_unordered_selects'
      ).get()?.reverse_unordered_selects, 1);
      for (const id of [5, 2, 4, 1, 3]) this.inserir(conexao, id);
      const semOrdenacao = conexao.preparar<[number, number], { id: number }>(
        'SELECT id FROM registros_leitura LIMIT ? OFFSET ?'
      ).all(2, 0).map((item): number => item.id);
      assert.notDeepEqual(semOrdenacao, [1, 2], 'O controle sem ORDER BY deve diferir da ordem exigida.');
      const mudancas = this.totalMudancas(conexao);
      const existente = repository.findById(1);
      assert.deepEqual(existente, {
        id: 1, nome: '', observacao: null, quantidade: 0, pai_id: 1,
        criado_em: '2026-11-13T12:00:00.000Z', atualizado_em: '2026-11-13T12:00:00.000Z'
      });
      assert.equal(repository.findById(999), undefined);
      assert.equal(repository.findById(Number.MAX_SAFE_INTEGER), undefined);
      for (const [pagina, ids] of [[1, [1, 2]], [2, [3, 4]], [3, [5]], [4, []]] as const) {
        const resultado = repository.findAll({ pagina, tamanho: 2 });
        assert.deepEqual(resultado.itens.map((item): number => item.id), ids);
        assert.equal(resultado.total, 5);
        assert.equal(resultado.totalPaginas, 3);
        assert.equal(resultado.pagina, pagina);
        assert.equal(resultado.tamanho, 2);
      }
      assert.equal(repository.findAll({ pagina: 1, tamanho: 1 }).itens.length, 1);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 100 }).itens.length, 5);
      assert.equal(repository.findAll({ pagina: Number.MAX_SAFE_INTEGER, tamanho: 1 }).itens.length, 0);
      assert.equal(this.totalMudancas(conexao), mudancas);
      assert.ok(conexao.consultas.filter((sql): boolean => sql.startsWith('SELECT')).every((sql): boolean => !sql.includes('SELECT *')));
      this.ok('busca, projeção, null/zero/string vazia, páginas primeira/segunda/última/vazia e limites');

      this.verificarEntradas(repository, conexao);
      assert.throws(() => conexao.preparar<[], never>(
        'INSERT INTO registros_leitura (id, nome, quantidade, pai_id, criado_em, atualizado_em) VALUES (1000, \'Fictício\', 0, 999, \'UTC\', \'UTC\')'
      ).run(), /FOREIGN KEY/);
      assert.throws(() => conexao.preparar<[], never>('DELETE FROM pais_leitura WHERE id = 1').run(), /FOREIGN KEY/);
      assert.throws(() => conexao.preparar<[], never>('UPDATE registros_leitura SET quantidade = -1 WHERE id = 1').run(), /CHECK/);
      assert.deepEqual(conexao.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(conexao.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      assert.equal(this.totalMudancas(conexao), mudancas);
      this.ok('leituras não alteram dados, constraints nem integridade referencial');

      // Falha entre as duas consultas: o escopo deve ser encerrado, sem SQL na mensagem.
      conexao.antesListagem = (): never => { throw new Error('SQL e parâmetros secretos de teste'); };
      this.esperarErro(() => repository.findAll({ pagina: 1, tamanho: 2 }), 'INTERNO');
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.inserir(conexao, 6);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 100 }).total, 6);
      conexao.executarEstrutura('DROP TABLE registros_leitura');
      this.esperarErro(() => repository.findById(1), 'INTERNO');
      this.esperarErro(() => repository.findAll({ pagina: 1, tamanho: 1 }), 'INTERNO');
      conexao.fechar();
      this.esperarErro(() => repository.findById(1), 'INTERNO');
      this.ok('falhas sanitizadas e encerramento do escopo após erro');
    } finally {
      conexao.fechar();
    }
  }

  private verificarPaginacaoExata(): void {
    const conexao = new Conexao(':memory:');
    try {
      this.criarEstrutura(conexao);
      for (let id = 1; id <= 4; id++) this.inserir(conexao, id);
      const repository = new RepositoryLeituraTeste(conexao);
      for (const [pagina, ids] of [[1, [1, 2]], [2, [3, 4]], [3, []]] as const) {
        const resultado = repository.findAll({ pagina, tamanho: 2 });
        assert.equal(resultado.total, 4);
        assert.equal(resultado.totalPaginas, 2);
        assert.deepEqual(resultado.itens.map((item): number => item.id), ids);
      }
      this.ok('divisão exata: quatro registros, duas páginas completas e página excedente vazia');
    } finally {
      conexao.fechar();
    }
  }

  private verificarTransacaoExterna(): void {
    const conexao = new Conexao(':memory:');
    try {
      this.criarEstrutura(conexao);
      const repository = new RepositoryLeituraTeste(conexao);
      conexao.transacao((): void => {
        this.inserir(conexao, 1);
        assert.equal(repository.findById(1)?.id, 1);
        assert.deepEqual(repository.findAll({ pagina: 1, tamanho: 2 }).itens.map((item): number => item.id), [1]);
        assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, true,
          'A leitura não pode encerrar a transação externa.');
      });
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      assert.equal(repository.findById(1)?.id, 1);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 2 }).total, 1);

      const falha = new Error('Rollback externo proposital do teste.');
      assert.throws(() => conexao.transacao((): void => {
        this.inserir(conexao, 2);
        assert.equal(repository.findById(2)?.id, 2);
        const resultado = repository.findAll({ pagina: 1, tamanho: 2 });
        assert.equal(resultado.total, 2);
        assert.equal(resultado.totalPaginas, 1);
        assert.deepEqual(resultado.itens.map((item): number => item.id), [1, 2]);
        assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, true);
        throw falha;
      }), (erro: unknown): boolean => erro === falha);
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      assert.equal(repository.findById(2), undefined);
      assert.equal(repository.findById(1)?.id, 1, 'O rollback não desfaz o commit anterior.');
      const aposRollback = repository.findAll({ pagina: 1, tamanho: 2 });
      assert.equal(aposRollback.total, 1);
      assert.deepEqual(aposRollback.itens.map((item): number => item.id), [1]);
      this.ok('leituras dentro de transação externa: dados não confirmados, commit e rollback preservados');
    } finally {
      conexao.fechar();
    }
  }

  private verificarEntradas(repository: RepositoryLeituraTeste, conexao: ConexaoObservadaTeste): void {
    const antes = conexao.consultas.length;
    for (const id of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', '1 OR 1=1', null, undefined, {}, [], true, 1n]) {
      this.esperarErro(() => repository.findById(id as number), 'ENTRADA_INVALIDA');
    }
    for (const pagina of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', '1; DROP TABLE registros_leitura', null, undefined, {}, true]) {
      this.esperarErro(() => repository.findAll({ pagina, tamanho: 2 } as Paginacao), 'ENTRADA_INVALIDA');
    }
    for (const tamanho of [0, -1, 1.5, 101, NaN, Infinity, '1', '100 OFFSET 0', null, undefined, {}, true]) {
      this.esperarErro(() => repository.findAll({ pagina: 1, tamanho } as Paginacao), 'ENTRADA_INVALIDA');
    }
    for (const entrada of [null, undefined, [], {}, { pagina: 1 }, { tamanho: 1 },
      { pagina: 1, tamanho: 1, busca: 'SQL' }, { pagina: Number.MAX_SAFE_INTEGER, tamanho: 100 }]) {
      this.esperarErro(() => repository.findAll(entrada as Paginacao), 'ENTRADA_INVALIDA');
    }
    let leituras = 0;
    const acessor = { get pagina(): number { leituras++; return 1; }, tamanho: 1 };
    this.esperarErro(() => repository.findAll(acessor), 'ENTRADA_INVALIDA');
    const proxy = new Proxy({ pagina: 1, tamanho: 1 }, { get: (): never => { leituras++; throw new Error(); } });
    this.esperarErro(() => repository.findAll(proxy), 'ENTRADA_INVALIDA');
    assert.equal(leituras, 0);
    assert.equal(conexao.consultas.length, antes, 'Entradas inválidas devem falhar antes de preparar SQL.');
    this.ok('IDs/paginação inválidos, overflow, entradas semelhantes a SQL e acessores sem executar consultas');
  }

  private verificarConcorrencia(): void {
    const diretorio = mkdtempSync(path.join(tmpdir(), 'academia-leituras-'));
    let leitor: ConexaoObservadaTeste | undefined;
    let escritor: Conexao | undefined;
    try {
      const arquivo = path.join(diretorio, 'teste.sqlite');
      leitor = new ConexaoObservadaTeste(arquivo);
      leitor.executarEstrutura('PRAGMA journal_mode = WAL');
      this.criarEstrutura(leitor);
      this.inserir(leitor, 1);
      escritor = new Conexao(arquivo);
      const segundaConexao = escritor;
      const repository = new RepositoryLeituraTeste(leitor);
      let escritas = 0;
      const primeiraConexao = leitor;
      leitor.antesListagem = (): void => {
        assert.equal(primeiraConexao.preparar<[], unknown>('SELECT 1').database.inTransaction, true);
        this.inserir(segundaConexao, 2);
        escritas++;
      };
      const pagina = repository.findAll({ pagina: 1, tamanho: 100 });
      assert.equal(escritas, 1, 'Outro escritor consegue confirmar durante o snapshot de leitura.');
      assert.equal(pagina.total, 1);
      assert.equal(pagina.totalPaginas, 1);
      assert.deepEqual(pagina.itens.map((item): number => item.id), [1]);
      assert.equal(leitor.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 100 }).total, 2);
      this.ok('snapshot consistente com escrita confirmada em outra conexão WAL; sem reserva de escrita');
    } finally {
      escritor?.fechar();
      leitor?.fechar();
      rmSync(diretorio, { recursive: true, force: true });
    }
  }

  private verificarLimiteMaximo(): void {
    const conexao = new Conexao(':memory:');
    try {
      this.criarEstrutura(conexao);
      for (let id = 1; id <= 105; id++) this.inserir(conexao, id);
      const repository = new RepositoryLeituraTeste(conexao);
      const primeira = repository.findAll({ pagina: 1, tamanho: 100 });
      const ultima = repository.findAll({ pagina: 2, tamanho: 100 });
      assert.equal(primeira.itens.length, 100);
      assert.equal(primeira.itens[0]?.id, 1);
      assert.equal(primeira.itens[99]?.id, 100);
      assert.equal(primeira.total, 105);
      assert.equal(primeira.totalPaginas, 2);
      assert.deepEqual(ultima.itens.map((item): number => item.id), [101, 102, 103, 104, 105]);
      assert.equal(ultima.total, 105);
      assert.equal(ultima.totalPaginas, 2);
      this.ok('limite efetivo de 100 registros e restante da última página com 105 registros');
    } finally {
      conexao.fechar();
    }
  }

  private totalMudancas(conexao: Conexao): number {
    const resultado = conexao.preparar<[], { total: number }>('SELECT total_changes() AS total').get();
    assert.ok(resultado);
    return resultado.total;
  }

  private esperarErro(operacao: () => unknown, codigo: 'INTERNO' | 'ENTRADA_INVALIDA'): void {
    assert.throws(operacao, (erro: unknown): boolean => {
      assert.ok(erro instanceof ErroRepository);
      assert.equal(erro.codigo, codigo);
      assert.equal(erro.message, new ErroRepository(codigo).message);
      return true;
    });
  }

  private ok(mensagem: string): void {
    this.grupos++;
    console.log('OK: ' + mensagem);
  }
}

void new VerificarLeiturasRepository().executar();
