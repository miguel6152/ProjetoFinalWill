import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import type { Migracao } from '../src/database/Migracao';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Composicao } from '../src/main/Composicao';
import { VerificarMigrationsSincronas } from './VerificarMigrationsSincronas';

type Valor = string | number | null;
interface Coluna { name: string; type: string; notnull: number; pk: number }
interface Chave { table: string; from: string; to: string; on_delete: string }

class VerificarBanco {
  private readonly instante: string = '2026-11-13T12:00:00.000Z';
  private readonly tabelas: readonly string[] = [
    'usuarios', 'alunos', 'planos', 'matriculas', 'pagamentos', 'instrutores',
    'aulas', 'inscricoes_aula', 'avaliacoes_fisicas', 'notificacoes'
  ];
  private readonly migracao: Migracao001EstruturaInicial = new Migracao001EstruturaInicial();
  private grupos: number = 0;

  public async executar(): Promise<void> {
    const limite = setTimeout((): void => app.exit(1), 30000);
    let conexao: Conexao | undefined;
    try {
      await app.whenReady();
      assert.equal(process.versions.electron, '45.3.2');
      conexao = new Conexao(':memory:');
      assert.deepEqual(conexao.preparar<[number], { valor: number }>('SELECT ? AS valor').get(42), { valor: 42 });
      assert.deepEqual(conexao.preparar<[], { foreign_keys: number }>('PRAGMA foreign_keys').get(), { foreign_keys: 1 });
      console.log(`Runtime: Electron ${process.versions.electron}, Node ${process.versions.node}, ABI ${process.versions.modules}, Node-API ${process.versions.napi}`);
      this.ok('carregamento nativo e consulta parametrizada no processo Main do Electron');
      new Migrador(conexao, [this.migracao]).executar();
      this.verificarSchema(conexao);
      this.povoar(conexao);
      this.verificarChaves(conexao);
      this.verificarConstraints(conexao);
      this.verificarTransacoes(conexao);
      this.verificarMigrations();
      await new VerificarMigrationsSincronas().executar();
      this.ok('migrations síncronas: tipos, rejeição de retornos e revogação após commit/rollback');
      this.verificarPersistencia();
      assert.deepEqual(conexao.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.deepEqual(conexao.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }]);
      this.ok('foreign_key_check e integrity_check');
      console.log(`OK: ${this.grupos} grupos de verificações do banco. Somente memória e arquivos temporários.`);
      conexao.fechar();
      clearTimeout(limite);
      app.exit(0);
    } catch (erro: unknown) {
      conexao?.fechar();
      clearTimeout(limite);
      console.error(erro instanceof Error ? erro.message : 'Falha desconhecida no teste do banco.');
      app.exit(1);
    }
  }

  private verificarSchema(conexao: Conexao): void {
    const documento: string = readFileSync(path.resolve(__dirname, '../../docs/ARQUITETURA.md'), 'utf8');
    const diagrama: string | undefined = documento.match(/```mermaid\s+erDiagram([\s\S]*?)```/)?.[1];
    assert.ok(diagrama);
    const anulaveis: Record<string, readonly string[]> = {
      alunos: ['email', 'telefone', 'complemento', 'telegram_chat_id', 'autorizado_notificar_em'],
      pagamentos: ['pago_em', 'forma_pagamento'], aulas: ['latitude', 'longitude'],
      avaliacoes_fisicas: ['cintura_cm', 'quadril_cm', 'braco_cm', 'coxa_cm', 'observacoes'],
      notificacoes: ['enviada_em', 'proxima_tentativa_em', 'mensagem_id_externo', 'erro_codigo']
    };
    const existentes = conexao.preparar<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((linha): string => linha.name);
    assert.deepEqual(existentes, [...this.tabelas, 'migrations'].sort());
    for (const tabela of this.tabelas) {
      const trecho: string | undefined = diagrama.match(new RegExp(`\\b${tabela} \\{([^}]+)\\}`))?.[1];
      assert.ok(trecho);
      const esperadas: RegExpMatchArray[] = [...trecho.matchAll(/\b(INTEGER|TEXT|REAL) (\w+)(?: (PK|FK,UK|FK|UK))?/g)];
      const colunas = conexao.preparar<[], Coluna>(`PRAGMA table_info(${tabela})`).all();
      assert.equal(colunas.length, esperadas.length, tabela);
      for (const coluna of colunas) {
        const esperada = esperadas.find((item): boolean => item[2] === coluna.name);
        assert.ok(esperada, `${tabela}.${coluna.name}`);
        assert.equal(coluna.type, esperada[1]);
        assert.equal(coluna.pk, coluna.name === 'id' ? 1 : 0);
        if (coluna.name !== 'id') assert.equal(coluna.notnull, anulaveis[tabela]?.includes(coluna.name) ? 0 : 1);
      }
      for (const esperado of esperadas.filter((item): boolean => item[3]?.includes('UK') === true)) {
        const unicos = conexao.preparar<[], { name: string; unique: number }>(`PRAGMA index_list(${tabela})`).all();
        assert.ok(unicos.some((indice): boolean => indice.unique === 1 &&
          conexao.preparar<[string], { name: string }>('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(indice.name).map((item): string => item.name).join(',') === esperado[2]));
      }
    }
    const indices = conexao.preparar<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"
    ).all();
    for (const nome of ['idx_matriculas_fim', 'idx_pagamentos_vencimento', 'idx_aulas_inicio', 'idx_avaliacoes_aluno_data']) {
      assert.ok(indices.some((indice): boolean => indice.name === nome));
    }
    this.ok('dez tabelas, colunas/tipos/nulabilidade da arquitetura, PKs, unicidade e índices');
  }

  private povoar(conexao: Conexao): void {
    this.inserir(conexao, 'usuarios', { nome: 'Instrutor Fictício', email: 'instrutor@example.invalid', senha_hash: '$2b$12$' + 'A'.repeat(53), perfil: 'instrutor', ativo: 1 });
    this.inserir(conexao, 'alunos', { nome: 'Aluno Fictício', cpf: '00000000000', data_nascimento: '2000-01-01', cep: '00000000', logradouro: 'Rua Fictícia', numero: '0', bairro: 'Bairro Fictício', cidade: 'Cidade Fictícia', uf: 'SP', ativo: 1 });
    this.inserir(conexao, 'planos', { nome: 'Plano Fictício', duracao_meses: 1, valor_centavos: 10000, ativo: 1 });
    this.inserir(conexao, 'matriculas', { aluno_id: 1, plano_id: 1, data_inicio: '2026-11-01', data_fim: '2026-11-30', valor_contratado_centavos: 10000, situacao: 'ativa' });
    this.inserir(conexao, 'pagamentos', { matricula_id: 1, competencia: '2026-11', data_vencimento: '2026-11-10', valor_centavos: 10000, situacao: 'pendente' });
    this.inserir(conexao, 'instrutores', { usuario_id: 1, nome: 'Instrutor Fictício', email: 'instrutor@example.invalid', telefone: '00000000000', especialidade: 'Funcional', ativo: 1 });
    this.inserir(conexao, 'aulas', { instrutor_id: 1, modalidade: 'funcional', inicio_em: this.instante, fim_em: '2026-11-13T13:00:00.000Z', capacidade: 10, ao_ar_livre: 0, local: 'Sala Fictícia', situacao: 'agendada' });
    this.inserir(conexao, 'inscricoes_aula', { aula_id: 1, aluno_id: 1, situacao: 'ativa', presenca: 'nao_registrada' });
    this.inserir(conexao, 'avaliacoes_fisicas', { aluno_id: 1, instrutor_id: 1, realizada_em: this.instante, peso_kg: 70, altura_cm: 170 });
    this.inserir(conexao, 'notificacoes', { matricula_id: 1, tipo: 'vencimento_plano', canal: 'telegram', chave_deduplicacao: 'teste-1', agendada_para: this.instante, situacao: 'pendente', tentativas: 0 });
  }

  private inserir(conexao: Conexao, tabela: string, dados: Record<string, Valor>): void {
    assert.ok(this.tabelas.includes(tabela));
    const registro: Record<string, Valor> = { ...dados, criado_em: this.instante, atualizado_em: this.instante };
    const colunas: string[] = Object.keys(registro);
    // Identificadores vêm exclusivamente dos fixtures internos; valores são parâmetros.
    conexao.preparar<Valor[], never>(
      `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map((): string => '?').join(', ')})`
    ).run(...Object.values(registro));
  }

  private verificarChaves(conexao: Conexao): void {
    const relacionamentos: Record<string, Record<string, string>> = {
      matriculas: { aluno_id: 'alunos', plano_id: 'planos' }, pagamentos: { matricula_id: 'matriculas' },
      instrutores: { usuario_id: 'usuarios' }, aulas: { instrutor_id: 'instrutores' },
      inscricoes_aula: { aula_id: 'aulas', aluno_id: 'alunos' },
      avaliacoes_fisicas: { aluno_id: 'alunos', instrutor_id: 'instrutores' }, notificacoes: { matricula_id: 'matriculas' }
    };
    let total: number = 0;
    for (const tabela of this.tabelas) {
      const chaves = conexao.preparar<[], Chave>(`PRAGMA foreign_key_list(${tabela})`).all();
      assert.equal(chaves.length, Object.keys(relacionamentos[tabela] ?? {}).length);
      for (const chave of chaves) {
        assert.equal(chave.table, relacionamentos[tabela]?.[chave.from]);
        assert.equal(chave.to, 'id');
        assert.equal(chave.on_delete, 'RESTRICT');
        assert.throws(() => conexao.preparar<[number], never>(`UPDATE ${tabela} SET ${chave.from} = ? WHERE id = 1`).run(99999), /FOREIGN KEY/);
        assert.throws(() => conexao.preparar<[number], never>(`DELETE FROM ${chave.table} WHERE id = ?`).run(1), /FOREIGN KEY/);
        const indices = conexao.preparar<[], { name: string }>(`PRAGMA index_list(${tabela})`).all();
        assert.ok(indices.some((indice): boolean => conexao.preparar<[string], { name: string }>(
          'SELECT name FROM pragma_index_info(?) ORDER BY seqno'
        ).get(indice.name)?.name === chave.from), `Índice da FK ${tabela}.${chave.from}`);
        total++;
      }
    }
    assert.equal(total, 10);
    this.ok('dez FKs reais, índices, rejeição de órfãos e exclusão RESTRICT em cada vínculo');
  }

  private verificarConstraints(conexao: Conexao): void {
    const invalidos: readonly [string, string, Valor][] = [
      ['usuarios', 'perfil', 'visitante'], ['usuarios', 'ativo', 2], ['usuarios', 'email', ' MAIUSCULO@example.invalid '],
      ['alunos', 'cpf', '123'], ['alunos', 'nome', null], ['alunos', 'data_nascimento', '2026-02-30'],
      ['planos', 'duracao_meses', 2], ['planos', 'valor_centavos', -1], ['planos', 'valor_centavos', 1.5],
      ['matriculas', 'situacao', 'invalida'], ['matriculas', 'data_fim', '2026-10-01'],
      ['pagamentos', 'competencia', '2026-13'], ['pagamentos', 'situacao', 'pago'], ['pagamentos', 'forma_pagamento', 'invalida'],
      ['aulas', 'capacidade', 0], ['aulas', 'ao_ar_livre', 1], ['aulas', 'latitude', 91], ['aulas', 'longitude', -181],
      ['aulas', 'fim_em', '2026-11-13T11:00:00.000Z'], ['aulas', 'inicio_em', 'invalido'],
      ['inscricoes_aula', 'presenca', 'invalida'], ['inscricoes_aula', 'situacao', 'invalida'],
      ['avaliacoes_fisicas', 'peso_kg', 0], ['avaliacoes_fisicas', 'cintura_cm', -1],
      ['notificacoes', 'tentativas', -1], ['notificacoes', 'situacao', 'invalida']
    ];
    for (const [tabela, coluna, valor] of invalidos) {
      assert.throws(() => conexao.preparar<[Valor], never>(`UPDATE ${tabela} SET ${coluna} = ? WHERE id = 1`).run(valor), /constraint|datatype|cannot store/i, `${tabela}.${coluna}`);
    }
    for (const [tabela, colunas] of [
      ['usuarios', 'nome,email,senha_hash,perfil,ativo'],
      ['alunos', 'nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo'],
      ['instrutores', 'usuario_id,nome,email,telefone,especialidade,ativo'],
      ['pagamentos', 'matricula_id,competencia,data_vencimento,valor_centavos,situacao'],
      ['inscricoes_aula', 'aula_id,aluno_id,situacao,presenca'],
      ['notificacoes', 'matricula_id,tipo,canal,chave_deduplicacao,agendada_para,situacao,tentativas']
    ] as const) {
      assert.throws(() => conexao.executarEstrutura(`INSERT INTO ${tabela} (${colunas},criado_em,atualizado_em) SELECT ${colunas},criado_em,atualizado_em FROM ${tabela} WHERE id=1`), /UNIQUE/);
    }
    conexao.preparar<[], never>("UPDATE aulas SET ao_ar_livre=1, latitude=0, longitude=0 WHERE id=1").run();
    conexao.preparar<[], never>("UPDATE aulas SET ao_ar_livre=0, latitude=NULL, longitude=NULL WHERE id=1").run();
    conexao.preparar<[string], never>("UPDATE pagamentos SET situacao='pago', pago_em=?, forma_pagamento='pix' WHERE id=1").run(this.instante);
    // Provedor e políticas comerciais continuam pendentes: o banco não os decide.
    conexao.preparar<[], never>("UPDATE notificacoes SET canal='email' WHERE id=1").run();
    const texto: string = "Teste ' ; DROP TABLE alunos; --";
    conexao.preparar<[string], never>('UPDATE usuarios SET nome=? WHERE id=1').run(texto);
    assert.equal(conexao.preparar<[], { nome: string }>('SELECT nome FROM usuarios WHERE id=1').get()?.nome, texto);
    assert.equal(conexao.preparar<[], { total: number }>('SELECT count(*) AS total FROM alunos').get()?.total, 1);
    this.ok('constraints, duplicidades, campos opcionais, coordenadas condicionais e parâmetros');
  }

  private verificarTransacoes(conexao: Conexao): void {
    const original: string | undefined = conexao.preparar<[], { nome: string }>('SELECT nome FROM planos WHERE id=1').get()?.nome;
    assert.throws(() => conexao.transacao((): void => {
      conexao.preparar<[string], never>('UPDATE planos SET nome=? WHERE id=1').run('Alteração que deve voltar');
      conexao.preparar<[], never>('UPDATE matriculas SET aluno_id=99999 WHERE id=1').run();
    }), /FOREIGN KEY/);
    assert.equal(conexao.preparar<[], { nome: string }>('SELECT nome FROM planos WHERE id=1').get()?.nome, original);
    conexao.transacao((): void => {
      conexao.preparar<[string], never>('UPDATE planos SET nome=? WHERE id=1').run('Confirmado');
      assert.throws(() => conexao.transacao((): void => {
        conexao.preparar<[string], never>('UPDATE planos SET nome=? WHERE id=1').run('Savepoint');
        throw new Error('falha interna');
      }), /falha interna/);
      assert.equal(conexao.preparar<[], { nome: string }>('SELECT nome FROM planos WHERE id=1').get()?.nome, 'Confirmado');
    });
    assert.equal(conexao.preparar<[], { nome: string }>('SELECT nome FROM planos WHERE id=1').get()?.nome, 'Confirmado');
    this.ok('commit, rollback de múltiplas operações e savepoint aninhado');
  }

  private verificarMigrations(): void {
    const inicial: Conexao = new Conexao(':memory:');
    try {
      const primeiraComFalha: Migracao = {
        versao: 1, nome: this.migracao.nome, aplicar: (banco): undefined => {
          this.migracao.aplicar(banco);
          throw new Error('falha inicial intencional');
        }
      };
      assert.throws(() => new Migrador(inicial, [primeiraComFalha]).executar(), /falha inicial/);
      assert.equal(inicial.preparar<[], { total: number }>("SELECT count(*) AS total FROM sqlite_master WHERE type='table' AND name<>'migrations'").get()?.total, 0);
      assert.equal(inicial.preparar<[], { total: number }>('SELECT count(*) AS total FROM migrations').get()?.total, 0);
      new Migrador(inicial, [this.migracao]).executar();
    } finally {
      inicial.fechar();
    }
    const conexao: Conexao = new Conexao(':memory:');
    const falha: Migracao = {
      versao: 2, nome: 'falha_teste', aplicar: (banco): undefined => {
        banco.executarEstrutura('CREATE TABLE estrutura_teste (id INTEGER PRIMARY KEY);');
        banco.executarEstrutura('INSERT INTO tabela_inexistente VALUES (1);');
      }
    };
    try {
      assert.throws(() => new Migrador(conexao, [this.migracao, falha]).executar(), /no such table/);
      assert.equal(conexao.preparar<[], { total: number }>("SELECT count(*) AS total FROM sqlite_master WHERE name='estrutura_teste'").get()?.total, 0);
      assert.equal(conexao.preparar<[], { total: number }>('SELECT count(*) AS total FROM migrations').get()?.total, 1);
      assert.throws(() => new Migrador(conexao, [falha]).executar(), /Sequência/);
      assert.throws(() => new Migrador(conexao, [this.migracao, this.migracao]).executar(), /Sequência/);
      assert.throws(() => new Migrador(conexao, [{ ...this.migracao, nome: 'divergente', aplicar: this.migracao.aplicar.bind(this.migracao) }]).executar(), /Histórico/);
      new Migrador(conexao, [this.migracao]).executar();
      const segunda: Migracao = { versao: 2, nome: 'segunda_teste', aplicar: (banco): undefined => {
        banco.executarEstrutura('CREATE TABLE estrutura_teste (id INTEGER PRIMARY KEY);');
      } };
      conexao.executarEstrutura(`CREATE TRIGGER falha_registro BEFORE INSERT ON migrations WHEN NEW.versao=2 BEGIN SELECT RAISE(ABORT, 'falha registro'); END;`);
      assert.throws(() => new Migrador(conexao, [this.migracao, segunda]).executar(), /falha registro/);
      assert.equal(conexao.preparar<[], { total: number }>("SELECT count(*) AS total FROM sqlite_master WHERE name='estrutura_teste'").get()?.total, 0);
      assert.equal(conexao.preparar<[], { total: number }>('SELECT count(*) AS total FROM migrations').get()?.total, 1);
      conexao.executarEstrutura('DROP TRIGGER falha_registro;');
      new Migrador(conexao, [this.migracao, segunda]).executar();
      new Migrador(conexao, [this.migracao, segunda]).executar();
      assert.equal(conexao.preparar<[], { total: number }>('SELECT count(*) AS total FROM migrations').get()?.total, 2);
      assert.throws(() => new Migrador(conexao, [this.migracao]).executar(), /Histórico/);
      conexao.preparar<[], never>('DELETE FROM migrations WHERE versao=1').run();
      assert.throws(() => new Migrador(conexao, [this.migracao, segunda]).executar(), /Histórico/);
    } finally {
      conexao.fechar();
    }
    this.ok('rollback de DDL e histórico, reaplicação, evolução e histórico incompatível');
  }

  private verificarPersistencia(): void {
    const diretorio: string = mkdtempSync(path.join(tmpdir(), 'academia-banco-teste-'));
    const caminho: string = path.join(diretorio, 'banco.sqlite3');
    let conexao: Conexao | undefined;
    const composicao: Composicao = new Composicao();
    try {
      composicao.iniciar(caminho);
      composicao.encerrar();
      conexao = new Conexao(caminho);
      this.inserir(conexao, 'planos', { nome: 'Persistente Fictício', duracao_meses: 3, valor_centavos: 0, ativo: 1 });
      const historico = conexao.preparar<[], unknown>('SELECT * FROM migrations').all();
      conexao.fechar();
      conexao = new Conexao(caminho);
      new Migrador(conexao, [this.migracao]).executar();
      assert.deepEqual(conexao.preparar<[], unknown>('SELECT * FROM migrations').all(), historico);
      assert.equal(conexao.preparar<[], { nome: string }>('SELECT nome FROM planos WHERE id=1').get()?.nome, 'Persistente Fictício');
      assert.equal(conexao.preparar<[], { foreign_keys: number }>('PRAGMA foreign_keys').get()?.foreign_keys, 1);
      conexao.fechar();
      composicao.iniciar(caminho);
      composicao.encerrar();
      assert.throws(() => composicao.iniciar(path.join(caminho, 'impossivel.sqlite3')));
      composicao.encerrar();
    } finally {
      composicao.encerrar();
      conexao?.fechar();
      // Caminho absoluto criado por mkdtemp, sempre dentro do diretório temporário.
      assert.equal(path.dirname(diretorio), path.resolve(tmpdir()));
      rmSync(diretorio, { recursive: true, force: true });
    }
    this.ok('persistência temporária, reabertura, reaplicação e ciclo de vida da composição');
  }

  private ok(descricao: string): void {
    this.grupos++;
    console.log(`OK ${this.grupos}: ${descricao}`);
  }
}

void new VerificarBanco().executar();
