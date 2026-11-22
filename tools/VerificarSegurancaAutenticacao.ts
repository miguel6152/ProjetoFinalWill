import { Migracao005Entregas } from '../src/database/migrations/Migracao005Entregas';
import { Migracao004AvisosInternos } from '../src/database/migrations/Migracao004AvisosInternos';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { Composicao } from '../src/main/Composicao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { AutenticacaoHandler } from '../src/main/ipc/AutenticacaoHandler';
import { InicializacaoHandler } from '../src/main/ipc/InicializacaoHandler';
import { ProvisionamentoService } from '../src/services/ProvisionamentoService';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import type { CodigoErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import type { ContratoDadosAutenticacao, ContratoHashSenha } from '../src/main/seguranca/ContratosAutenticacao';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';
import type { SaidaAutenticacao, UsuarioSessao } from '../src/shared/tipos/Autenticacao';

/** Somente dados sintéticos; falhas injetadas exercitam o caminho público do IPC. */
class VerificarSegurancaAutenticacao {
  private readonly senha = 'Credencial sintética da 4.4 🔒';
  private readonly entrada = { email: 'primeira@example.invalid', senha: this.senha };
  private readonly primeira: UsuarioSessao = { id: 1, nome: 'Primeira pessoa', perfil: 'admin' };
  private readonly segunda: UsuarioSessao = { id: 2, nome: 'Segunda pessoa', perfil: 'recepcao' };
  private readonly janelas: BrowserWindow[] = [];
  private grupos = 0;

  public async executar(): Promise<void> {
    const limite = setTimeout(() => {
      console.error('FALHA: tempo limite da integração de segurança 4.4.');
      app.exit(1);
    }, 60000);
    let handler: AutenticacaoHandler | undefined;
    let inicializacao: InicializacaoHandler | undefined;
    let conexao: Conexao | undefined;
    try {
      await app.whenReady();
      assert.match(process.versions.node, /^24\./);
      const hashReal = new HashSenhaArgon2();
      const digest = await hashReal.gerar(this.senha);
      conexao = new Conexao(':memory:');
      this.preparar(conexao, digest);
      const banco = conexao;
      const repository = new ConsultaAutenticacaoRepository(banco);
      let falhaDados = false;
      let falhaHash = false;
      let falhaIdentidade = false;
      const contadores = { consultas: 0, hashes: 0 };
      const dados: ContratoDadosAutenticacao = {
        buscarPorEmail: async (email) => {
          contadores.consultas++;
          if (falhaDados) throw new Error('SEGREDO_INTERNO SELECT senha_hash');
          return repository.buscarPorEmail(email);
        },
        buscarIdentidadePorId: async (id) => {
          contadores.consultas++;
          if (falhaIdentidade) throw new Error('SEGREDO_INTERNO identidade');
          return repository.buscarIdentidadePorId(id);
        }
      };
      const hash: ContratoHashSenha = {
        gerar: (senha) => hashReal.gerar(senha),
        verificar: async (senha, codificado) => {
          contadores.hashes++;
          if (falhaHash) throw new Error('SEGREDO_INTERNO motor de hash');
          return hashReal.verificar(senha, codificado);
        },
        necessitaAtualizacao: (codificado) => hashReal.necessitaAtualizacao(codificado)
      };
      const sessoes = new SessaoManager();
      const autorizador = new Autorizador(sessoes, dados);
      const servico = new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash }), sessoes, autorizador);
      handler = new AutenticacaoHandler(servico, sessoes);
      inicializacao = new InicializacaoHandler(new ProvisionamentoService(new UsuarioRepository(conexao), hashReal), handler, sessoes);
      const a = await this.abrir(handler);
      const b = await this.abrir(handler);
      const contextoA = { webContentsId: a.webContents.id };
      const contextoB = { webContentsId: b.webContents.id };
      this.sucesso(await this.entrar(b, { email: 'segunda@example.invalid', senha: this.senha }), this.segunda);
      const sessaoB = sessoes.obter(contextoB);
      const geracaoB = sessoes.versao(contextoB);

      const antes = { ...contadores };
      const malformadas: readonly unknown[] = [undefined, null, [], 7, 'credenciais', {}, { email: this.entrada.email },
        { senha: this.senha }, { ...this.entrada, email: 'email-invalido' }, { ...this.entrada, senha: '' },
        { ...this.entrada, senha: 1 }, { ...this.entrada, senha: '\uD800' }, { ...this.entrada, senha: 'x'.repeat(1025) },
        { ...this.entrada, usuarioId: 2 }, { ...this.entrada, perfil: 'admin' },
        { ...this.entrada, contexto: contextoB }, { ...this.entrada, sessao: { usuarioId: 2 } }];
      for (const entrada of malformadas) {
        this.falha(await this.entrar(a, entrada), 'VALIDACAO');
        assert.equal(sessoes.obter(contextoA), undefined);
      }
      assert.deepEqual(contadores, antes, 'Entrada malformada chegou ao banco/hash.');
      this.ok(`${malformadas.length} entradas malformadas rejeitadas pelo IPC antes do banco/hash, sem sessão`);

      let erroPublico: Resultado<SaidaAutenticacao> | undefined;
      for (const entrada of [{ ...this.entrada, senha: 'incorreta' },
        { email: 'ausente@example.invalid', senha: this.senha },
        { email: 'inativa@example.invalid', senha: this.senha },
        { email: 'hash-invalido@example.invalid', senha: this.senha }]) {
        const resultado = await this.entrar(a, entrada);
        this.falha(resultado, 'NAO_AUTENTICADO');
        if (erroPublico !== undefined) assert.deepEqual(resultado, erroPublico);
        erroPublico = resultado;
        assert.equal(sessoes.obter(contextoA), undefined);
        this.falha(await this.consultar(a), 'NAO_AUTENTICADO');
      }
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        this.falha(await this.entrar(a, { ...this.entrada, senha: 'incorreta' }), 'NAO_AUTENTICADO');
        assert.equal(sessoes.obter(contextoA), undefined);
      }
      this.sucesso(await this.entrar(a, this.entrada), this.primeira);
      this.sucesso(await this.consultar(a), this.primeira);
      this.ok('senha incorreta, ausente, inativo, hash inválido e cinco repetições sem autenticação indevida; login válido recupera');

      for (const tipo of ['dados', 'hash', 'identidade'] as const) {
        falhaDados = tipo === 'dados'; falhaHash = tipo === 'hash'; falhaIdentidade = tipo === 'identidade';
        this.falha(await this.entrar(a, this.entrada), 'INTERNO');
        assert.equal(sessoes.obter(contextoA), undefined);
        falhaDados = false; falhaHash = false; falhaIdentidade = false;
        this.falha(await this.consultar(a), 'NAO_AUTENTICADO');
        this.sucesso(await this.entrar(a, this.entrada), this.primeira);
      }
      this.ok('falhas de consulta, hash e releitura pelo IPC: INTERNO sanitizado, nenhuma sessão e recuperação válida');

      banco.preparar<[], never>("UPDATE usuarios SET perfil = 'instrutor' WHERE id = 1").run();
      this.sucesso(await this.consultar(a), { ...this.primeira, perfil: 'instrutor' });
      await assert.rejects(autorizador.exigirPerfil(contextoA, ['admin']),
        (erro: unknown) => erro instanceof ErroAutenticacao && erro.codigo === 'SEM_PERMISSAO');
      banco.preparar<[], never>('UPDATE usuarios SET ativo = 0 WHERE id = 1').run();
      this.falha(await this.consultar(a), 'NAO_AUTENTICADO');
      assert.equal(sessoes.obter(contextoA), undefined);
      this.falha(await this.entrar(a, this.entrada), 'NAO_AUTENTICADO');
      banco.preparar<[], never>("UPDATE usuarios SET ativo = 1, perfil = 'admin' WHERE id = 1").run();
      this.falha(await this.consultar(a), 'NAO_AUTENTICADO');
      this.sucesso(await this.entrar(a, this.entrada), this.primeira);
      assert.strictEqual(sessoes.obter(contextoB), sessaoB);
      assert.strictEqual(sessoes.versao(contextoB), geracaoB);
      this.sucesso(await this.consultar(b), this.segunda);
      this.ok('perfil atualizado e desativação no SQLite revogam acesso; reativar não restaura sessão e outra janela fica intacta');

      assert.equal(await repository.buscarPorEmail("' OR 1=1 --"), undefined);
      assert.equal(await repository.buscarPorEmail("primeira@example.invalid' OR 1=1 --"), undefined);
      assert.equal((await repository.buscarPorEmail(this.entrada.email))?.id, 1);
      assert.equal(banco.preparar<[], { total: number }>('SELECT COUNT(*) AS total FROM usuarios').get()?.total, 4);
      await this.verificarOrigem(handler, sessoes, a, b, contadores);
      this.ok('SQL parametrizado e rejeição dos três canais para remetente/frame/origem inválidos; sem banco/hash');

      // Falha SQLite real através de ambos os canais: cada janela tinha sessão válida.
      conexao.fechar();
      conexao = undefined;
      this.falha(await a.webContents.executeJavaScript('window.academia.autenticacao.sair()'), 'INTERNO');
      this.falha(await this.consultar(b), 'INTERNO');
      assert.equal(sessoes.obter(contextoA), undefined);
      assert.equal(sessoes.obter(contextoB), undefined);
      this.falha(await this.entrar(a, this.entrada), 'INTERNO');
      assert.equal(sessoes.obter(contextoA), undefined);
      handler.encerrar();
      inicializacao.encerrar(); inicializacao = undefined;
      handler = undefined;
      this.ok('banco fechado: login, consulta e logout falham com INTERNO sem autenticar ou mascarar erros');

      await this.verificarComposicao(digest);
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      console.log(`OK: ${this.grupos} grupos de segurança 4.4; Electron ${process.versions.electron}/Node ${process.versions.node}; memória/temporários e dados sintéticos.`);
      clearTimeout(limite);
      app.exit(0);
    } catch (erro: unknown) {
      handler?.encerrar();
      inicializacao?.encerrar();
      conexao?.fechar();
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      clearTimeout(limite);
      console.error(erro instanceof Error ? erro.message : 'Falha nos testes sintéticos da 4.4.');
      app.exit(1);
    }
  }

  private preparar(conexao: Conexao, digest: string): void {
    new Migrador(conexao, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial(), new Migracao004AvisosInternos(), new Migracao005Entregas()]).executar();
    const inserir = conexao.preparar<[string, string, string, string, number], never>(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, '2026-11-14', '2026-11-14')`);
    inserir.run(this.primeira.nome, this.entrada.email, digest, this.primeira.perfil, 1);
    inserir.run(this.segunda.nome, 'segunda@example.invalid', digest, this.segunda.perfil, 1);
    inserir.run('Inativa', 'inativa@example.invalid', digest, 'instrutor', 0);
    inserir.run('Hash inválido', 'hash-invalido@example.invalid', 'PHC_SINTETICO_INVALIDO', 'admin', 1);
  }

  private async abrir(handler: AutenticacaoHandler): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false, (criada, url) => handler.vincular(criada, url));
    this.janelas.push(janela);
    return janela;
  }

  private async entrar(janela: BrowserWindow, entrada: unknown): Promise<Resultado<SaidaAutenticacao>> {
    return janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify(entrada)})`);
  }

  private async consultar(janela: BrowserWindow): Promise<Resultado<SaidaAutenticacao>> {
    return janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()');
  }

  private sucesso(resultado: Resultado<SaidaAutenticacao>, usuario: UsuarioSessao): void {
    assert.deepEqual(resultado, { sucesso: true, dados: { usuario } });
    assert.doesNotMatch(JSON.stringify(resultado), /senha|hash|criadaEm|usuarioId|webContentsId|token|stack|cause/i);
  }

  private falha(resultado: Resultado<unknown>, codigo: CodigoErroAutenticacao): void {
    const mensagens: Record<CodigoErroAutenticacao, string> = {
      VALIDACAO: 'Dados de autenticação inválidos.', NAO_AUTENTICADO: 'Não foi possível autenticar a sessão.',
      SEM_PERMISSAO: 'Operação não permitida.', INTERNO: 'Não foi possível concluir a autenticação.'
    };
    assert.deepEqual(resultado, { sucesso: false, erro: { codigo, mensagem: mensagens[codigo] } });
    assert.doesNotMatch(JSON.stringify(resultado), /SEGREDO|senha|hash|criadaEm|usuarioId|webContentsId|token|stack|cause|SELECT|INSERT/i);
  }

  private async verificarOrigem(handler: AutenticacaoHandler, sessoes: SessaoManager, a: BrowserWindow,
    b: BrowserWindow, contadores: { consultas: number; hashes: number }): Promise<void> {
    const processo = app.getAppMetrics().find((metrica) => metrica.pid === a.webContents.getOSProcessId());
    assert.ok(processo !== undefined);
    if (process.platform === 'win32' || process.platform === 'darwin') assert.equal(processo.sandboxed, true);
    // A ponte só existe se o preload confirmou contextIsolated e sandboxed;
    // a ausência real de require/process no mundo principal complementa essa guarda.
    assert.deepEqual(await a.webContents.executeJavaScript(`({
      capacidades: Object.keys(window.academia), metodos: Object.keys(window.academia.autenticacao),
      congelada: Object.isFrozen(window.academia) && Object.isFrozen(window.academia.autenticacao),
      require: typeof window.require, process: typeof window.process, ipc: typeof window.ipcRenderer,
      invoke: typeof window.academia.invoke, usuarios: typeof window.academia.usuarios
    })`), { capacidades: ['autenticacao', 'usuarios', 'inicializacao', 'alunos', 'endereco', 'aulas', 'instrutores', 'planos', 'matriculas', 'pagamentos', 'avisos'], metodos: ['entrar', 'sessao', 'sair'], congelada: true,
      require: 'undefined', process: 'undefined', ipc: 'undefined', invoke: 'undefined', usuarios: 'object' });
    const negada = await new JanelaPrincipal().abrir(false);
    this.janelas.push(negada);
    const origem = await this.abrir(handler);
    this.sucesso(await this.entrar(origem, this.entrada), this.primeira);
    const url = origem.webContents.getURL();
    const bloqueada = new Promise<boolean>((resolve) => origem.webContents.once('will-navigate', (evento) => resolve(evento.defaultPrevented)));
    // Agenda depois da resposta de executeJavaScript e usa um destino file: local.
    await origem.webContents.executeJavaScript("setTimeout(() => { location.href=location.href+'?origem-teste=4.4'; }, 0); true");
    assert.equal(await bloqueada, true);
    assert.equal(origem.webContents.getURL(), url);
    // O Main força a troca para testar a origem mesmo com o bloqueio de navegação ativo.
    await origem.loadURL('about:blank');
    assert.equal(sessoes.obter({ webContentsId: origem.webContents.id }), undefined);
    const antes = { ...contadores };
    for (const canal of ['auth:entrar', 'auth:sessao', 'auth:sair'] as const) {
      const argumentos = canal === 'auth:entrar' ? [this.entrada] : [];
      for (const evento of [
        { sender: negada.webContents, senderFrame: negada.webContents.mainFrame },
        { sender: a.webContents, senderFrame: null },
        { sender: a.webContents, senderFrame: b.webContents.mainFrame },
        { sender: origem.webContents, senderFrame: origem.webContents.mainFrame }
      ]) this.falha(await handler.atender(canal, evento, argumentos), 'SEM_PERMISSAO');
    }
    this.falha(await this.entrar(negada, this.entrada), 'SEM_PERMISSAO');
    this.falha(await this.entrar(origem, this.entrada), 'SEM_PERMISSAO');
    assert.deepEqual(contadores, antes, 'Origem inválida iniciou consultas ou hash.');
    const antigo = { sender: origem.webContents, senderFrame: origem.webContents.mainFrame };
    const contexto = { webContentsId: origem.webContents.id };
    origem.destroy();
    for (const canal of ['auth:entrar', 'auth:sessao', 'auth:sair'] as const) {
      this.falha(await handler.atender(canal, antigo, canal === 'auth:entrar' ? [this.entrada] : []), 'SEM_PERMISSAO');
    }
    assert.equal(sessoes.obter(contexto), undefined);
    assert.throws(() => sessoes.versao(contexto));
  }

  private async verificarComposicao(digest: string): Promise<void> {
    const diretorio = mkdtempSync(path.join(tmpdir(), 'academia-auth44-'));
    const caminho = path.join(diretorio, 'teste.sqlite3');
    const composicao = new Composicao();
    let conexao: Conexao | undefined;
    let janela: BrowserWindow | undefined;
    try {
      conexao = new Conexao(caminho);
      this.preparar(conexao, digest);
      conexao.fechar();
      conexao = undefined;
      const anterior = readFileSync(caminho);
      composicao.iniciar(caminho);
      janela = await new JanelaPrincipal().abrir(false, (criada, url) => composicao.vincularJanela(criada, url));
      this.janelas.push(janela);
      this.falha(await this.consultar(janela), 'NAO_AUTENTICADO');
      this.sucesso(await this.entrar(janela, this.entrada), this.primeira);
      this.sucesso(await this.consultar(janela), this.primeira);
      assert.deepEqual(await janela.webContents.executeJavaScript('window.academia.autenticacao.sair()'), { sucesso: true, dados: { encerrada: true } });
      this.falha(await this.consultar(janela), 'NAO_AUTENTICADO');
      composicao.encerrar();
      assert.deepEqual(readFileSync(caminho), anterior, 'Autenticação/sessões alteraram o banco persistido de teste.');
      this.ok('composição real: migrations, janela, preload, login válido, consulta e logout; arquivo SQLite temporário inalterado');
    } finally {
      janela?.destroy();
      composicao.encerrar();
      conexao?.fechar();
      // Apenas arquivos conhecidos no diretório absoluto recém-criado; sem remoção recursiva.
      assert.equal(path.dirname(diretorio), path.resolve(tmpdir()));
      for (const arquivo of [caminho, `${caminho}-journal`, `${caminho}-wal`, `${caminho}-shm`]) {
        if (existsSync(arquivo)) unlinkSync(arquivo);
      }
      rmdirSync(diretorio);
    }
  }

  private ok(descricao: string): void { this.grupos++; console.log(`OK: ${descricao}`); }
}

void new VerificarSegurancaAutenticacao().executar();
