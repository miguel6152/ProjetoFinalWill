import assert from 'node:assert/strict';
import type Database = require('better-sqlite3');
import { app } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { ErroRepository } from '../src/repositories/ErroRepository';
import type { CodigoErroRepository } from '../src/repositories/ErroRepository';
import type { DadosCriacao } from '../src/repositories/TiposRepository';
import { RepositoryEscritaTeste } from './RepositoryEscritaTeste';
import type { RegistroEscritaTeste } from './RepositoryEscritaTeste';

type Criacao = DadosCriacao<RegistroEscritaTeste>;
type Atualizacao = Parameters<RepositoryEscritaTeste['update']>[1];

class VerificarEscritasRepository {
  private grupos: number = 0;

  public async executar(): Promise<void> {
    const limite = setTimeout((): void => app.exit(1), 30000);
    try {
      await app.whenReady();
      this.verificarCreate();
      this.verificarCicloCompleto();
      await this.verificarUpdate();
      this.verificarEntradas();
      this.verificarAcessores();
      this.verificarIntegridade();
      this.verificarTransacoes();
      this.verificarRetornoAtomico();
      this.verificarFalhaReleituraCreate();
      this.verificarFalhaReleituraUpdate();
      this.verificarLimiteId();
      console.log(`OK: ${this.grupos} grupos de escritas no Electron ${process.versions.electron}; somente bancos em memória.`);
      clearTimeout(limite);
      app.exit(0);
    } catch (erro: unknown) {
      clearTimeout(limite);
      console.error(erro);
      app.exit(1);
    }
  }

  private prepararBanco(): Conexao {
    const conexao = new Conexao(':memory:');
    try {
      conexao.executarEstrutura(`
        CREATE TABLE pais_escrita (id INTEGER PRIMARY KEY) STRICT;
        INSERT INTO pais_escrita VALUES (1);
        CREATE TABLE registros_escrita (
          id INTEGER PRIMARY KEY,
          nome TEXT NOT NULL UNIQUE,
          observacao TEXT,
          quantidade INTEGER NOT NULL CHECK(quantidade >= 0),
          ativo INTEGER NOT NULL CHECK(ativo IN (0, 1)),
          proporcao REAL NOT NULL,
          pai_id INTEGER NOT NULL REFERENCES pais_escrita(id) ON DELETE RESTRICT,
          imutavel TEXT NOT NULL,
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        ) STRICT;
        CREATE TABLE dependentes_escrita (
          id INTEGER PRIMARY KEY,
          registro_id INTEGER NOT NULL REFERENCES registros_escrita(id) ON DELETE RESTRICT
        ) STRICT;
      `);
      const tabelas = conexao.preparar<[], { name: string; strict: number }>(
        "SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND name IN ('pais_escrita', 'registros_escrita', 'dependentes_escrita') ORDER BY name"
      ).all();
      assert.equal(tabelas.length, 3);
      assert.ok(tabelas.every((tabela): boolean => tabela.strict === 1), 'Todas as fixtures de escrita devem ser STRICT.');
      return conexao;
    } catch (erro: unknown) {
      conexao.fechar();
      throw erro;
    }
  }

  private dados(nome: string = 'Registro fictício'): Criacao {
    return { nome, observacao: null, quantidade: 0, ativo: 0, proporcao: 0, pai_id: 1, imutavel: '' };
  }

  private verificarCreate(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const versao = conexao.preparar<[], { versao: string }>('SELECT sqlite_version() AS versao').get();
      assert.ok(versao);
      console.log(`SQLite ${versao.versao}, better-sqlite3 13.1.1: run/lastInsertRowid/changes e releitura transacional.`);
      const antes = Date.now();
      const registro = repository.create(this.dados(''));
      assert.ok(Number.isSafeInteger(registro.id) && registro.id > 0);
      assert.equal(registro.nome, '');
      assert.equal(registro.observacao, null);
      assert.equal(registro.quantidade, 0);
      assert.equal(registro.ativo, 0);
      assert.equal(registro.proporcao, 0);
      assert.equal(registro.criado_em, registro.atualizado_em);
      this.validarInstante(registro.criado_em, antes);
      assert.deepEqual(registro, repository.findById(registro.id));
      const sql = "Robert'); DROP TABLE registros_escrita; --";
      const segundo = repository.create({ ...this.dados(sql), proporcao: 0.25 });
      assert.equal(segundo.nome, sql);
      assert.equal(segundo.proporcao, 0.25);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 10 }).total, 2);
      this.ok('create: ID, retorno persistido, timestamps UTC, zero/string vazia/null e texto semelhante a SQL');
    } finally { conexao.fechar(); }
  }

  private verificarCicloCompleto(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const controle = repository.create(this.dados('Controle fictício'));
      const criado = repository.create(this.dados('Ciclo completo fictício'));
      assert.deepEqual(repository.findById(criado.id), criado);
      const listado = repository.findAll({ pagina: 2, tamanho: 1 });
      assert.deepEqual(listado, { itens: [criado], pagina: 2, tamanho: 1, total: 2, totalPaginas: 2 });

      const atualizado = repository.update(criado.id, { observacao: 'Após atualização fictícia', quantidade: 7 });
      assert.ok(atualizado);
      assert.equal(atualizado.id, criado.id);
      assert.equal(atualizado.nome, criado.nome);
      assert.equal(atualizado.imutavel, criado.imutavel);
      assert.equal(atualizado.criado_em, criado.criado_em);
      assert.equal(atualizado.observacao, 'Após atualização fictícia');
      assert.equal(atualizado.quantidade, 7);
      assert.deepEqual(repository.findById(criado.id), atualizado);
      assert.deepEqual(repository.findAll({ pagina: 2, tamanho: 1 }), {
        itens: [atualizado], pagina: 2, tamanho: 1, total: 2, totalPaginas: 2
      });

      assert.equal(repository.delete(criado.id), true);
      assert.equal(repository.findById(criado.id), undefined);
      assert.equal(repository.update(criado.id, { nome: 'Ausente fictício' }), undefined);
      assert.equal(repository.delete(criado.id), false);
      assert.deepEqual(repository.findAll({ pagina: 2, tamanho: 1 }), {
        itens: [], pagina: 2, tamanho: 1, total: 1, totalPaginas: 1
      });
      assert.deepEqual(repository.findById(controle.id), controle, 'O ciclo não pode alterar outro registro.');
      assert.deepEqual(repository.findAll({ pagina: 1, tamanho: 1 }).itens, [controle]);
      assert.deepEqual(conexao.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(conexao.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.ok('integração: create → findById → findAll → update parcial → releituras → delete → ausência; controle preservado');
    } finally { conexao.fechar(); }
  }

  private async verificarUpdate(): Promise<void> {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const inicial = repository.create({ ...this.dados(), quantidade: 3, ativo: 1, proporcao: 0.5, observacao: 'Inicial' });
      await new Promise<void>((resolver): void => { setTimeout(resolver, 10); });
      const antes = Date.now();
      const parcial = repository.update(inicial.id, { nome: 'Alterado fictício' });
      assert.ok(parcial);
      assert.equal(parcial.nome, 'Alterado fictício');
      assert.equal(parcial.observacao, inicial.observacao);
      assert.equal(parcial.quantidade, inicial.quantidade);
      assert.equal(parcial.imutavel, inicial.imutavel);
      assert.equal(parcial.criado_em, inicial.criado_em);
      assert.notEqual(parcial.atualizado_em, inicial.atualizado_em);
      this.validarInstante(parcial.atualizado_em, antes);
      const multiplo = repository.update(inicial.id, { nome: '', observacao: null, quantidade: 0, ativo: 0, proporcao: 0 });
      assert.ok(multiplo);
      assert.equal(multiplo.nome, '');
      assert.equal(multiplo.observacao, null);
      assert.equal(multiplo.quantidade, 0);
      assert.equal(multiplo.ativo, 0);
      assert.equal(multiplo.proporcao, 0);
      const texto = "'; UPDATE registros_escrita SET nome='SQL'; --";
      const atualizado = repository.update(inicial.id, { observacao: texto });
      assert.equal(atualizado?.observacao, texto);
      assert.deepEqual(atualizado, repository.findById(inicial.id));
      assert.equal(repository.update(999, { nome: 'Ausente fictício' }), undefined);
      this.ok('update: parcial/múltiplo, omitidos, null/zero/string vazia, timestamps e ID inexistente');
    } finally { conexao.fechar(); }
  }

  private verificarEntradas(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const inicial = repository.create(this.dados());
      const criacoes: unknown[] = [null, undefined, [], {}, this.semCampo('nome'),
        { ...this.dados(), extra: 'x' }, { ...this.dados(), id: 4 },
        { ...this.dados(), criado_em: 'x' }, { ...this.dados(), atualizado_em: 'x' },
        { ...this.dados(), nome: undefined }, { ...this.dados(), nome: null },
        { ...this.dados(), observacao: undefined }, { ...this.dados(), ativo: false },
        { ...this.dados(), quantidade: 1.5 }, { ...this.dados(), quantidade: Number.MAX_SAFE_INTEGER + 1 },
        { ...this.dados(), proporcao: NaN }, { ...this.dados(), proporcao: Infinity },
        { ...this.dados(), nome: {} }, { ...this.dados(), nome: new Date() },
        { ...this.dados(), nome: (): string => 'x' }, { ...this.dados(), proporcao: 1n },
        { ...this.dados(), 'nome; DROP TABLE registros_escrita': 'x' }];
      for (const dados of criacoes) this.erro(() => repository.create(dados as Criacao), 'ENTRADA_INVALIDA');
      const atualizacoes: unknown[] = [null, undefined, [], {}, { extra: 'x' }, { id: 4 },
        { criado_em: 'x' }, { atualizado_em: 'x' }, { imutavel: 'não autorizado' },
        { nome: undefined }, { observacao: undefined }, { nome: null }, { quantidade: null },
        { ativo: false }, { nome: 1 }, { quantidade: 1.5 }, { quantidade: Infinity },
        { quantidade: Number.MAX_SAFE_INTEGER + 1 }, { proporcao: NaN },
        { 'nome = ? WHERE 1=1 --': 'x' }];
      for (const dados of atualizacoes) this.erro(() => repository.update(inicial.id, dados as Atualizacao), 'ENTRADA_INVALIDA');
      // Campos protegidos escondidos pelo estreitamento de uma variável também são rejeitados.
      const extra = { ...this.dados(), id: 10 };
      const estreitado: Omit<Criacao, 'id' | 'criado_em' | 'atualizado_em'> = extra;
      this.erro(() => repository.create(estreitado), 'ENTRADA_INVALIDA');
      for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1 OR 1=1', null, undefined, {}, 1n]) {
        this.erro(() => repository.update(id as number, { nome: 'Outro' }), 'ENTRADA_INVALIDA');
        this.erro(() => repository.delete(id as number), 'ENTRADA_INVALIDA');
      }
      this.erro(() => repository.update(999, {}), 'ENTRADA_INVALIDA');
      assert.deepEqual(repository.findById(inicial.id), inicial);
      assert.equal(repository.findAll({ pagina: 1, tamanho: 10 }).total, 1);
      this.ok('validação: campos ausentes/desconhecidos/protegidos, undefined, tipos, booleanos e IDs inválidos');
    } finally { conexao.fechar(); }
  }

  private semCampo(campo: string): Record<string, unknown> {
    const dados: Record<string, unknown> = { ...this.dados() };
    delete dados[campo];
    return dados;
  }

  private verificarAcessores(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const inicial = repository.create(this.dados());
      let chamadas = 0;
      const getter = { ...this.dados() };
      Object.defineProperty(getter, 'nome', { enumerable: true, get: (): string => { chamadas++; return 'x'; } });
      const setter = { nome: 'x' };
      Object.defineProperty(setter, 'nome', { enumerable: true, set: (_valor: unknown): void => { chamadas++; } });
      const proxy = new Proxy(this.dados(), { ownKeys: (): never => { chamadas++; throw new Error(); } });
      const revogado = Proxy.revocable({ nome: 'x' }, {});
      revogado.revoke();
      const prototipo = Object.setPrototypeOf({ ...this.dados() }, { inesperado: true });
      const oculta = { ...this.dados() };
      Object.defineProperty(oculta, 'nome', { value: 'x', enumerable: false });
      for (const valor of [getter, proxy, prototipo, oculta, { ...this.dados(), [Symbol('extra')]: 1 }]) {
        this.erro(() => repository.create(valor as Criacao), 'ENTRADA_INVALIDA');
      }
      for (const valor of [setter, revogado.proxy, new Date(), new Map(), { nome: { toString: (): string => { chamadas++; return 'x'; } } }]) {
        this.erro(() => repository.update(inicial.id, valor as Atualizacao), 'ENTRADA_INVALIDA');
      }
      assert.equal(chamadas, 0);
      const simplesNulo: Criacao = Object.assign(Object.create(null) as Criacao, this.dados('Protótipo nulo fictício'));
      assert.equal(repository.create(simplesNulo).nome, simplesNulo.nome);
      assert.deepEqual(repository.findById(inicial.id), inicial);
      this.ok('objetos: getters/setters/proxies/coleções/protótipos rejeitados sem execução; protótipo nulo aceito');
    } finally { conexao.fechar(); }
  }

  private verificarIntegridade(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const primeiro = repository.create(this.dados('Primeiro fictício'));
      const segundo = repository.create(this.dados('Segundo fictício'));
      this.erro(() => repository.create(this.dados('Primeiro fictício')), 'CONFLITO');
      this.erro(() => repository.create({ ...this.dados('FK fictícia'), pai_id: 999 }), 'CONFLITO');
      this.erro(() => repository.create({ ...this.dados('CHECK fictício'), quantidade: -1 }), 'CONFLITO');
      this.erro(() => repository.update(segundo.id, { nome: primeiro.nome }), 'CONFLITO');
      this.erro(() => repository.update(primeiro.id, { quantidade: -1 }), 'CONFLITO');
      this.erro(() => repository.update(primeiro.id, { pai_id: 999 }), 'CONFLITO');
      assert.deepEqual(repository.findById(primeiro.id), primeiro);
      assert.deepEqual(repository.findById(segundo.id), segundo);
      conexao.preparar<[number], never>('INSERT INTO dependentes_escrita (registro_id) VALUES (?)').run(primeiro.id);
      this.erro(() => repository.delete(primeiro.id), 'CONFLITO');
      assert.deepEqual(repository.findById(primeiro.id), primeiro);
      assert.equal(repository.delete(segundo.id), true);
      assert.equal(repository.delete(segundo.id), false);
      assert.equal(repository.delete(999), false);
      assert.equal(repository.findById(segundo.id), undefined);
      assert.deepEqual(conexao.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(conexao.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      assert.equal(conexao.preparar<[], { foreign_keys: number }>('PRAGMA foreign_keys').get()?.foreign_keys, 1);
      conexao.fechar();
      this.erro(() => repository.create(this.dados()), 'INTERNO');
      this.erro(() => repository.update(1, { nome: 'x' }), 'INTERNO');
      this.erro(() => repository.delete(1), 'INTERNO');
      this.ok('UNIQUE/CHECK/FK, delete RESTRICT, true/false e erros sem SQL/parâmetros/cause');
    } finally { conexao.fechar(); }
  }

  private verificarTransacoes(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const original = repository.create(this.dados('Original fictício'));
      let idRevertido = 0;
      const falha = new Error('Rollback externo proposital.');
      assert.throws(() => conexao.transacao((): void => {
        idRevertido = repository.create(this.dados('Revertido fictício')).id;
        assert.equal(repository.update(original.id, { nome: 'Alteração revertida' })?.nome, 'Alteração revertida');
        assert.equal(repository.delete(original.id), true);
        assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, true);
        throw falha;
      }), (erro: unknown): boolean => erro === falha);
      assert.equal(repository.findById(idRevertido), undefined);
      assert.deepEqual(repository.findById(original.id), original);
      let idConfirmado = 0;
      conexao.transacao((): void => {
        idConfirmado = repository.create(this.dados('Confirmado fictício')).id;
        assert.equal(repository.update(idConfirmado, { nome: 'Confirmado alterado' })?.nome, 'Confirmado alterado');
        // Falha interna reverte só seu savepoint; o chamador decide continuar.
        this.erro(() => repository.update(idConfirmado, { nome: original.nome }), 'CONFLITO');
        assert.equal(repository.findById(idConfirmado)?.nome, 'Confirmado alterado');
        assert.equal(repository.delete(original.id), true);
        assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, true);
      });
      assert.equal(repository.findById(original.id), undefined);
      assert.equal(repository.findById(idConfirmado)?.nome, 'Confirmado alterado');
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.ok('savepoints: rollback externo das três operações, commit externo e conflito interno recuperável');
    } finally { conexao.fechar(); }
  }

  private verificarRetornoAtomico(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      // Confere a releitura depois de AFTER triggers, sem depender de RETURNING.
      conexao.executarEstrutura(`CREATE TRIGGER ajustar_escrita AFTER INSERT ON registros_escrita
        BEGIN UPDATE registros_escrita SET observacao = 'Após trigger fictício' WHERE id = NEW.id; END;`);
      const criado = repository.create(this.dados());
      assert.equal(criado.observacao, 'Após trigger fictício');
      conexao.executarEstrutura(`DROP TRIGGER ajustar_escrita;
        CREATE TRIGGER remover_escrita AFTER INSERT ON registros_escrita
        BEGIN DELETE FROM registros_escrita WHERE id = NEW.id; END;`);
      this.erro(() => repository.create(this.dados('Removido fictício')), 'INTERNO');
      assert.equal(repository.findAll({ pagina: 1, tamanho: 10 }).total, 1);
      conexao.executarEstrutura(`DROP TRIGGER remover_escrita;
        CREATE TRIGGER remover_update AFTER UPDATE ON registros_escrita
        BEGIN DELETE FROM registros_escrita WHERE id = NEW.id; END;`);
      this.erro(() => repository.update(criado.id, { nome: 'Mudança revertida' }), 'INTERNO');
      assert.deepEqual(repository.findById(criado.id), criado);
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.ok('atomicidade: releitura após AFTER trigger e rollback quando o retorno persistido não pode ser obtido');
    } finally { conexao.fechar(); }
  }

  private verificarFalhaReleituraCreate(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const anterior = repository.create(this.dados('Anterior fictício'));
      const paginaAnterior = repository.findAll({ pagina: 1, tamanho: 10 });
      this.comFalhaReleitura(conexao, (): void => {
        assert.equal(conexao.preparar<[], { total: number }>(
          'SELECT COUNT(*) AS total FROM registros_escrita'
        ).get()?.total, 2, 'A inserção deve ter ocorrido antes da falha de releitura.');
      }, (falha: Error): void => {
        this.erro(() => repository.create(this.dados('Inserção revertida fictícia')), 'INTERNO', falha);
      });
      assert.deepEqual(repository.findAll({ pagina: 1, tamanho: 10 }), paginaAnterior,
        'Create com releitura inválida não pode deixar a inserção persistida.');
      assert.deepEqual(repository.findById(anterior.id), anterior);
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.ok('create: exceção na consulta de releitura desfaz inserção e preserva dados anteriores, sem vazamento');
    } finally { conexao.fechar(); }
  }

  private verificarFalhaReleituraUpdate(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      const anterior = repository.create(this.dados('Anterior fictício'));
      const outro = repository.create(this.dados('Outro fictício'));
      const paginaAnterior = repository.findAll({ pagina: 1, tamanho: 10 });
      this.comFalhaReleitura(conexao, (): void => {
        const alterado = conexao.preparar<[number], { nome: string; quantidade: number }>(
          'SELECT nome, quantidade FROM registros_escrita WHERE id = ?'
        ).get(anterior.id);
        assert.deepEqual(alterado, { nome: 'Alteração revertida fictícia', quantidade: 7 },
          'O update deve ter ocorrido antes da falha de releitura.');
      }, (falha: Error): void => {
        this.erro(() => repository.update(anterior.id, { nome: 'Alteração revertida fictícia', quantidade: 7 }), 'INTERNO', falha);
      });
      assert.deepEqual(repository.findById(anterior.id), anterior,
        'Update com releitura inválida deve restaurar todos os campos e timestamps anteriores.');
      assert.deepEqual(repository.findById(outro.id), outro);
      assert.deepEqual(repository.findAll({ pagina: 1, tamanho: 10 }), paginaAnterior);
      assert.equal(conexao.preparar<[], unknown>('SELECT 1').database.inTransaction, false);
      this.ok('update: exceção na consulta de releitura reverte campos e timestamps, sem alterações parciais ou vazamento');
    } finally { conexao.fechar(); }
  }

  private comFalhaReleitura(conexao: Conexao, verificarEscrita: () => void, operacao: (falha: Error) => void): void {
    const original = conexao.preparar;
    const preparar = original.bind(conexao);
    const falha = new Error('SQL_INTERNO_FICTICIO SELECT registro WHERE id = ?; PARAMETRO_FICTICIO_SECRETO', {
      cause: new Error('CAUSA_INTERNA_FICTICIA')
    });
    let falhas = 0;
    let verificacaoFalhou = false;
    let erroVerificacao: unknown;
    // Somente esta instância em memória é instrumentada; o método de produção
    // e o protótipo global não são alterados. A restauração ocorre mesmo em falha.
    conexao.preparar = <Entrada extends unknown[], Saida>(sql: string): Database.Statement<Entrada, Saida> => {
      if (sql.startsWith('SELECT ') && sql.includes('FROM "registros_escrita" WHERE "id" = ?')) {
        falhas++;
        // Uma asserção do teste não pode ser confundida com a falha esperada
        // e sanitizada pelo repository; ela é reapresentada fora da operação.
        try { verificarEscrita(); } catch (erro: unknown) {
          verificacaoFalhou = true;
          erroVerificacao = erro;
        }
        throw falha;
      }
      return preparar<Entrada, Saida>(sql);
    };
    try {
      operacao(falha);
      assert.equal(falhas, 1, 'A falha deve atingir exatamente uma consulta de releitura.');
      if (verificacaoFalhou) throw erroVerificacao;
    } finally {
      conexao.preparar = original;
    }
    assert.equal(conexao.preparar, original);
  }

  private verificarLimiteId(): void {
    const conexao = this.prepararBanco();
    try {
      const repository = new RepositoryEscritaTeste(conexao);
      conexao.preparar<[number], never>(`INSERT INTO registros_escrita
        (id, nome, quantidade, ativo, proporcao, pai_id, imutavel, criado_em, atualizado_em)
        VALUES (?, 'Limite fictício', 0, 0, 0, 1, '', 'UTC', 'UTC')`).run(Number.MAX_SAFE_INTEGER);
      this.erro(() => repository.create(this.dados()), 'INTERNO');
      assert.equal(repository.findAll({ pagina: 1, tamanho: 10 }).total, 1);
      this.ok('ID gerado além do inteiro seguro não vira falso sucesso e a inserção é revertida');
    } finally { conexao.fechar(); }
  }

  private validarInstante(instante: string, antes: number): void {
    assert.equal(new Date(instante).toISOString(), instante);
    assert.ok(instante.endsWith('Z'));
    assert.ok(Date.parse(instante) >= antes && Date.parse(instante) <= Date.now());
  }

  private erro(operacao: () => unknown, codigo: CodigoErroRepository, interno?: Error): void {
    assert.throws(operacao, (erro: unknown): boolean => {
      assert.ok(erro instanceof ErroRepository);
      assert.equal(erro.codigo, codigo);
      assert.equal(erro.message, new ErroRepository(codigo).message);
      assert.equal(Object.hasOwn(erro, 'cause'), false);
      if (interno !== undefined) {
        assert.notEqual(erro, interno);
        for (const marcador of ['SQL_INTERNO_FICTICIO', 'PARAMETRO_FICTICIO_SECRETO', 'CAUSA_INTERNA_FICTICIA']) {
          assert.equal(JSON.stringify(erro).includes(marcador), false);
          assert.equal(erro.stack?.includes(marcador), false);
        }
      }
      return true;
    });
  }

  private ok(mensagem: string): void {
    this.grupos++;
    console.log('OK: ' + mensagem);
  }
}

void new VerificarEscritasRepository().executar();
