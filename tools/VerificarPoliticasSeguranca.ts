import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { PoliticaSessao } from '../src/main/seguranca/PoliticaSessao';
import { LimitadorLogin } from '../src/main/seguranca/LimitadorLogin';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import { UsuarioService } from '../src/services/UsuarioService';
import { ValidacaoUsuario } from '../src/services/ValidacaoUsuario';
import { ValidacaoAutenticacao } from '../src/services/ValidacaoAutenticacao';

class VerificarPoliticasSeguranca {
  public async executar(): Promise<void> {
    await app.whenReady();
    this.expiracao();
    await this.limites();
    await this.credenciais();
  }

  private expiracao(): void {
    assert.equal(ValidacaoUsuario.novaSenha.safeParse('🔒'.repeat(14)).success, false);
    assert.equal(ValidacaoUsuario.novaSenha.safeParse('🔒'.repeat(15)).success, true);
    assert.equal(ValidacaoAutenticacao.senha.safeParse('a').success, true, 'Preservar verificação de credencial legada.');
    let agora = 1000;
    const politica = new PoliticaSessao({ inatividadeMs: 100, duracaoMaximaMs: 250, agora: () => agora });
    const sessoes = new SessaoManager(politica), contexto = { webContentsId: 1 };
    sessoes.registrar(contexto); sessoes.estabelecer(contexto, 1, 'a'.repeat(32), 1);
    const primeira = sessoes.obter(contexto), versao = sessoes.versao(contexto);
    agora = 1099; assert.strictEqual(sessoes.obter(contexto), primeira);
    agora = 1198; assert.strictEqual(sessoes.obter(contexto), primeira);
    agora = 1250; assert.equal(sessoes.obter(contexto), undefined, 'Uso não pode prolongar duração absoluta.');
    assert.throws(() => sessoes.conferir(contexto, versao));
    sessoes.estabelecer(contexto, 1, 'a'.repeat(32), 2);
    const segundaVersao = sessoes.versao(contexto);
    agora = 1350; assert.throws(() => sessoes.conferir(contexto, segundaVersao), 'Expiração durante await deve cancelar operação.');
    assert.equal(sessoes.obter(contexto), undefined);
    sessoes.estabelecer(contexto, 1, 'a'.repeat(32), 2);
    agora = 1349; assert.equal(sessoes.obter(contexto), undefined, 'Recuo do relógio não deve estender sessão.');
    assert.throws(() => new PoliticaSessao({ inatividadeMs: 10, duracaoMaximaMs: 5 }));
    assert.throws(() => PoliticaSessao.doAmbiente({ SESSAO_INATIVIDADE_MS: 'invalido' }));
    console.log('OK políticas: inatividade, prazo absoluto, limite exato, cancelamento após await, relógio e configuração inválida; sem sleeps.');
  }

  private async limites(): Promise<void> {
    let agora = 1000;
    const limitador = new LimitadorLogin({ porJanela: 2, porProcesso: 3, simultaneos: 1, intervaloMs: 100, agora: () => agora });
    const a = { webContentsId: 1 }, b = { webContentsId: 2 };
    const liberar = limitador.admitir(a);
    assert.throws(() => limitador.admitir(b));
    liberar(); liberar(); // Liberação idempotente não cria vagas negativas.
    limitador.admitir(a)();
    assert.throws(() => limitador.admitir(a));
    limitador.admitir(b)();
    assert.throws(() => limitador.admitir({ webContentsId: 999 }), 'Reabrir contexto não contorna limite do processo.');
    agora = 1099; assert.throws(() => limitador.admitir(a));
    agora = 1100; limitador.admitir(a)();
    agora = 1099; assert.throws(() => limitador.admitir(a));
    assert.throws(() => LimitadorLogin.doAmbiente({ LOGIN_SIMULTANEOS: '0' }));

    // Limite é aplicado antes de banco/hash, também no verificador usado pelo Main.
    let consultas = 0, hashes = 0;
    const servico = new AutenticacaoService({ dados: {
      buscarPorEmail: async () => { consultas++; throw new Error('falha sintética'); },
      buscarIdentidadePorId: async () => undefined
    }, hash: { gerar: async () => { hashes++; throw new Error('falha sintética'); },
      verificar: async () => false, necessitaAtualizacao: () => false }
    }, new LimitadorLogin({ porJanela: 1, porProcesso: 1, agora: () => 1000 }));
    await assert.rejects(servico.entrar({ email: 'teste@example.invalid', senha: 'sintetica' }, a));
    await assert.rejects(servico.entrar({ email: 'teste@example.invalid', senha: 'sintetica' }, a),
      (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'SEM_PERMISSAO');
    assert.equal(consultas, 0); assert.equal(hashes, 1);
    const pausa = this.pausa();
    const falhaControlada = async (): Promise<never> => { await pausa.aguardar; throw new Error('fim sintético'); };
    const motor = new HashSenhaArgon2({ hash: falhaControlada, verify: falhaControlada, needsRehash: () => false });
    const ocupadas = Array.from({ length: 4 }, () => motor.gerar('credencial sintética'));
    await assert.rejects(motor.gerar('quinta operação'), (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'SEM_PERMISSAO');
    pausa.liberar(); await Promise.allSettled(ocupadas);
    const real = new HashSenhaArgon2(), latencias: number[] = [];
    for (let i = 0; i < 3; i++) {
      const inicio = performance.now(), digest = await real.gerar('credencial sintética de medição');
      assert.equal(await real.verificar('credencial sintética de medição', digest), true);
      latencias.push(performance.now() - inicio);
    }
    console.log(`OK Argon2id: teto global de quatro operações e vagas recuperadas após falha; três ciclos reais hash/verificação em ${latencias.map(v => Math.round(v)).join('/')} ms neste ambiente.`);
    console.log('OK políticas: limites por contexto/processo, concorrência, recuperação temporal e recusa antes do banco/hash; sem bloqueio por email.');
  }

  private pausa(): { inicio: Promise<void>; aguardar: Promise<void>; sinal: () => void; liberar: () => void } {
    let sinal!: () => void, liberar!: () => void;
    return { inicio: new Promise<void>(r => { sinal = r; }), aguardar: new Promise<void>(r => { liberar = r; }),
      sinal: () => sinal(), liberar: () => liberar() };
  }

  private async credenciais(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-credenciais-'));
    const banco = new Conexao(path.join(pasta, 'teste.sqlite3')), externa = new Conexao(path.join(pasta, 'teste.sqlite3'));
    try {
      const migrations = [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()];
      new Migrador(banco, migrations.slice(0, 2)).executar();
      const hash = new HashSenhaArgon2(), senha = 'Credencial anterior sintetica', nova = 'Credencial posterior sintetica';
      const digest = await hash.gerar(senha), repository = new UsuarioRepository(banco);
      repository.create({ nome: 'Admin', email: 'admin@example.invalid', perfil: 'admin', ativo: 1, senha_hash: digest });
      const alvo = repository.create({ nome: 'Alvo', email: 'alvo@example.invalid', perfil: 'admin', ativo: 1, senha_hash: digest });
      const antes = banco.preparar<[], unknown>('SELECT * FROM usuarios ORDER BY id').all();
      banco.executarEstrutura("CREATE TRIGGER falhar_versao BEFORE INSERT ON migrations WHEN NEW.versao=3 BEGIN SELECT RAISE(ABORT,'falha migration 3'); END;");
      assert.throws(() => new Migrador(banco, migrations).executar());
      assert.deepEqual(banco.preparar<[], unknown>('SELECT * FROM usuarios ORDER BY id').all(), antes);
      assert.equal(banco.preparar<[], { name: string }>('PRAGMA table_info(usuarios)').all().some(c => c.name === 'versao_credencial'), false);
      banco.executarEstrutura('DROP TRIGGER falhar_versao');
      new Migrador(banco, migrations).executar(); new Migrador(banco, migrations).executar();
      assert.equal(repository.versaoCredencial(alvo.id), 1);
      const identidade = repository.identidadeConta(alvo.id); assert.ok(identidade);
      assert.throws(() => banco.preparar<[], never>('UPDATE usuarios SET versao_credencial=1 WHERE id=2').run());

      const sessoes = new SessaoManager(), dados = new ConsultaAutenticacaoRepository(banco), autorizador = new Autorizador(sessoes, dados);
      const auth = new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash }), sessoes, autorizador);
      const usuarios = new UsuarioService(repository, hash, autorizador, sessoes);
      const admin = { webContentsId: 1 }, a = { webContentsId: 2 }, b = { webContentsId: 3 }, pendente = { webContentsId: 4 };
      for (const c of [admin, a, b, pendente]) sessoes.registrar(c);
      await auth.entrar({ email: 'admin@example.invalid', senha }, admin);
      for (const c of [a, b]) await auth.entrar({ email: alvo.email, senha }, c);
      const pausaLogin = this.pausa();
      const lenta = new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash: {
        gerar: s => hash.gerar(s), necessitaAtualizacao: h => hash.necessitaAtualizacao(h),
        verificar: async (s, h) => { pausaLogin.sinal(); await pausaLogin.aguardar; return hash.verificar(s, h); }
      } }), sessoes, autorizador);
      const loginAntigo = lenta.entrar({ email: alvo.email, senha }, pendente); await pausaLogin.inicio;
      await usuarios.executar('usuarios:alterar-senha', { id: alvo.id, senha: nova }, admin, () => {});
      assert.equal(repository.versaoCredencial(alvo.id), 2); assert.equal(repository.identidadeConta(alvo.id), identidade);
      assert.equal(sessoes.obter(a), undefined); assert.equal(sessoes.obter(b), undefined);
      pausaLogin.liberar();
      await assert.rejects(loginAntigo, (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'NAO_AUTENTICADO');
      await assert.rejects(auth.entrar({ email: alvo.email, senha }, a));
      for (const c of [a, b]) await auth.entrar({ email: alvo.email, senha: nova }, c);
      const referencias = [sessoes.obter(a), sessoes.obter(b)], versoes = [sessoes.versao(a), sessoes.versao(b)];
      sessoes.revogarCredencial(identidade, 1);
      for (const [i, c] of [a, b].entries()) { assert.strictEqual(sessoes.obter(c), referencias[i]); assert.strictEqual(sessoes.versao(c), versoes[i]); }
      console.log('OK credenciais: upgrade/rollback/reaplicação, duas sessões revogadas, login pendente recusado e sinal antigo preserva credencial nova.');

      const antesFalha = banco.preparar<[number], unknown>('SELECT * FROM usuarios WHERE id=?').get(alvo.id);
      banco.executarEstrutura(`CREATE TABLE falha_credencial (usuario_id INTEGER REFERENCES usuarios(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER falhar_commit_credencial AFTER UPDATE ON usuarios BEGIN INSERT INTO falha_credencial VALUES (-1); END;`);
      await assert.rejects(usuarios.executar('usuarios:alterar-senha', { id: alvo.id, senha }, admin, () => {}));
      assert.deepEqual(banco.preparar<[number], unknown>('SELECT * FROM usuarios WHERE id=?').get(alvo.id), antesFalha);
      for (const [i, c] of [a, b].entries()) { assert.strictEqual(sessoes.obter(c), referencias[i]); assert.strictEqual(sessoes.versao(c), versoes[i]); }
      banco.executarEstrutura('DROP TRIGGER falhar_commit_credencial; DROP TABLE falha_credencial;');

      // Outra conexão também avança a versão pelo trigger, sem sinal local.
      new UsuarioRepository(externa).update(alvo.id, { senha_hash: await hash.gerar(senha) });
      assert.equal(repository.versaoCredencial(alvo.id), 3);
      for (const c of [a, b]) await assert.rejects(auth.obterSessao(c));
      await auth.entrar({ email: alvo.email, senha }, a);
      const pausaEscrita = this.pausa();
      const escritor = new UsuarioService(repository, { gerar: async s => { pausaEscrita.sinal(); await pausaEscrita.aguardar; return hash.gerar(s); },
        verificar: (s, h) => hash.verificar(s, h), necessitaAtualizacao: h => hash.necessitaAtualizacao(h) }, autorizador, sessoes);
      const escrita = escritor.executar('usuarios:criar', { nome: 'Proibido', email: 'proibido@example.invalid', senha, perfil: 'admin', ativo: 1 }, a, () => {});
      await pausaEscrita.inicio;
      await usuarios.executar('usuarios:alterar-senha', { id: alvo.id, senha: nova }, admin, () => {});
      pausaEscrita.liberar(); await assert.rejects(escrita);
      assert.equal(await dados.buscarPorEmail('proibido@example.invalid'), undefined);
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(banco.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      console.log('OK credenciais: falha real de COMMIT preserva hash/versão/sessões; alteração externa e ator com senha revogada não mantêm acesso.');
    } finally {
      externa.fechar(); banco.fechar();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome, /^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta, nome)); }
      rmdirSync(pasta);
    }
  }
}
void new VerificarPoliticasSeguranca().executar().then(() => app.exit(0), (e: unknown) => {
  console.error(e instanceof Error ? e.message : 'Falha de políticas.'); app.exit(1);
});
