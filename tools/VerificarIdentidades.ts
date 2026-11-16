import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import { UsuarioService } from '../src/services/UsuarioService';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import type { IdentidadeAutenticada, ContratoDadosAutenticacao } from '../src/main/seguranca/ContratosAutenticacao';
import { ErroUsuario } from '../src/services/ErroUsuario';

/** Regressão de identidade sobre arquivo SQLite real e módulos de produção. */
export class VerificarIdentidades {
  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-identidades-'));
    const banco = new Conexao(path.join(pasta, 'teste.sqlite3'));
    try {
      new Migrador(banco, [new Migracao001EstruturaInicial()]).executar();
      const hash = new HashSenhaArgon2(), repository = new UsuarioRepository(banco);
      const senha = 'Credencial sintética identidade';
      repository.create({ nome: 'Administrador', email: 'admin@example.invalid', perfil: 'admin', ativo: 1, senha_hash: await hash.gerar(senha) });
      const registroAnterior = banco.preparar<[], unknown>('SELECT * FROM usuarios WHERE id = 1').get();
      banco.executarEstrutura("CREATE TRIGGER impedir_upgrade BEFORE UPDATE ON usuarios BEGIN SELECT RAISE(ABORT, 'falha migration prevista'); END;");
      assert.throws(() => new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar(), /falha migration prevista/);
      assert.equal(banco.preparar<[], { name: string }>('PRAGMA table_info(usuarios)').all().some(c => c.name === 'identidade_conta'), false);
      assert.deepEqual(banco.preparar<[], unknown>('SELECT * FROM usuarios WHERE id = 1').get(), registroAnterior);
      assert.equal(banco.preparar<[], { total: number }>('SELECT COUNT(*) AS total FROM migrations').get()?.total, 1);
      banco.executarEstrutura('DROP TRIGGER impedir_upgrade');
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const { identidade_conta: tokenAdmin, versao_credencial: versaoInicial, ...preservado } = banco.preparar<[], { identidade_conta: string } & Record<string, unknown>>('SELECT * FROM usuarios WHERE id=1').get()!;
      assert.equal(versaoInicial, 1);
      assert.match(tokenAdmin, /^[0-9a-f]{32}$/); assert.deepEqual(preservado, registroAnterior);
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      assert.equal(repository.identidadeConta(1), tokenAdmin, 'Reaplicar versões não pode regenerar identidade.');
      assert.throws(() => banco.preparar<[], never>("UPDATE usuarios SET identidade_conta = 'alterada' WHERE id=1").run(), /Identidade imutavel/);
      assert.throws(() => banco.preparar<[string], never>(`INSERT INTO usuarios
        (nome,email,senha_hash,perfil,ativo,criado_em,atualizado_em,identidade_conta)
        VALUES ('Forjada','forjada@example.invalid','hash','admin',1,'UTC','UTC',?)`).run(tokenAdmin), /Identidade gerenciada/);
      assert.equal(repository.obterPublico(2), undefined);
      const sessoes = new SessaoManager(), dados = new ConsultaAutenticacaoRepository(banco);
      const autorizador = new Autorizador(sessoes, dados);
      const credenciais = new AutenticacaoService({ dados, hash });
      const auth = new SessaoAutenticacaoService(credenciais, sessoes, autorizador);
      const usuarios = new UsuarioService(repository, hash, autorizador, sessoes);
      const admin = { webContentsId: 100 }, antiga = { webContentsId: 101 }, outra = { webContentsId: 102 };
      for (const contexto of [admin, antiga, outra]) sessoes.registrar(contexto);
      await auth.entrar({ email: 'admin@example.invalid', senha }, admin);
      for (const perfil of ['recepcao', 'admin'] as const) {
        const alvo = repository.create({ nome: 'Conta antiga', email: 'antiga@example.invalid', perfil, ativo: 1, senha_hash: await hash.gerar(senha) });
        await auth.entrar({ email: 'antiga@example.invalid', senha }, antiga);
        await auth.entrar({ email: 'antiga@example.invalid', senha }, outra);
        const tokenAntigo = repository.identidadeConta(alvo.id);
        await usuarios.executar('usuarios:excluir', { id: alvo.id }, admin, () => {});
        assert.equal(sessoes.obter(antiga), undefined); assert.equal(sessoes.obter(outra), undefined);
        const nova = repository.create({ nome: 'Conta substituta', email: 'nova@example.invalid', perfil: perfil === 'admin' ? 'recepcao' : 'admin', ativo: 1, senha_hash: await hash.gerar('Outra credencial sintética') });
        assert.equal(nova.id, alvo.id, 'O teste precisa reutilizar efetivamente o ID no SQLite.');
        assert.notEqual(repository.identidadeConta(nova.id), tokenAntigo);
        for (const contexto of [antiga, outra]) {
          await assert.rejects(auth.obterSessao(contexto), (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'NAO_AUTENTICADO',
            'Sessão da conta excluída assumiu a identidade substituta.');
          assert.equal(sessoes.obter(contexto), undefined);
        }
        await usuarios.executar('usuarios:excluir', { id: nova.id }, admin, () => {});
      }
      console.log('OK: identidade excluída, reutilização real de ID e duas sessões antigas rejeitadas, nos dois sentidos de perfil.');
      await this.pendencias(banco, repository, hash, senha);
      const tokenPersistido = repository.identidadeConta(1);
      banco.fechar();
      const reaberto = new Conexao(path.join(pasta, 'teste.sqlite3'));
      try {
        new Migrador(reaberto, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
        assert.equal(new UsuarioRepository(reaberto).identidadeConta(1), tokenPersistido);
        assert.deepEqual(reaberto.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
        assert.equal(reaberto.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      } finally { reaberto.fechar(); }
      console.log('OK: migration aditiva preserva dados, rollback de upgrade, identidade imutável e persistência após fechar/reabrir.');
    } finally {
      banco.fechar();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) {
        assert.ok(['teste.sqlite3', 'teste.sqlite3-journal', 'teste.sqlite3-wal', 'teste.sqlite3-shm'].includes(nome));
        unlinkSync(path.join(pasta, nome));
      }
      rmdirSync(pasta);
    }
  }

  private pausa<T>(): { resposta: Promise<T>; iniciada: Promise<void>; iniciar: () => void; concluir: (v: T) => void; falhar: (e: Error) => void } {
    let iniciar!: () => void, concluir!: (v: T) => void, falhar!: (e: Error) => void;
    const iniciada = new Promise<void>(resolve => { iniciar = resolve; });
    const resposta = new Promise<T>((resolve, reject) => { concluir = resolve; falhar = reject; });
    return { resposta, iniciada, iniciar, concluir, falhar };
  }

  private async pendencias(banco: Conexao, repository: UsuarioRepository, hash: HashSenhaArgon2, senha: string): Promise<void> {
    const sessoes = new SessaoManager(), dados = new ConsultaAutenticacaoRepository(banco);
    let consulta: { iniciar: () => void; resposta: Promise<IdentidadeAutenticada | undefined> } | undefined;
    const dadosAutorizacao: ContratoDadosAutenticacao = {
      buscarPorEmail: email => dados.buscarPorEmail(email),
      buscarIdentidadePorId: id => {
        const suspensa = consulta; consulta = undefined;
        if (suspensa === undefined) return dados.buscarIdentidadePorId(id);
        suspensa.iniciar(); return suspensa.resposta;
      }
    };
    const autorizador = new Autorizador(sessoes, dadosAutorizacao);
    const credenciais = new AutenticacaoService({ dados, hash });
    const auth = new SessaoAutenticacaoService(credenciais, sessoes, autorizador);
    const usuarios = new UsuarioService(repository, hash, autorizador, sessoes);
    const admin = { webContentsId: 201 }, alvo = { webContentsId: 202 }, outra = { webContentsId: 203 };
    for (const c of [admin, alvo, outra]) sessoes.registrar(c);
    await auth.entrar({ email: 'admin@example.invalid', senha }, admin);
    const criar = async (email = 'antiga@example.invalid', senhaNova = senha) => repository.create({ nome: email, email, perfil: 'admin', ativo: 1, senha_hash: await hash.gerar(senhaNova) });
    const excluir = async (id: number) => usuarios.executar('usuarios:excluir', { id }, admin, () => {});
    const negar = async (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'NAO_AUTENTICADO');

    // Consulta antiga termina depois de excluir, recriar e autenticar novamente.
    for (const erroTardio of [false, true]) {
      const velha = await criar(); await auth.entrar({ email: velha.email, senha }, alvo);
      const identidadeVelha = await dados.buscarIdentidadePorId(velha.id);
      const suspensa = this.pausa<IdentidadeAutenticada | undefined>(); consulta = suspensa;
      const leitura = auth.obterSessao(alvo); await suspensa.iniciada;
      await excluir(velha.id); const nova = await criar('nova@example.invalid', 'Credencial nova');
      assert.equal(nova.id, velha.id);
      await auth.entrar({ email: nova.email, senha: 'Credencial nova' }, alvo);
      const substituta = sessoes.obter(alvo), versao = sessoes.versao(alvo);
      assert.ok(identidadeVelha !== undefined);
      sessoes.revogarIdentidade(identidadeVelha.identidadeConta);
      assert.strictEqual(sessoes.obter(alvo), substituta);
      if (erroTardio) suspensa.falhar(new Error('SQL_INTERNO'));
      else suspensa.concluir(identidadeVelha);
      if (erroTardio) await assert.rejects(leitura, (e: unknown) => e instanceof ErroAutenticacao && e.codigo === 'INTERNO');
      else await negar(leitura);
      assert.strictEqual(sessoes.obter(alvo), substituta); assert.strictEqual(sessoes.versao(alvo), versao);
      assert.equal((await auth.obterSessao(alvo)).nome, nova.nome);
      await excluir(nova.id);
    }
    console.log('OK: consulta e falha tardias não autorizam identidade antiga nem revogam sessão substituta.');

    // Hash de login já capturou o registro antigo antes da exclusão/recriação.
    const velha = await criar();
    const verificacao = this.pausa<void>();
    const verificadorLento = new AutenticacaoService({ dados, hash: {
      gerar: s => hash.gerar(s), necessitaAtualizacao: h => hash.necessitaAtualizacao(h),
      verificar: async (s,h) => { verificacao.iniciar(); await verificacao.resposta; return hash.verificar(s,h); }
    } });
    const loginLento = new SessaoAutenticacaoService(verificadorLento, sessoes, autorizador);
    const login = loginLento.entrar({ email: velha.email, senha }, alvo); await verificacao.iniciada;
    await excluir(velha.id); const nova = await criar('nova@example.invalid', 'Credencial nova');
    assert.equal(nova.id, velha.id); verificacao.concluir(); await negar(login);
    assert.equal(sessoes.obter(alvo), undefined);
    await auth.entrar({ email: nova.email, senha: 'Credencial nova' }, alvo);
    await excluir(nova.id);
    console.log('OK: login aguardando Argon2id rejeita conta recriada com o mesmo ID.');

    // Operação administrativa do ator excluído e redefinição cujo alvo foi substituído.
    for (const excluirAtor of [true, false]) {
      const velha = await criar(); await auth.entrar({ email: velha.email, senha }, alvo);
      const geracao = this.pausa<void>();
      const lento = new UsuarioService(repository, { gerar: async s => { geracao.iniciar(); await geracao.resposta; return hash.gerar(s); },
        verificar: (s,h) => hash.verificar(s,h), necessitaAtualizacao: h => hash.necessitaAtualizacao(h) }, autorizador, sessoes);
      const operacao = excluirAtor
        ? lento.executar('usuarios:criar', { nome: 'Proibida', email: 'proibida@example.invalid', senha, perfil: 'admin', ativo: 1 }, alvo, () => {})
        : lento.executar('usuarios:alterar-senha', { id: velha.id, senha: 'Redefinicao antiga' }, admin, () => {});
      await geracao.iniciada; await excluir(velha.id);
      const nova = await criar('nova@example.invalid', 'Credencial nova'); assert.equal(nova.id, velha.id);
      await auth.entrar({ email: nova.email, senha: 'Credencial nova' }, alvo);
      const substituta = sessoes.obter(alvo), versao = sessoes.versao(alvo), registro = repository.findById(nova.id);
      geracao.concluir();
      if (excluirAtor) await negar(operacao);
      else await assert.rejects(operacao, (e: unknown) => e instanceof ErroUsuario && e.codigo === 'CONFLITO');
      assert.deepEqual(repository.findById(nova.id), registro);
      assert.equal(await dados.buscarPorEmail('proibida@example.invalid'), undefined);
      assert.strictEqual(sessoes.obter(alvo), substituta); assert.strictEqual(sessoes.versao(alvo), versao);
      await excluir(nova.id);
    }
    console.log('OK: ator excluído não grava; redefinição antiga não altera conta substituta nem sua sessão.');

    // FK e COMMIT falham realmente no SQLite: nenhuma sessão pode ser revogada.
    const vinculada = await criar();
    banco.preparar<[number], never>(`INSERT INTO instrutores (usuario_id,nome,email,telefone,especialidade,ativo,criado_em,atualizado_em)
      VALUES (?,'Teste','teste@example.invalid','0','Teste',1,'UTC','UTC')`).run(vinculada.id);
    for (const c of [alvo, outra]) await auth.entrar({ email: vinculada.email, senha }, c);
    const referencias = [sessoes.obter(alvo), sessoes.obter(outra)], versoes = [sessoes.versao(alvo), sessoes.versao(outra)];
    await assert.rejects(excluir(vinculada.id));
    banco.preparar<[number], never>('DELETE FROM instrutores WHERE usuario_id=?').run(vinculada.id);
    banco.executarEstrutura(`CREATE TABLE falha_commit_identidade (usuario_id INTEGER REFERENCES usuarios(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER impedir_commit_identidade AFTER DELETE ON usuarios BEGIN INSERT INTO falha_commit_identidade VALUES (OLD.id); END;`);
    await assert.rejects(excluir(vinculada.id));
    banco.executarEstrutura('DROP TRIGGER impedir_commit_identidade; DROP TABLE falha_commit_identidade;');
    for (const [indice,c] of [alvo, outra].entries()) {
      assert.strictEqual(sessoes.obter(c), referencias[indice]); assert.strictEqual(sessoes.versao(c), versoes[indice]);
      assert.equal((await auth.obterSessao(c)).id, vinculada.id);
    }
    await excluir(vinculada.id);
    console.log('OK: falhas reais de FK e COMMIT preservam conta, identidade e duas sessões válidas.');

    // Outra conexão simula exclusão fora desta instância: o token persistente
    // protege mesmo sem receber o sinal local de revogação em memória.
    const externa = await criar(); await auth.entrar({ email: externa.email, senha }, alvo);
    const arquivo = banco.preparar<[], { file: string }>('PRAGMA database_list').get()?.file; assert.ok(arquivo);
    const segundaConexao = new Conexao(arquivo);
    try {
      const outroRepository = new UsuarioRepository(segundaConexao); assert.equal(outroRepository.delete(externa.id), true);
      const outraConta = outroRepository.create({ nome: 'Outra instância', email: 'externa@example.invalid', perfil: 'admin', ativo: 1, senha_hash: await hash.gerar('Outra senha') });
      assert.equal(outraConta.id, externa.id); await negar(auth.obterSessao(alvo));
      outroRepository.delete(outraConta.id);

      // Sem sinal local, a sessão em memória continua sendo a mesma: a guarda
      // persistente dentro da transação precisa impedir a escrita pendente.
      const ator = await criar(); await auth.entrar({ email: ator.email, senha }, alvo);
      const geracao = this.pausa<void>();
      const lento = new UsuarioService(repository, {
        gerar: async s => { geracao.iniciar(); await geracao.resposta; return hash.gerar(s); },
        verificar: (s,h) => hash.verificar(s,h), necessitaAtualizacao: h => hash.necessitaAtualizacao(h)
      }, autorizador, sessoes);
      const operacao = lento.executar('usuarios:criar', {
        nome: 'Proibida externa', email: 'proibida-externa@example.invalid', senha, perfil: 'admin', ativo: 1
      }, alvo, () => {});
      await geracao.iniciada;
      const sessaoAntiga = sessoes.obter(alvo);
      assert.equal(outroRepository.delete(ator.id), true);
      const substituto = outroRepository.create({ nome: 'Substituto externo', email: 'substituto@example.invalid',
        perfil: 'admin', ativo: 1, senha_hash: await hash.gerar('Outra senha') });
      assert.equal(substituto.id, ator.id);
      assert.strictEqual(sessoes.obter(alvo), sessaoAntiga);
      geracao.concluir();
      await assert.rejects(operacao, (e: unknown) => e instanceof ErroUsuario && e.codigo === 'SEM_PERMISSAO');
      assert.equal(await dados.buscarPorEmail('proibida-externa@example.invalid'), undefined);
      outroRepository.delete(substituto.id);
    } finally { segundaConexao.fechar(); }
    console.log('OK: identidade persistente rejeita reutilização de ID e escrita administrativa pendente após substituição por outra conexão.');
  }
}
