import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { once } from 'node:events';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { Migracao004AvisosInternos } from '../src/database/migrations/Migracao004AvisosInternos';
import { NotificacaoRepository } from '../src/repositories/NotificacaoRepository';
import { AvisosService } from '../src/services/AvisosService';

class VerificarAvisos {
  private static readonly dia7 = new Date('2026-12-25T12:00:00Z');

  // Ambas as conexões abrem o mesmo arquivo antes do sinal para disputar o primeiro lançamento.
  public static concorrente(arquivo: string): void {
    const db = new Conexao(arquivo);
    const servico = new AvisosService(new NotificacaoRepository(db));
    parentPort!.once('message', () => {
      try { parentPort!.postMessage(servico.verificar(this.dia7).criados); }
      finally { db.fechar(); parentPort!.close(); }
    });
    parentPort!.postMessage('pronto');
  }

  private static async simultaneos(arquivo: string): Promise<void> {
    const workers = [1, 2].map(() => new Worker(__filename, { workerData: arquivo }));
    try {
      await Promise.all(workers.map(w => once(w, 'message')));
      const resultados = workers.map(w => once(w, 'message'));
      workers.forEach(w => w.postMessage('verificar'));
      assert.deepEqual((await Promise.all(resultados)).flat().sort(), [0, 1]);
    } finally { await Promise.all(workers.map(w => w.terminate())); }
  }

  public static async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-avisos-'));
    const arquivo = path.join(pasta, 'teste.sqlite3');
    let db = new Conexao(arquivo);
    try {
      const anteriores = [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()];
      new Migrador(db, anteriores).executar();
      db.executarEstrutura(`
        INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em)
          VALUES ('Anual',12,0,1,'UTC','UTC');
        INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em)
          VALUES ('Aluno de teste','00000000001','2000-01-01','00000000','Rua','1','Centro','São Paulo','SP',1,'UTC','UTC');
        INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
          VALUES (1,1,'2026-01-01','2027-01-01',0,'ativa','UTC','UTC');
        INSERT INTO notificacoes(matricula_id,tipo,canal,chave_deduplicacao,agendada_para,situacao,tentativas,criado_em,atualizado_em)
          VALUES (1,'vencimento_plano','teste','registro-anterior','UTC','pendente',0,'UTC','UTC');
      `);
      new Migrador(db, [...anteriores, new Migracao004AvisosInternos()]).executar();
      let repo = new NotificacaoRepository(db), servico = new AvisosService(repo);
      assert.equal(servico.verificar(new Date('2026-12-24T12:00:00Z')).criados, 0);
      await this.simultaneos(arquivo);
      db.fechar();
      db = new Conexao(arquivo);
      repo = new NotificacaoRepository(db);
      servico = new AvisosService(repo);
      const ativos = () => repo.listar({ busca: '', estado: 'ativos' });
      const historico = () => repo.listar({ busca: '', estado: 'todos' });
      const verificar = (dia: string) => servico.verificar(new Date(dia + 'T12:00:00Z')).criados;
      assert.equal(servico.verificar(this.dia7).criados, 0);
      assert.equal(ativos()[0]?.antecedencia_dias, 7);
      const id = ativos()[0]!.id;
      assert.ok(repo.ler(id, this.dia7.toISOString()));
      assert.equal(repo.findById(id)?.situacao, 'pendente');
      assert.equal(repo.findById(id)?.enviada_em, null);
      assert.equal(repo.findById(id)?.tentativas, 0);
      assert.equal(verificar('2026-12-29'), 1);
      assert.deepEqual(ativos().map(a => a.antecedencia_dias), [3]);
      assert.equal(repo.findById(id)?.situacao, 'cancelada');
      assert.equal(verificar('2027-01-01'), 1);
      assert.deepEqual(ativos().map(a => a.antecedencia_dias), [0]);
      assert.equal(verificar('2027-01-02'), 0);
      assert.equal(ativos().length, 0);
      db.executarEstrutura("UPDATE matriculas SET data_fim='2027-02-10' WHERE id=1");
      // Reabertura a dois dias do término: só o marco de três dias é elegível.
      assert.equal(verificar('2027-02-08'), 1);
      assert.equal(ativos()[0]?.data_alvo, '2027-02-10');
      assert.equal(ativos()[0]?.antecedencia_dias, 3);
      assert.equal(historico().length, 4);
      db.executarEstrutura("UPDATE matriculas SET data_fim='2027-02-15' WHERE id=1");
      assert.equal(ativos().length, 0);
      assert.equal(verificar('2027-02-08'), 1);
      assert.equal(ativos()[0]?.data_alvo, '2027-02-15');
      db.executarEstrutura("UPDATE matriculas SET situacao='cancelada' WHERE id=1");
      assert.equal(ativos().length, 0);
      assert.equal(verificar('2027-02-15'), 0);
      assert.equal(historico().length, 5);
      assert.equal(repo.findById(1)?.data_alvo, null);
      assert.equal(repo.findById(1)?.situacao, 'pendente');
      assert.deepEqual(db.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2027-03-01T12:00:00Z') });
      const verificacoes = mock.method(servico, 'verificar');
      try {
        db.executarEstrutura("UPDATE matriculas SET situacao='ativa', data_fim='2027-03-08' WHERE id=1");
        servico.iniciar();
        servico.iniciar();
        assert.equal(verificacoes.mock.callCount(), 1);
        assert.equal(ativos()[0]?.antecedencia_dias, 7);
        db.executarEstrutura("UPDATE matriculas SET data_fim='2027-03-04' WHERE id=1");
        mock.timers.tick(30 * 60 * 1000);
        assert.equal(verificacoes.mock.callCount(), 2);
        assert.equal(ativos()[0]?.antecedencia_dias, 3);
        servico.encerrar();
        mock.timers.tick(30 * 60 * 1000);
        assert.equal(verificacoes.mock.callCount(), 2);
      } finally { servico.encerrar(); mock.restoreAll(); mock.timers.reset(); }
      console.log('OK: migração, marcos 7/3/0, concorrência, reinício, recuperação, leitura, renovação e cancelamento.');
    } finally { db.fechar(); rmSync(pasta, { recursive: true, force: true }); }
  }
}

if (isMainThread) {
  void VerificarAvisos.executar().catch(erro => { console.error(erro); process.exitCode = 1; });
} else { VerificarAvisos.concorrente(workerData as string); }
