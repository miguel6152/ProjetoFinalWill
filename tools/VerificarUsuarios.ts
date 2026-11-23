import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { Migrador } from '../src/database/Migrador';
import { Migracao001EstruturaInicial } from '../src/database/migrations/Migracao001EstruturaInicial';
import { Migracao002IdentidadeConta } from '../src/database/migrations/Migracao002IdentidadeConta';
import { Migracao003VersaoCredencial } from '../src/database/migrations/Migracao003VersaoCredencial';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { SessaoAutenticacaoService } from '../src/services/SessaoAutenticacaoService';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { UsuarioService } from '../src/services/UsuarioService';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { AutenticacaoHandler } from '../src/main/ipc/AutenticacaoHandler';
import { UsuarioHandler } from '../src/main/ipc/UsuarioHandler';
import { InicializacaoHandler } from '../src/main/ipc/InicializacaoHandler';
import { ProvisionamentoService } from '../src/services/ProvisionamentoService';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { Composicao } from '../src/main/Composicao';
import type { ContratoIpc, Resultado, UsuarioDto } from '../src/shared/ipc/ContratoIpc';
import type { CanalUsuario } from '../src/services/UsuarioService';
import { VerificarIdentidades } from './VerificarIdentidades';
import { VerificarAlvosUsuarios } from './VerificarAlvosUsuarios';

/** Integração em arquivo SQLite novo, nunca userData. Não usa mocks de persistência/hash. */
class VerificarUsuarios {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintética 5 🔒';

  public async executar(): Promise<void> {
    const limite = setTimeout(() => app.exit(1), 60000);
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-usuarios-'));
    const arquivo = path.join(pasta, 'teste.sqlite3');
    let banco: Conexao | undefined;
    let auth: AutenticacaoHandler | undefined;
    let handler: UsuarioHandler | undefined;
    let inicializacao: InicializacaoHandler | undefined;
    const composicao = new Composicao();
    let resultado = 0;
    try {
      await app.whenReady();
      banco = new Conexao(arquivo);
      new Migrador(banco, [new Migracao001EstruturaInicial(), new Migracao002IdentidadeConta(), new Migracao003VersaoCredencial()]).executar();
      const hash = new HashSenhaArgon2();
      const repository = new UsuarioRepository(banco);
      const digest = await hash.gerar(this.senha);
      for (const [nome, perfil] of [['Admin', 'admin'], ['Recepcao', 'recepcao'], ['Instrutor', 'instrutor']] as const) {
        repository.create({ nome, email: `${nome.toLowerCase()}@example.invalid`, senha_hash: digest, perfil, ativo: 1 });
      }
      const sessoes = new SessaoManager();
      const dados = new ConsultaAutenticacaoRepository(banco);
      const autorizador = new Autorizador(sessoes, dados);
      auth = new AutenticacaoHandler(new SessaoAutenticacaoService(new AutenticacaoService({ dados, hash }), sessoes, autorizador), sessoes);
      inicializacao = new InicializacaoHandler(new ProvisionamentoService(repository, hash), auth, sessoes);
      let pausa: Promise<void> | undefined;
      let iniciou: (() => void) | undefined;
      let falhaHash = false;
      const servico = new UsuarioService(repository, { gerar: async senha => {
        iniciou?.(); await pausa;
        if (falhaHash) throw new Error('SEGREDO SQL senha_hash');
        return hash.gerar(senha);
      }, verificar: (senha, phc) => hash.verificar(senha, phc), necessitaAtualizacao: phc => hash.necessitaAtualizacao(phc) }, autorizador, sessoes);
      handler = new UsuarioHandler(servico, auth);
      const a = await this.abrir(auth), b = await this.abrir(auth), r = await this.abrir(auth), i = await this.abrir(auth);
      await this.login(a, 'admin'); await this.login(b, 'admin'); await this.login(r, 'recepcao'); await this.login(i, 'instrutor');
      const outra = sessoes.obter({ webContentsId: b.webContents.id });
      const entrada = { nome: ' Pessoa ', email: ' PESSOA@EXAMPLE.INVALID ', senha: this.senha, perfil: 'recepcao', ativo: 1 };
      const pessoa = this.ok(await this.chamar(a, 'usuarios:criar', entrada));
      assert.equal(pessoa.nome, 'Pessoa'); assert.equal(pessoa.email, 'pessoa@example.invalid');
      const phc = banco.preparar<[number], { senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = ?').get(pessoa.id)?.senha_hash;
      assert.ok(phc); assert.notEqual(phc, this.senha); assert.equal(await hash.verificar(this.senha, phc), true);
      assert.deepEqual(this.ok(await this.chamar(a, 'usuarios:obter', { id: pessoa.id })), pessoa);
      const lista = this.ok(await this.chamar(a, 'usuarios:listar', { pagina: 1, tamanho: 2 }));
      assert.equal(lista.total, 4); assert.deepEqual(lista.itens.map(u => u.id), [1, 2]);
      assert.equal(this.ok(await this.chamar(a, 'usuarios:listar', { pagina: 3, tamanho: 2 })).itens.length, 0);
      assert.equal(this.ok(await this.chamar(a, 'usuarios:listar', { pagina: 1, tamanho: 10, busca: 'PESSOA' })).total, 1);
      assert.equal(this.ok(await this.chamar(a, 'usuarios:listar', { pagina: 1, tamanho: 10, busca: "' OR 1=1 --" })).total, 0);
      const alterada = this.ok(await this.chamar(a, 'usuarios:atualizar', { id: pessoa.id, alteracoes: { nome: 'Renomeada' } }));
      assert.equal(alterada.email, pessoa.email); assert.equal(alterada.nome, 'Renomeada');
      assert.equal(this.ok(await this.chamar(a, 'usuarios:atualizar', { id: pessoa.id, alteracoes: { email: 'nova@example.invalid', perfil: 'instrutor' } })).perfil, 'instrutor');
      this.ok(await this.chamar(a, 'usuarios:alterar-senha', { id: pessoa.id, senha: 'Nova credencial sintética' }));
      const novoHash = banco.preparar<[number], { senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = ?').get(pessoa.id)?.senha_hash;
      assert.ok(novoHash); assert.equal(await hash.verificar(this.senha, novoHash), false);
      assert.equal(await hash.verificar('Nova credencial sintética', novoHash), true);
      const janelaPessoa = await this.abrir(auth);
      const senhaAntiga = await janelaPessoa.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email:'nova@example.invalid',senha:this.senha })})`);
      this.falha(senhaAntiga,'NAO_AUTENTICADO');
      assert.equal((await janelaPessoa.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email:'nova@example.invalid',senha:'Nova credencial sintética' })})`)).sucesso,true);
      console.log('OK: CRUD positivo, filtros/paginação, patch e Argon2id persistido, sem hash nos DTOs.');

      for (const invalida of [null, {}, { ...entrada, email: 'invalido' }, { ...entrada, senha: '' }, { ...entrada, senha: 'curta' },
        { ...entrada, perfil: 'visitante' }, { ...entrada, nome: ' ' }, { ...entrada, id: 999 },
        { ...entrada, senha_hash: digest }, { ...entrada, usuarioId: 1 }, { ...entrada, criado_em: 'x' }]) {
        this.falha(await this.chamar(a, 'usuarios:criar', invalida), 'VALIDACAO');
      }
      this.falha(await this.chamar(a, 'usuarios:criar', { ...entrada, email: ' ADMIN@EXAMPLE.INVALID ' }), 'CONFLITO');
      this.falha(await this.chamar(a, 'usuarios:atualizar', { id: pessoa.id, alteracoes: { email: 'admin@example.invalid' } }), 'CONFLITO');
      for (const patch of [{}, { senha: 'proibida' }, { senha_hash: digest }, { id: 99 }, { perfil: 'visitante' }]) {
        this.falha(await this.chamar(a, 'usuarios:atualizar', { id: pessoa.id, alteracoes: patch }), 'VALIDACAO');
      }
      for (const id of [0, -1, 1.2, '1 OR 1=1']) this.falha(await this.chamar(a, 'usuarios:obter', { id }), 'VALIDACAO');
      this.falha(await this.chamar(a, 'usuarios:alterar-senha', { id: pessoa.id, senha: 'curta' }), 'VALIDACAO');
      for (const canal of ['usuarios:obter', 'usuarios:excluir', 'usuarios:atualizar', 'usuarios:alterar-senha'] as const) {
        this.falha(await this.chamar(a, canal, { id: 9999, ...(canal === 'usuarios:atualizar' ? { alteracoes: { nome: 'Ausente' } } : {}),
          ...(canal === 'usuarios:alterar-senha' ? { senha: this.senha } : {}) }), 'NAO_ENCONTRADO');
      }
      this.falha(await this.chamar(a, 'usuarios:excluir', { id: 1 }), 'CONFLITO');
      for (const patch of [{ ativo: 0 }, { perfil: 'recepcao' }]) this.falha(await this.chamar(a, 'usuarios:atualizar', { id: 1, alteracoes: patch }), 'CONFLITO');
      banco.preparar<[], never>(`INSERT INTO instrutores (usuario_id,nome,email,telefone,especialidade,ativo,criado_em,atualizado_em)
        VALUES (3,'Sintético','instrutor@example.invalid','0','teste',1,'UTC','UTC')`).run();
      this.falha(await this.chamar(a, 'usuarios:excluir', { id: 3 }), 'CONFLITO');
      for (const patch of [{ ativo: 0 }, { perfil: 'admin' }]) this.falha(await this.chamar(a, 'usuarios:atualizar', { id: 3, alteracoes: patch }), 'CONFLITO');
      console.log('OK: entradas negativas, duplicidade, inexistência, último admin, autoexclusão e FK RESTRICT.');

      const canais = ['usuarios:criar', 'usuarios:listar', 'usuarios:obter', 'usuarios:atualizar', 'usuarios:excluir', 'usuarios:alterar-senha'] as const;
      for (const janela of [r, i]) for (const canal of canais) this.falha(await this.chamar(janela, canal, entrada), 'SEM_PERMISSAO');
      const evento = { sender: a.webContents, senderFrame: a.webContents.mainFrame };
      // A2: chamada direta preserva undefined, que JSON.stringify descartaria.
      // O campo válido impede que a rejeição seja explicada apenas por patch vazio.
      const indefinido = { nome: undefined, email: 'nao-gravar@example.invalid' };
      assert.equal(Object.hasOwn(indefinido, 'nome'), true);
      assert.deepEqual(Object.keys(indefinido), ['nome', 'email']);
      const antesIndefinido = repository.findById(pessoa.id);
      this.falha(await handler.atender('usuarios:atualizar', evento,
        [{ id: pessoa.id, alteracoes: indefinido }]), 'VALIDACAO');
      this.falha(await handler.atender('usuarios:atualizar', evento,
        [{ id: pessoa.id, alteracoes: { nome: undefined } }]), 'VALIDACAO');
      assert.deepEqual(repository.findById(pessoa.id), antesIndefinido);
      console.log('OK: A2 handler direto rejeita nome explicitamente undefined, inclusive com outro campo válido, sem gravar.');
      const negada = await new JanelaPrincipal().abrir(false); this.janelas.push(negada);
      const origemInvalida = await this.abrir(auth); await origemInvalida.loadURL('about:blank');
      await a.webContents.executeJavaScript("document.body.appendChild(document.createElement('iframe'))");
      const filho = a.webContents.mainFrame.frames[0]; assert.ok(filho);
      for (const canal of canais) {
        for (const e of [{ sender: negada.webContents, senderFrame: negada.webContents.mainFrame },
          { sender: origemInvalida.webContents, senderFrame: origemInvalida.webContents.mainFrame },
          { ...evento, senderFrame: filho }, { ...evento, senderFrame: null }, { ...evento, senderFrame: b.webContents.mainFrame }]) {
          this.falha(await handler.atender(canal, e, [entrada]), 'SEM_PERMISSAO');
        }
        this.falha(await handler.atender(canal, evento, [entrada, { usuarioId: 1 }]), 'VALIDACAO');
      }
      assert.deepEqual(await a.webContents.executeJavaScript(`({metodos:Object.keys(window.academia.usuarios),
        congelado:Object.isFrozen(window.academia.usuarios),invoke:typeof window.academia.invoke,ipc:typeof window.ipcRenderer})`),
      { metodos: ['criar','listar','obter','atualizar','excluir','alterarSenha'], congelado: true, invoke: 'undefined', ipc: 'undefined' });
      assert.strictEqual(sessoes.obter({ webContentsId: b.webContents.id }), outra);
      let acessos = 0;
      const getter = Object.defineProperty({ id: pessoa.id }, 'alteracoes', { enumerable: true,
        get: () => { acessos++; throw new Error('SEGREDO getter'); } });
      this.falha(await handler.atender('usuarios:atualizar', evento, [getter]), 'VALIDACAO');
      assert.equal(acessos, 0);
      const circular: { id: number; alteracoes?: unknown } = { id: pessoa.id }; circular.alteracoes = circular;
      this.falha(await handler.atender('usuarios:atualizar', evento, [circular]), 'VALIDACAO');
      console.log('OK: seis canais só admin, origem/frame/identidade, ponte restrita e sessão da outra janela isolada.');

      let liberar!: () => void;
      let sinal!: () => void;
      pausa = new Promise<void>(resolve => { liberar = resolve; });
      const iniciada = new Promise<void>(resolve => { sinal = resolve; }); iniciou = sinal;
      const pendente = this.chamar(a, 'usuarios:criar', { ...entrada, email: 'cancelada@example.invalid' });
      await iniciada;
      await a.webContents.executeJavaScript('window.academia.autenticacao.sair()');
      await this.login(a, 'admin');
      const substituta = sessoes.obter({ webContentsId: a.webContents.id });
      liberar(); this.falha(await pendente, 'NAO_AUTENTICADO'); pausa = undefined; iniciou = undefined;
      assert.strictEqual(sessoes.obter({ webContentsId: a.webContents.id }), substituta);
      assert.equal(await dados.buscarPorEmail('cancelada@example.invalid'), undefined);
      falhaHash = true;
      this.falha(await this.chamar(a, 'usuarios:criar', { ...entrada, email: 'falha@example.invalid' }), 'INTERNO');
      falhaHash = false;
      assert.equal(await dados.buscarPorEmail('falha@example.invalid'), undefined);

      // O ator perde privilégio durante Argon2id: guarda síncrona na transação deve negar a escrita.
      pausa = new Promise<void>(resolve => { liberar = resolve; });
      const iniciouRevogacao = new Promise<void>(resolve => { iniciou = resolve; });
      const revogada = this.chamar(a, 'usuarios:criar', { ...entrada, email: 'revogada@example.invalid' });
      await iniciouRevogacao;
      banco.preparar<[], never>("UPDATE usuarios SET perfil = 'recepcao' WHERE id = 1").run();
      liberar(); this.falha(await revogada, 'SEM_PERMISSAO'); pausa = undefined; iniciou = undefined;
      assert.equal(await dados.buscarPorEmail('revogada@example.invalid'), undefined);
      banco.preparar<[], never>("UPDATE usuarios SET perfil = 'admin' WHERE id = 1").run();

      // Usa a resposta direta do handler para observar o documento que será destruído.
      for (const destruir of [false, true]) {
        const janela = await this.abrir(auth); await this.login(janela, 'admin');
        const antigo = { sender: janela.webContents, senderFrame: janela.webContents.mainFrame };
        pausa = new Promise<void>(resolve => { liberar = resolve; });
        const inicio = new Promise<void>(resolve => { iniciou = resolve; });
        const email = destruir ? 'destruida@example.invalid' : 'navegada@example.invalid';
        const operacao = handler.atender('usuarios:criar', antigo, [{ ...entrada, email }]);
        await inicio;
        if (destruir) janela.destroy();
        else await janela.loadURL('about:blank');
        liberar(); this.falha(await operacao, 'SEM_PERMISSAO'); pausa = undefined; iniciou = undefined;
        assert.equal(await dados.buscarPorEmail(email), undefined);
      }
      console.log('OK: falha de hash, revogação durante await, navegação e destruição não deixam escritas pendentes.');
      const segundoAdmin = this.ok(await this.chamar(a, 'usuarios:criar', { ...entrada, nome: 'Outro admin', email: 'outro@example.invalid', perfil: 'admin' }));
      await b.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: 'outro@example.invalid', senha: this.senha })})`).then(v => assert.equal(v.sucesso, true));
      // Dois administradores distintos em duas janelas tentam desativar a si próprios.
      const concorrentes = await Promise.all([
        this.chamar(a, 'usuarios:atualizar', { id: 1, alteracoes: { ativo: 0 } }),
        this.chamar(b, 'usuarios:atualizar', { id: segundoAdmin.id, alteracoes: { ativo: 0 } })
      ]);
      assert.equal(concorrentes.filter(v => v.sucesso).length, 1);
      assert.equal(repository.contarAdministradores(), 1);
      const sobrevivente = banco.preparar<[], { id: number; email: string }>("SELECT id, email FROM usuarios WHERE perfil='admin' AND ativo=1").get();
      assert.ok(sobrevivente);
      await a.webContents.executeJavaScript('window.academia.autenticacao.sair()');
      await a.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: sobrevivente.email, senha: this.senha })})`).then(v => assert.equal(v.sucesso, true));
      this.ok(await this.chamar(a, 'usuarios:excluir', { id: pessoa.id }));
      this.falha(await this.chamar(a, 'usuarios:obter', { id: pessoa.id }), 'NAO_ENCONTRADO');
      this.falha(await janelaPessoa.webContents.executeJavaScript('window.academia.autenticacao.sessao()'),'NAO_AUTENTICADO');
      // Regressão completa Renderer -> preload -> IPC -> Main -> SQLite.
      for (const perfilAntigo of ['recepcao', 'admin'] as const) {
        const entradaAntiga = { nome: 'Conta excluída', email: 'excluida@example.invalid', senha: this.senha, perfil: perfilAntigo, ativo: 1 };
        const excluida = this.ok(await this.chamar(a, 'usuarios:criar', entradaAntiga));
        const tokenAntigo = repository.identidadeConta(excluida.id);
        const j1 = await this.abrir(auth), j2 = await this.abrir(auth);
        for (const j of [j1,j2]) assert.equal((await j.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: entradaAntiga.email, senha: this.senha })})`)).sucesso,true);
        this.ok(await this.chamar(a, 'usuarios:excluir', { id: excluida.id }));
        const entradaNova = { nome: 'Outra identidade', email: 'recriada@example.invalid', senha: 'Outra senha sintética', perfil: perfilAntigo === 'admin' ? 'recepcao' : 'admin', ativo: 1 };
        const recriada = this.ok(await this.chamar(a, 'usuarios:criar', entradaNova));
        assert.equal(recriada.id, excluida.id); assert.notEqual(repository.identidadeConta(recriada.id),tokenAntigo);
        for (const j of [j1,j2]) {
          assert.equal(sessoes.obter({ webContentsId: j.webContents.id }),undefined);
          this.falha(await j.webContents.executeJavaScript('window.academia.autenticacao.sessao()'),'NAO_AUTENTICADO');
          for (const canal of canais) this.falha(await this.chamar(j,canal,{ id: recriada.id }),'NAO_AUTENTICADO');
        }
        assert.equal((await j1.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: entradaNova.email, senha: entradaNova.senha })})`)).sucesso,true);
        this.ok(await this.chamar(a,'usuarios:excluir',{ id: recriada.id }));
      }
      console.log('OK: reutilização real de ID pelo IPC, duas janelas revogadas, seis canais negados e novo login obrigatório.');
      console.log('OK: logout durante hash cancela escrita, sessão substituta preservada e corrida mantém um admin ativo.');

      banco.fechar(); banco = undefined;
      this.falha(await this.chamar(a, 'usuarios:listar', { pagina: 1, tamanho: 10 }), 'INTERNO');
      console.log('OK: banco fechado produz erro público controlado, sem SQL ou stack.');
      inicializacao.encerrar(); inicializacao = undefined;
      handler.encerrar(); handler = undefined; auth.encerrar(); auth = undefined;
      banco = new Conexao(arquivo);
      assert.equal(new UsuarioRepository(banco).obterPublico(sobrevivente.id)?.ativo, 1);
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      banco.fechar(); banco = undefined;
      composicao.iniciar(arquivo);
      const montada = await new JanelaPrincipal().abrir(false, (j,url) => composicao.vincularJanela(j,url)); this.janelas.push(montada);
      assert.equal((await montada.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({email:sobrevivente.email,senha:this.senha})})`)).sucesso, true);
      assert.equal(this.ok(await this.chamar(montada, 'usuarios:listar', { pagina: 1, tamanho: 10 })).total, 4);
      composicao.encerrar();
      console.log('OK: persistência após reabertura e composição completa Main/preload/IPC em SQLite temporário.');
      assert.ok(readFileSync(arquivo).length > 0);
      await new VerificarIdentidades().executar();
      await new VerificarAlvosUsuarios().executar();
      clearTimeout(limite);
    } catch (erro: unknown) {
      console.error(erro instanceof Error ? erro.message : 'Falha sintética de usuários.');
      clearTimeout(limite); resultado = 1;
    } finally {
      inicializacao?.encerrar(); handler?.encerrar(); auth?.encerrar(); composicao.encerrar(); banco?.fechar();
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) {
        assert.ok(['teste.sqlite3','teste.sqlite3-journal','teste.sqlite3-wal','teste.sqlite3-shm'].includes(nome));
        unlinkSync(path.join(pasta,nome));
      }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }
  private async abrir(auth: AutenticacaoHandler): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false, (j,url) => auth.vincular(j,url)); this.janelas.push(janela); return janela;
  }
  private async login(j: BrowserWindow, nome: string): Promise<void> {
    assert.equal((await j.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({email:`${nome}@example.invalid`,senha:this.senha})})`)).sucesso,true);
  }
  private async chamar<C extends CanalUsuario>(j: BrowserWindow, canal: C, entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const metodos: Record<CanalUsuario,string> = { 'usuarios:criar':'criar','usuarios:listar':'listar','usuarios:obter':'obter',
      'usuarios:atualizar':'atualizar','usuarios:excluir':'excluir','usuarios:alterar-senha':'alterarSenha' };
    return j.webContents.executeJavaScript(`window.academia.usuarios.${metodos[canal]}(${JSON.stringify(entrada)})`);
  }
  private ok<T>(r: Resultado<T>): T {
    assert.equal(r.sucesso,true,JSON.stringify(r)); if (!r.sucesso) throw new Error('Sucesso esperado.');
    assert.doesNotMatch(JSON.stringify(r),/senha|hash|stack|cause|identidadeConta|identidade_conta|versaoCredencial|versao_credencial/i); return r.dados;
  }
  private falha(r: Resultado<unknown>, codigo: string): void {
    assert.equal(r.sucesso,false,JSON.stringify(r)); if(r.sucesso) throw new Error('Falha esperada.');
    assert.equal(r.erro.codigo,codigo); assert.deepEqual(Object.keys(r.erro).sort(),['codigo','mensagem']);
    assert.doesNotMatch(JSON.stringify(r),/senha_hash|SELECT|INSERT|stack|cause|identidadeConta|identidade_conta|versaoCredencial|versao_credencial|Credencial sintética/i);
  }
}
void new VerificarUsuarios().executar().catch(() => app.exit(1));
