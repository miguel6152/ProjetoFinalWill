import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { ProvisionamentoService } from '../src/services/ProvisionamentoService';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { AutenticacaoHandler } from '../src/main/ipc/AutenticacaoHandler';
import { InicializacaoHandler } from '../src/main/ipc/InicializacaoHandler';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { ErroUsuario } from '../src/services/ErroUsuario';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarProvisionamento {
  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-provisionamento-'));
    const arquivo = path.join(pasta, 'teste.sqlite3');
    const banco = new Conexao(arquivo), outra = new Conexao(arquivo);
    let authHandler: AutenticacaoHandler | undefined, handler: InicializacaoHandler | undefined;
    const janelas: BrowserWindow[] = [];
    const limite = setTimeout(() => app.exit(1), 30000);
    let resultado = 0;
    try {
      await app.whenReady();
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const repository = new UsuarioRepository(banco), hash = new HashSenhaArgon2();
      const entrada = { nome: ' Admin local ', email: ' ADMIN@EXAMPLE.INVALID ', senha: 'Credencial sintetica de provisionamento' };
      const dados = new ConsultaAutenticacaoRepository(banco), sessoes = new SessaoManager();
      const auth = new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash }), sessoes, new Autorizador(sessoes, dados));
      authHandler = new AutenticacaoHandler(auth, sessoes);
      const servico = new ProvisionamentoService(repository, hash);
      handler = new InicializacaoHandler(servico, authHandler, sessoes);
      const janela = await new JanelaPrincipal().abrir(false, (j, url) => authHandler?.vincular(j, url)); janelas.push(janela);
      const evento = { sender: janela.webContents, senderFrame: janela.webContents.mainFrame };
      assert.deepEqual(await handler.atender('inicializacao:estado', evento, []), { sucesso: true, dados: { necessario: true } });
      for (const invalida of [null, {}, { ...entrada, perfil: 'admin' }, { ...entrada, ativo: 1 }, { ...entrada, email: 'x' }, { ...entrada, senha: undefined }, { ...entrada, senha: 'curta' }]) {
        const r: Resultado<unknown> = await handler.atender('inicializacao:criar-admin', evento, [invalida]);
        assert.equal(r.sucesso, false); if (!r.sucesso) assert.equal(r.erro.codigo, 'VALIDACAO');
      }
      const negada = await new JanelaPrincipal().abrir(false); janelas.push(negada);
      assert.equal((await handler.atender('inicializacao:criar-admin',
        { sender: negada.webContents, senderFrame: negada.webContents.mainFrame }, [entrada])).sucesso, false);
      assert.equal(repository.totalUsuarios(), 0);

      // Falha SQLite real: não fica um usuário parcialmente criado ou sinal de inicialização concluída.
      banco.executarEstrutura("CREATE TRIGGER falhar_primeiro_admin AFTER INSERT ON usuarios BEGIN SELECT RAISE(ABORT,'falha sintetica'); END;");
      const falha = await handler.atender('inicializacao:criar-admin', evento, [entrada]);
      assert.equal(falha.sucesso, false); if (!falha.sucesso) assert.equal(falha.erro.codigo, 'INTERNO');
      assert.deepEqual(servico.estado(), { necessario: true });
      banco.executarEstrutura('DROP TRIGGER falhar_primeiro_admin');
      console.log('OK inicialização: origem, entradas estritas e rollback real, sem senha padrão.');

      // Duas conexões e hashes reais concorrentes: apenas um provisionamento ganha o IMMEDIATE.
      const concorrente = new ProvisionamentoService(new UsuarioRepository(outra), hash);
      const concorrentes = await Promise.allSettled([
        servico.criarAdministrador(entrada, () => {}, { webContentsId: 1 }),
        concorrente.criarAdministrador({ ...entrada, email: 'outro@example.invalid' }, () => {}, { webContentsId: 2 })
      ]);
      assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
      const rejeitada = concorrentes.find(r => r.status === 'rejected');
      assert.ok(rejeitada?.status === 'rejected');
      assert.ok(rejeitada.reason instanceof ErroUsuario && rejeitada.reason.codigo === 'CONFLITO');
      assert.equal(repository.totalUsuarios(), 1);
      const registro = repository.findById(1); assert.ok(registro);
      assert.equal(registro.nome, 'Admin local'); assert.equal(registro.perfil, 'admin'); assert.equal(registro.ativo, 1);
      assert.equal(await hash.verificar(entrada.senha, registro.senha_hash), true);
      assert.deepEqual(await handler.atender('inicializacao:estado', evento, []), { sucesso: true, dados: { necessario: false } });
      const fechada = await handler.atender('inicializacao:criar-admin', evento, [entrada]);
      assert.equal(fechada.sucesso, false); if (!fechada.sucesso) assert.equal(fechada.erro.codigo, 'CONFLITO');
      banco.preparar<[], never>('UPDATE usuarios SET ativo=0 WHERE id=1').run();
      assert.deepEqual(servico.estado(), { necessario: false }, 'Não reabrir provisionamento por ausência de admin ativo.');
      banco.preparar<[], never>('UPDATE usuarios SET ativo=1 WHERE id=1').run();
      await auth.entrar({ email: registro.email, senha: entrada.senha }, { webContentsId: janela.webContents.id });
      assert.equal((await auth.obterSessao({ webContentsId: janela.webContents.id })).perfil, 'admin');
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      console.log('OK inicialização: uma criação entre duas conexões, hash real, estado persistido e login administrativo válido.');

      // Guarda de documento/geração após hash, ainda em banco vazio independente.
      const vazio = new Conexao(path.join(pasta, 'cancelamento.sqlite3'));
      try {
        new Migrador(vazio, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
        let liberar!: () => void, sinal!: () => void;
        const pausa = new Promise<void>(r => { liberar = r; }), inicio = new Promise<void>(r => { sinal = r; });
        const lenta = new ProvisionamentoService(new UsuarioRepository(vazio), {
          gerar: async s => { sinal(); await pausa; return hash.gerar(s); },
          verificar: (s, h) => hash.verificar(s, h), necessitaAtualizacao: h => hash.necessitaAtualizacao(h)
        });
        const contexto = { webContentsId: janela.webContents.id }, versao = sessoes.versao(contexto);
        const pendente = lenta.criarAdministrador(entrada, () => sessoes.conferir(contexto, versao), contexto);
        await inicio; sessoes.encerrar(contexto); liberar();
        await assert.rejects(pendente);
        assert.equal(new UsuarioRepository(vazio).totalUsuarios(), 0);
      } finally { vazio.fechar(); }
      console.log('OK inicialização: geração revogada durante hash impede criação pendente.');
    } catch (erro: unknown) {
      console.error(erro instanceof Error ? erro.message : 'Falha de provisionamento.'); resultado = 1;
    } finally {
      clearTimeout(limite); handler?.encerrar(); authHandler?.encerrar();
      for (const janela of janelas) if (!janela.isDestroyed()) janela.destroy();
      outra.fechar(); banco.fechar();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) {
        assert.match(nome, /^(teste|cancelamento)\.sqlite3(?:-journal|-wal|-shm)?$/);
        unlinkSync(path.join(pasta, nome));
      }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }
}
void new VerificarProvisionamento().executar().catch(() => app.exit(1));
