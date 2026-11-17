import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { Composicao } from '../src/main/Composicao';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { AutenticacaoHandler } from '../src/main/ipc/AutenticacaoHandler';
import { InicializacaoHandler } from '../src/main/ipc/InicializacaoHandler';
import { ProvisionamentoService } from '../src/services/ProvisionamentoService';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';
import type { ContratoDadosAutenticacao, IdentidadeAutenticada } from '../src/main/seguranca/ContratosAutenticacao';

class VerificarAutenticacaoIpc {
  private readonly janelas: BrowserWindow[] = [];
  private proximaConsulta: { resposta: Promise<IdentidadeAutenticada | undefined>; iniciou: () => void } | undefined;

  public async executar(): Promise<void> {
    const limite = setTimeout(() => app.exit(1), 60000);
    let handler: AutenticacaoHandler | undefined;
    let inicializacao: InicializacaoHandler | undefined;
    let conexao: Conexao | undefined;
    const composicao = new Composicao();
    try {
      await app.whenReady();
      conexao = new Conexao(':memory:');
      new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const hash = new HashSenhaArgon2();
      const senha = 'Sintética IPC 🔒';
      const digest = await hash.gerar(senha);
      conexao.preparar<[string], never>(`INSERT INTO usuarios
        (nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em)
        VALUES ('Sintético', 'ipc@example.invalid', ?, 'admin', 1, '2026-11-14', '2026-11-14')`).run(digest);
      conexao.preparar<[string], never>(`INSERT INTO usuarios
        (nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em)
        VALUES ('Segunda pessoa', 'segunda@example.invalid', ?, 'recepcao', 1, '2026-11-14', '2026-11-14')`).run(digest);
      const dados = new ConsultaAutenticacaoRepository(conexao);
      // Só a autorização pode ser retardada; a verificação de credenciais usa SQLite real.
      const dadosAutorizacao: ContratoDadosAutenticacao = {
        buscarPorEmail: (email) => dados.buscarPorEmail(email),
        buscarIdentidadePorId: (id) => {
          const suspensa = this.proximaConsulta;
          this.proximaConsulta = undefined;
          if (suspensa === undefined) return dados.buscarIdentidadePorId(id);
          suspensa.iniciou();
          return suspensa.resposta;
        }
      };
      const sessoes = new SessaoManager();
      const verificador = new AutenticacaoService({ dados, hash });
      let aguardar: Promise<void> | undefined;
      const servico = new SessaoAutenticacaoService({ verificarCredenciais: async (entrada, contexto) => {
        await aguardar;
        return verificador.verificarCredenciais(entrada, contexto);
      } }, sessoes, new Autorizador(sessoes, dadosAutorizacao));
      handler = new AutenticacaoHandler(servico, sessoes);
      inicializacao = new InicializacaoHandler(new ProvisionamentoService(new UsuarioRepository(conexao), hash), handler, sessoes);
      const seguro = handler;
      const janela = await this.abrir(seguro);
      const outra = await this.abrir();
      const evento = { sender: janela.webContents, senderFrame: janela.webContents.mainFrame };
      const entrada = { email: 'ipc@example.invalid', senha };
      const entrar = `window.academia.autenticacao.entrar(${JSON.stringify(entrada)})`;
      this.falha(await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');
      this.falha(await outra.webContents.executeJavaScript(entrar), 'SEM_PERMISSAO');
      this.falha(await seguro.atender('auth:entrar', { ...evento, senderFrame: outra.webContents.mainFrame }, [entrada]), 'SEM_PERMISSAO');
      this.falha(await seguro.atender('auth:sessao', { ...evento, senderFrame: null }, []), 'SEM_PERMISSAO');
      this.falha(await seguro.atender('auth:entrar', evento, [{ ...entrada, usuarioId: 999, perfil: 'admin' }]), 'VALIDACAO');
      this.falha(await seguro.atender('auth:entrar', evento, [entrada, { webContentsId: outra.webContents.id }]), 'VALIDACAO');
      this.falha(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar({email:'ipc@example.invalid',senha:'errada'})`), 'NAO_AUTENTICADO');
      const esperado = { sucesso: true, dados: { usuario: { id: 1, nome: 'Sintético', perfil: 'admin' } } };
      assert.deepEqual(await janela.webContents.executeJavaScript(entrar), esperado);
      assert.deepEqual(await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), esperado);
      this.falha(await seguro.atender('auth:sessao', evento, [{ usuarioId: 1 }]), 'VALIDACAO');
      const ponte = await janela.webContents.executeJavaScript(`({chaves:Object.keys(window.academia), metodos:Object.keys(window.academia.autenticacao), require:typeof window.require, process:typeof window.process})`);
      assert.deepEqual(ponte, { chaves: ['autenticacao', 'usuarios', 'inicializacao', 'alunos'], metodos: ['entrar', 'sessao', 'sair'], require: 'undefined', process: 'undefined' });
      conexao.preparar<[], never>("UPDATE usuarios SET perfil = 'instrutor' WHERE id = 1").run();
      const atualizado = await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()');
      assert.deepEqual(atualizado, { sucesso: true, dados: { usuario: { id: 1, nome: 'Sintético', perfil: 'instrutor' } } });
      assert.deepEqual(await janela.webContents.executeJavaScript('window.academia.autenticacao.sair()'), { sucesso: true, dados: { encerrada: true } });
      this.falha(await janela.webContents.executeJavaScript('window.academia.autenticacao.sair()'), 'NAO_AUTENTICADO');
      this.falha(await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');

      // Pausa controlada no Main torna determinísticas as corridas, sem temporizadores.
      let liberar: (() => void) | undefined;
      aguardar = new Promise<void>((resolve) => { liberar = resolve; });
      const pendente = seguro.atender('auth:entrar', evento, [entrada]);
      this.falha(await seguro.atender('auth:entrar', evento, [entrada]), 'SEM_PERMISSAO');
      this.falha(await seguro.atender('auth:sair', evento, []), 'NAO_AUTENTICADO');
      liberar?.();
      this.falha(await pendente, 'NAO_AUTENTICADO');
      aguardar = undefined;
      await janela.webContents.executeJavaScript(entrar);
      await janela.webContents.executeJavaScript(`document.body.appendChild(document.createElement('iframe'))`);
      const filho = janela.webContents.mainFrame.frames[0];
      assert.ok(filho !== undefined);
      this.falha(await seguro.atender('auth:sessao', { ...evento, senderFrame: filho }, []), 'SEM_PERMISSAO');
      janela.webContents.reload();
      await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', resolve));
      this.falha(await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');
      const novoEvento = { sender: janela.webContents, senderFrame: janela.webContents.mainFrame };
      aguardar = new Promise<void>((resolve) => { liberar = resolve; });
      const destruido = seguro.atender('auth:entrar', novoEvento, [entrada]);
      const id = janela.webContents.id;
      janela.destroy();
      liberar?.();
      this.falha(await destruido, 'NAO_AUTENTICADO');
      assert.equal(sessoes.obter({ webContentsId: id }), undefined);
      this.falha(await seguro.atender('auth:sessao', novoEvento, []), 'SEM_PERMISSAO');
      aguardar = undefined;
      await this.verificarCorrecoes(seguro, sessoes, entrada, { email: 'segunda@example.invalid', senha });
      const ativa = await this.abrir(seguro);
      assert.equal((await ativa.webContents.executeJavaScript(entrar) as Resultado<unknown>).sucesso, true);
      const idAtiva = ativa.webContents.id;
      assert.equal(sessoes.obter({ webContentsId: idAtiva })?.usuarioId, 1);
      ativa.destroy();
      assert.equal(sessoes.obter({ webContentsId: idAtiva }), undefined);
      const final = await this.abrir(seguro);
      assert.equal((await final.webContents.executeJavaScript(entrar) as Resultado<unknown>).sucesso, true);
      conexao.fechar();
      conexao = undefined;
      this.falha(await final.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'INTERNO');
      assert.equal(sessoes.obter({ webContentsId: final.webContents.id }), undefined);
      seguro.encerrar();
      inicializacao.encerrar(); inicializacao = undefined;
      handler = undefined;
      // Exercita também a montagem efetiva usada pela aplicação.
      composicao.iniciar(':memory:');
      const montada = await new JanelaPrincipal().abrir(false, (j, url) => composicao.vincularJanela(j, url));
      this.janelas.push(montada);
      this.falha(await montada.webContents.executeJavaScript(entrar), 'NAO_AUTENTICADO');
      composicao.encerrar();
      console.log('OK: IPC/preload reais, Argon2id/SQLite em memória, login válido/inválido, sessão/logout, remetente/frame, falsificação, concorrência, reload, destruição, falha de banco, DTOs e composição.');
      clearTimeout(limite);
      for (const j of this.janelas) if (!j.isDestroyed()) j.destroy();
      app.exit(0);
    } catch (erro: unknown) {
      clearTimeout(limite);
      handler?.encerrar();
      inicializacao?.encerrar();
      composicao.encerrar();
      conexao?.fechar();
      for (const j of this.janelas) if (!j.isDestroyed()) j.destroy();
      console.error(erro instanceof Error ? erro.message : 'Falha no teste sintético IPC.');
      app.exit(1);
    }
  }

  private async abrir(handler?: AutenticacaoHandler): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false, (j, url) => handler?.vincular(j, url));
    this.janelas.push(janela);
    return janela;
  }

  private suspenderConsulta(): {
    iniciada: Promise<void>;
    concluir: (identidade: IdentidadeAutenticada | undefined) => void;
    falhar: (erro: Error) => void;
  } {
    assert.equal(this.proximaConsulta, undefined);
    let iniciou!: () => void;
    let concluir!: (identidade: IdentidadeAutenticada | undefined) => void;
    let falhar!: (erro: Error) => void;
    const iniciada = new Promise<void>((resolve) => { iniciou = resolve; });
    const resposta = new Promise<IdentidadeAutenticada | undefined>((resolve, reject) => { concluir = resolve; falhar = reject; });
    this.proximaConsulta = { resposta, iniciou };
    return { iniciada, concluir, falhar };
  }

  private async recarregar(janela: BrowserWindow): Promise<void> {
    const terminou = new Promise<void>((resolve) => janela.webContents.once('did-finish-load', resolve));
    janela.webContents.reload();
    await terminou;
  }

  private async verificarCorrecoes(handler: AutenticacaoHandler, sessoes: SessaoManager,
    primeira: { email: string; senha: string }, segunda: { email: string; senha: string }): Promise<void> {
    const a = await this.abrir(handler);
    const b = await this.abrir(handler);
    const contextoA = { webContentsId: a.webContents.id };
    const contextoB = { webContentsId: b.webContents.id };
    const loginA = `window.academia.autenticacao.entrar(${JSON.stringify(primeira)})`;
    const loginB = `window.academia.autenticacao.entrar(${JSON.stringify(segunda)})`;
    const usuarioA = { id: 1, nome: 'Sintético', perfil: 'instrutor' };
    const usuarioB = { id: 2, nome: 'Segunda pessoa', perfil: 'recepcao' };
    const sessaoA = { sucesso: true, dados: { usuario: usuarioA } };
    const sessaoB = { sucesso: true, dados: { usuario: usuarioB } };
    assert.deepEqual(await a.webContents.executeJavaScript(loginA), sessaoA);
    assert.deepEqual(await b.webContents.executeJavaScript(loginB), sessaoB);
    const internaB = sessoes.obter(contextoB);
    const versaoB = sessoes.versao(contextoB);
    this.falha(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao({usuarioId:2,perfil:"admin"})'), 'VALIDACAO');
    assert.deepEqual(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), sessaoA);
    assert.deepEqual(await a.webContents.executeJavaScript('window.academia.autenticacao.sair()'), { sucesso: true, dados: { encerrada: true } });
    this.falha(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');
    assert.strictEqual(sessoes.obter(contextoB), internaB);
    assert.strictEqual(sessoes.versao(contextoB), versaoB);
    assert.deepEqual(await b.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), sessaoB);
    console.log('OK: duas janelas autorizadas, usuários diferentes, falsificação rejeitada e logout isolado.');

    // Respostas de logout antigo, tanto sucesso de leitura quanto falha operacional.
    for (const falhaTardia of [false, true]) {
      assert.deepEqual(await a.webContents.executeJavaScript(loginA), sessaoA);
      const identidadeAntiga = sessoes.obter(contextoA)?.identidadeConta;
      assert.ok(identidadeAntiga !== undefined);
      const consulta = this.suspenderConsulta();
      const eventoAntigo = { sender: a.webContents, senderFrame: a.webContents.mainFrame };
      const logoutAntigo = handler.atender('auth:sair', eventoAntigo, []);
      await consulta.iniciada;
      await this.recarregar(a);
      assert.deepEqual(await a.webContents.executeJavaScript(loginB), sessaoB);
      const nova = sessoes.obter(contextoA);
      const versaoNova = sessoes.versao(contextoA);
      if (falhaTardia) consulta.falhar(new Error('SEGREDO_INTERNO senha_hash SQL'));
      else consulta.concluir({ ...usuarioA, perfil: 'instrutor', ativo: true, identidadeConta: identidadeAntiga, versaoCredencial: 1 });
      this.falha(await logoutAntigo, falhaTardia ? 'INTERNO' : 'NAO_AUTENTICADO');
      assert.strictEqual(sessoes.obter(contextoA), nova, 'Logout antigo modificou a sessão posterior.');
      assert.strictEqual(sessoes.versao(contextoA), versaoNova);
      assert.deepEqual(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), sessaoB);
      assert.strictEqual(sessoes.obter(contextoB), internaB);
    }
    console.log('OK: logout de documento anterior, consulta retardada e sessão nova preservada, inclusive após falha tardia.');

    // Falha da consulta antiga no mesmo documento, após substituir o usuário da sessão.
    assert.deepEqual(await a.webContents.executeJavaScript(loginA), sessaoA);
    const leitura = this.suspenderConsulta();
    const consultaAntiga = handler.atender('auth:sessao', { sender: a.webContents, senderFrame: a.webContents.mainFrame }, []);
    await leitura.iniciada;
    assert.deepEqual(await a.webContents.executeJavaScript(loginB), sessaoB);
    const substituta = sessoes.obter(contextoA);
    const versaoSubstituta = sessoes.versao(contextoA);
    leitura.falhar(new Error('SEGREDO_INTERNO consulta antiga'));
    this.falha(await consultaAntiga, 'INTERNO');
    assert.strictEqual(sessoes.obter(contextoA), substituta, 'Falha antiga revogou a sessão substituta.');
    assert.strictEqual(sessoes.versao(contextoA), versaoSubstituta);
    assert.deepEqual(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), sessaoB);

    const falhaLogout = this.suspenderConsulta();
    const logout = a.webContents.executeJavaScript('window.academia.autenticacao.sair()');
    await falhaLogout.iniciada;
    falhaLogout.falhar(new Error('SEGREDO_INTERNO senha_hash SELECT'));
    this.falha(await logout, 'INTERNO');
    assert.equal(sessoes.obter(contextoA), undefined);
    assert.strictEqual(sessoes.obter(contextoB), internaB);
    this.falha(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');
    console.log('OK: revogação restrita à sessão consultada; erro INTERNO preservado no logout e sem dados sensíveis.');

    // Evento nativo de perda do renderer, sem simular o listener por emit().
    b.destroy();
    assert.equal(sessoes.obter(contextoB), undefined);
    assert.throws(() => sessoes.versao(contextoB));
    assert.deepEqual(await a.webContents.executeJavaScript(loginA), sessaoA);
    const antesCrash = sessoes.versao(contextoA);
    const perdeu = new Promise<void>((resolve) => a.webContents.once('render-process-gone', () => resolve()));
    a.webContents.forcefullyCrashRenderer();
    await perdeu;
    assert.equal(sessoes.obter(contextoA), undefined);
    assert.notStrictEqual(sessoes.versao(contextoA), antesCrash);
    await this.recarregar(a);
    this.falha(await a.webContents.executeJavaScript('window.academia.autenticacao.sessao()'), 'NAO_AUTENTICADO');
    assert.deepEqual(await a.webContents.executeJavaScript(loginB), sessaoB);
    assert.deepEqual(await a.webContents.executeJavaScript('window.academia.autenticacao.sair()'), { sucesso: true, dados: { encerrada: true } });
    a.destroy();
    assert.equal(sessoes.obter(contextoA), undefined);
    assert.throws(() => sessoes.versao(contextoA));
    console.log('OK: render-process-gone nativo, invalidação, recuperação dos três canais e remoção do contexto destruído.');
  }

  private falha(resultado: Resultado<unknown>, codigo: string): void {
    assert.equal(resultado.sucesso, false);
    if (resultado.sucesso) throw new Error('Esperava falha.');
    assert.equal(resultado.erro.codigo, codigo);
    assert.deepEqual(Object.keys(resultado).sort(), ['erro', 'sucesso']);
    assert.deepEqual(Object.keys(resultado.erro).sort(), ['codigo', 'mensagem']);
    assert.doesNotMatch(JSON.stringify(resultado), /senha|senhaHash|senha_hash|stack|cause|SELECT|INSERT|Sintética IPC/);
  }
}

void new VerificarAutenticacaoIpc().executar();
