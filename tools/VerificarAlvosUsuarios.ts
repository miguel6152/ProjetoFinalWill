import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
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
import type { CanalUsuario } from '../src/services/UsuarioService';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { AutenticacaoHandler } from '../src/main/ipc/AutenticacaoHandler';
import { UsuarioHandler } from '../src/main/ipc/UsuarioHandler';
import { InicializacaoHandler } from '../src/main/ipc/InicializacaoHandler';
import { ProvisionamentoService } from '../src/services/ProvisionamentoService';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import type { Resultado, Perfil } from '../src/shared/ipc/ContratoIpc';

/** Corrida na primeira suspensão: autorização, hash e SQLite são os de produção.
 * A segunda conexão substitui o alvo sincronamente depois de iniciar o handler,
 * antes de devolver o controle às microtasks. Não há sleep, timer ou adaptador lento.
 */
export class VerificarAlvosUsuarios {
  private readonly canais = ['usuarios:atualizar', 'usuarios:alterar-senha', 'usuarios:excluir'] as const;
  private readonly redefinida = 'Redefinicao destinada ao alvo original';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-alvos-'));
    const banco = new Conexao(path.join(pasta, 'teste.sqlite3'));
    const externa = new Conexao(path.join(pasta, 'teste.sqlite3'));
    let authHandler: AutenticacaoHandler | undefined;
    let handler: UsuarioHandler | undefined;
    let inicializacao: InicializacaoHandler | undefined;
    let janela: BrowserWindow | undefined;
    try {
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const repository = new UsuarioRepository(banco), outro = new UsuarioRepository(externa);
      const hash = new HashSenhaArgon2(), senha = 'Credencial original sintetica 5.3';
      const digest = await hash.gerar(senha), novoDigest = await hash.gerar('Credencial exclusiva da substituta');
      const criar = (perfil: Perfil = 'recepcao', substituta: boolean = false) => outro.create({
        nome: substituta ? 'Substituta' : 'Alvo original',
        email: substituta ? 'substituta@example.invalid' : 'alvo@example.invalid',
        perfil, ativo: 1, senha_hash: substituta ? novoDigest : digest
      });
      repository.create({ nome: 'Admin', email: 'admin@example.invalid', perfil: 'admin', ativo: 1, senha_hash: digest });
      const sessoes = new SessaoManager(), dados = new ConsultaAutenticacaoRepository(banco);
      const autorizador = new Autorizador(sessoes, dados);
      const auth = new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash }), sessoes, autorizador);
      authHandler = new AutenticacaoHandler(auth, sessoes);
      inicializacao = new InicializacaoHandler(new ProvisionamentoService(repository, hash), authHandler, sessoes);
      janela = await new JanelaPrincipal().abrir(false, (j, url) => authHandler?.vincular(j, url));
      const contexto = { webContentsId: janela.webContents.id };
      await auth.entrar({ email: 'admin@example.invalid', senha }, contexto);
      handler = new UsuarioHandler(new UsuarioService(repository, hash, autorizador, sessoes), authHandler);
      const evento = { sender: janela.webContents, senderFrame: janela.webContents.mainFrame };
      // Contextos independentes preparados pelo Main com a identidade real do banco.
      // Login completo e credenciais da substituta são cobertos por VerificarIdentidades.
      const nova1 = { webContentsId: 900001 }, nova2 = { webContentsId: 900002 };
      for (const c of [nova1, nova2]) sessoes.registrar(c);
      const registro = (id: number): unknown => banco.preparar<[number], unknown>('SELECT * FROM usuarios WHERE id = ?').get(id);

      for (const canal of this.canais) {
        // Primeiro caso deve falhar no código 5.2: vínculo ainda era capturado
        // somente depois do await da autorização do administrador.
        for (const perfil of ['recepcao', 'admin'] as const) {
          const original = criar(perfil), identidadeOriginal = repository.identidadeConta(original.id);
          const pendente = handler.atender(canal, evento, [this.entrada(canal, original.id)]);
          assert.equal(outro.delete(original.id), true);
          const substituta = criar(perfil === 'admin' ? 'recepcao' : 'admin', true);
          assert.equal(substituta.id, original.id, 'A regressão exige reutilização real de ID.');
          const identidadeNova = repository.identidadeConta(substituta.id);
          assert.ok(identidadeNova !== undefined); assert.notEqual(identidadeNova, identidadeOriginal);
          for (const c of [nova1, nova2]) sessoes.estabelecer(c, substituta.id, identidadeNova, repository.versaoCredencial(substituta.id)!);
          const referencias = [sessoes.obter(nova1), sessoes.obter(nova2)];
          const versoes = [sessoes.versao(nova1), sessoes.versao(nova2)];
          const antes = registro(substituta.id);
          this.falha(await pendente, 'CONFLITO', canal);
          assert.deepEqual(registro(substituta.id), antes, `${canal} modificou a conta substituta.`);
          for (const [indice, c] of [nova1, nova2].entries()) {
            assert.strictEqual(sessoes.obter(c), referencias[indice]);
            assert.strictEqual(sessoes.versao(c), versoes[indice]);
            assert.equal((await auth.obterSessao(c)).nome, substituta.nome);
          }
          outro.delete(substituta.id);
        }

        // Remoção durante a autorização sem substituição.
        const removido = criar();
        const removendo = handler.atender(canal, evento, [this.entrada(canal, removido.id)]);
        outro.delete(removido.id);
        this.falha(await removendo, 'NAO_ENCONTRADO', canal);
        assert.equal(registro(removido.id), undefined);

        // Alvo já ausente na entrada não pode se vincular a uma conta que
        // aparecer depois da primeira suspensão, nem mesmo com o mesmo ID.
        const ausente = criar(); outro.delete(ausente.id);
        this.falha(await handler.atender(canal, evento, [this.entrada(canal, ausente.id)]), 'NAO_ENCONTRADO', canal);
        const ausentePendente = handler.atender(canal, evento, [this.entrada(canal, ausente.id)]);
        const posterior = criar('admin', true); assert.equal(posterior.id, ausente.id);
        const antesPosterior = registro(posterior.id);
        this.falha(await ausentePendente, 'NAO_ENCONTRADO', canal);
        assert.deepEqual(registro(posterior.id), antesPosterior);
        outro.delete(posterior.id);

        // Caso normal com alvo inalterado, mantendo o contrato do canal.
        const normal = criar(), identidadeNormal = repository.identidadeConta(normal.id);
        const resultado: Resultado<unknown> = await handler.atender(canal, evento, [this.entrada(canal, normal.id)]);
        assert.equal(resultado.sucesso, true, `${canal} negou operação normal.`);
        if (canal === 'usuarios:excluir') assert.equal(registro(normal.id), undefined);
        else {
          assert.equal(repository.identidadeConta(normal.id), identidadeNormal);
          if (canal === 'usuarios:atualizar') assert.equal(repository.obterPublico(normal.id)?.nome, 'Alteracao original');
          else {
            const atualizado = repository.findById(normal.id); assert.ok(atualizado);
            assert.equal(await hash.verificar(this.redefinida, atualizado.senha_hash), true);
            assert.equal(await hash.verificar(senha, atualizado.senha_hash), false);
          }
          outro.delete(normal.id);
        }

        // Falha real no COMMIT externo, depois da tentativa de mutação.
        const falhando = criar(), identidadeFalha = repository.identidadeConta(falhando.id);
        assert.ok(identidadeFalha !== undefined);
        for (const c of [nova1, nova2]) sessoes.estabelecer(c, falhando.id, identidadeFalha, repository.versaoCredencial(falhando.id)!);
        const referencias = [sessoes.obter(nova1), sessoes.obter(nova2)];
        const versoes = [sessoes.versao(nova1), sessoes.versao(nova2)], antesFalha = registro(falhando.id);
        banco.executarEstrutura(`
          CREATE TABLE falha_alvo (usuario_id INTEGER REFERENCES usuarios(id) DEFERRABLE INITIALLY DEFERRED);
          CREATE TRIGGER falha_alvo_update AFTER UPDATE ON usuarios BEGIN INSERT INTO falha_alvo VALUES (-1); END;
          CREATE TRIGGER falha_alvo_delete AFTER DELETE ON usuarios BEGIN INSERT INTO falha_alvo VALUES (-1); END;
        `);
        try {
          this.falha(await handler.atender(canal, evento, [this.entrada(canal, falhando.id)]), 'INTERNO', canal);
          assert.deepEqual(registro(falhando.id), antesFalha);
          for (const [indice, c] of [nova1, nova2].entries()) {
            assert.strictEqual(sessoes.obter(c), referencias[indice]);
            assert.strictEqual(sessoes.versao(c), versoes[indice]);
          }
        } finally {
          banco.executarEstrutura('DROP TRIGGER falha_alvo_update; DROP TRIGGER falha_alvo_delete; DROP TABLE falha_alvo;');
        }
        outro.delete(falhando.id);
        console.log(`OK 5.3 ${canal}: substituição em dois sentidos de perfil, duas sessões novas intactas, ausência antes/durante, operação normal e rollback de COMMIT.`);
      }
      for (const alteracoes of [{ ativo: 0 }, { perfil: 'recepcao' }]) {
        this.falha(await handler.atender('usuarios:atualizar', evento, [{ id: 1, alteracoes }]), 'CONFLITO', 'último admin');
      }
      this.falha(await handler.atender('usuarios:excluir', evento, [{ id: 1 }]), 'CONFLITO', 'autoexclusão');
      assert.equal(repository.contarAdministradores(), 1);
      assert.equal((await auth.obterSessao(contexto)).perfil, 'admin');
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(banco.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      console.log('OK 5.3: último administrador, autoexclusão e integridade preservados; autorização sem instrumentação.');
    } finally {
      inicializacao?.encerrar(); handler?.encerrar(); authHandler?.encerrar();
      if (janela !== undefined && !janela.isDestroyed()) janela.destroy();
      externa.fechar(); banco.fechar();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) {
        assert.ok(['teste.sqlite3', 'teste.sqlite3-journal', 'teste.sqlite3-wal', 'teste.sqlite3-shm'].includes(nome));
        unlinkSync(path.join(pasta, nome));
      }
      rmdirSync(pasta);
    }
  }

  private entrada(canal: CanalUsuario, id: number): unknown {
    return canal === 'usuarios:atualizar' ? { id, alteracoes: { nome: 'Alteracao original' } }
      : canal === 'usuarios:alterar-senha' ? { id, senha: this.redefinida } : { id };
  }

  private falha(resultado: Resultado<unknown>, codigo: string, cenario: string): void {
    assert.equal(resultado.sucesso, false, `${cenario}: operação antiga atingiu alvo substituto ou ausente.`);
    if (resultado.sucesso) throw new Error('Falha esperada.');
    assert.equal(resultado.erro.codigo, codigo, cenario);
    assert.deepEqual(Object.keys(resultado.erro).sort(), ['codigo', 'mensagem']);
    assert.doesNotMatch(JSON.stringify(resultado), /senha_hash|identidadeConta|identidade_conta|SELECT|stack|cause/);
  }
}
