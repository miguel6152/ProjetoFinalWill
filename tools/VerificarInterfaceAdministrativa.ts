import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { Composicao } from '../src/main/Composicao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { Conexao } from '../src/database/Conexao';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

/** Provisiona pelos formulários; somente a substituição concorrente usa a segunda conexão. */
class VerificarInterfaceAdministrativa {
  private readonly janelas: BrowserWindow[] = [];

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-interface-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined;
    const limite = setTimeout(() => app.exit(1), 60000); let resultado = 0;
    // A fixture fecha todas as janelas para testar reabertura no mesmo processo.
    // A aplicação real encerra nesse ponto; o teste precisa manter seu runtime.
    app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo);
      const janela = await this.abrir(composicao);
      await this.aguardar(janela, "document.querySelector('#form-provisionamento') !== null");
      const senha = 'Credencial sintetica da interface', novaSenha = 'Outra credencial sintetica da interface';
      await this.preencher(janela, '#form-provisionamento', { nome: 'Admin visual', email: 'ADMIN@EXAMPLE.INVALID', senha });
      await this.enviar(janela, '#form-provisionamento');
      await this.aguardar(janela, "document.querySelector('#form-login') !== null");
      banco = new Conexao(arquivo); const repository = new UsuarioRepository(banco), hash = new HashSenhaArgon2();
      assert.equal(repository.totalUsuarios(), 1); assert.equal(repository.obterPublico(1)?.perfil, 'admin');
      const admin = repository.findById(1); assert.ok(admin); assert.equal(await hash.verificar(senha, admin.senha_hash), true);
      await this.preencher(janela, '#form-login', { email: 'admin@example.invalid', senha: 'errada' });
      await this.enviar(janela, '#form-login');
      await this.aguardar(janela, "document.querySelector('#erro-acesso').textContent.length > 0");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#senha').value"), '');
      await this.login(janela, 'admin@example.invalid', senha);
      console.log('OK interface: primeiro administrador pelo formulário, hash real, login incorreto/correto e senha removida do DOM.');

      await this.clicar(janela, '#novo-usuario'); await this.aguardar(janela, "document.querySelector('#form-usuario') !== null");
      const nome = '<img src=x onerror="window.__xss=true">';
      await this.preencher(janela, '#form-usuario', { nome, email: 'pessoa@example.invalid', perfil: 'recepcao', senha });
      await this.enviar(janela, '#form-usuario');
      await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]') !== null");
      assert.equal(repository.obterPublico(2)?.nome, nome);
      assert.equal(await janela.webContents.executeJavaScript("document.querySelectorAll('#usuarios img').length"), 0);
      assert.equal(await janela.webContents.executeJavaScript('typeof window.__xss'), 'undefined');
      await this.preencher(janela, '#busca-usuarios', { busca: 'inexistente' }); await this.enviar(janela, '#busca-usuarios');
      await this.aguardar(janela, "document.querySelector('#usuarios tbody').textContent.includes('Nenhum usuário')");
      await this.preencher(janela, '#busca-usuarios', { busca: '' }); await this.enviar(janela, '#busca-usuarios');
      await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]') !== null");
      await this.clicar(janela, 'tr[data-id="2"] [data-acao=editar]');
      await this.aguardar(janela, "document.querySelector('#form-usuario') !== null");
      await this.preencher(janela, '#form-usuario', { nome: 'Pessoa editada' }); await this.enviar(janela, '#form-usuario');
      await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]').textContent.includes('Pessoa editada')");
      assert.equal(repository.obterPublico(2)?.email, 'pessoa@example.invalid');
      await this.clicar(janela, 'tr[data-id="2"] [data-acao=senha]');
      await this.preencher(janela, '#form-senha', { senha: novaSenha }); await this.enviar(janela, '#form-senha');
      await this.aguardar(janela, "document.querySelector('#mensagem-usuarios').textContent.includes('Senha redefinida')");
      const pessoa = repository.findById(2); assert.ok(pessoa);
      assert.equal(await hash.verificar(novaSenha, pessoa.senha_hash), true); assert.equal(await hash.verificar(senha, pessoa.senha_hash), false);
      assert.equal(repository.versaoCredencial(2), 2);
      console.log('OK interface: criar/listar/buscar/editar/redefinir por renderer → preload → Main → SQLite; texto HTML não executa.');

      const recepcao = await this.abrir(composicao);
      await this.aguardar(recepcao, "document.querySelector('#form-login') !== null");
      await this.preencher(recepcao, '#form-login', { email: 'pessoa@example.invalid', senha: novaSenha });
      await this.enviar(recepcao, '#form-login');
      await this.aguardar(recepcao, "document.querySelector('#conteudo h2')?.textContent === 'Bem-vindo'");
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#usuarios')"), null);
      const negada: unknown = await recepcao.webContents.executeJavaScript('window.academia.usuarios.listar({pagina:1,tamanho:10})');
      assert.deepEqual(negada, { sucesso: false, erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Operação não permitida.' } });
      await this.clicar(janela, 'tr[data-id="2"] [data-acao=excluir]'); await this.clicar(janela, '#confirmar-exclusao');
      await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]') === null");
      assert.equal(repository.findById(2), undefined);
      assert.equal((await recepcao.webContents.executeJavaScript('window.academia.autenticacao.sessao()')).sucesso, false);
      await this.clicar(recepcao, '#sair'); await this.aguardar(recepcao, "document.querySelector('#form-login') !== null");
      console.log('OK interface: perfil sem administração negado no Main, exclusão real, revogação da outra janela e logout.');

      const hashSubstituta = await hash.gerar(novaSenha);
      for (const acao of ['editar', 'senha', 'excluir'] as const) {
        await this.clicar(janela, '#novo-usuario');
        await this.preencher(janela, '#form-usuario', { nome: 'Alvo original', email: `original-${acao}@example.invalid`, perfil: 'recepcao', senha });
        await this.enviar(janela, '#form-usuario');
        await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]') !== null");
        const identidadeOriginal = repository.identidadeConta(2);
        await this.clicar(janela, `tr[data-id="2"] [data-acao=${acao}]`);
        if (acao === 'editar') await this.aguardar(janela, "document.querySelector('#form-usuario') !== null");
        repository.delete(2);
        const substituta = repository.create({ nome: 'Substituta preservada', email: `substituta-${acao}@example.invalid`, perfil: 'admin', ativo: 1, senha_hash: hashSubstituta });
        assert.equal(substituta.id, 2); assert.notEqual(repository.identidadeConta(2), identidadeOriginal);
        const antes = banco.preparar<[number], unknown>('SELECT * FROM usuarios WHERE id = ?').get(2);
        const novas: BrowserWindow[] = [];
        for (let indice = 0; indice < 2; indice++) {
          const nova = await this.abrir(composicao); novas.push(nova);
          await this.aguardar(nova, "document.querySelector('#form-login') !== null");
          await this.login(nova, substituta.email, novaSenha);
        }
        if (acao === 'editar') {
          await this.preencher(janela, '#form-usuario', { nome: 'Alteração indevida' }); await this.enviar(janela, '#form-usuario');
        } else if (acao === 'senha') {
          await this.preencher(janela, '#form-senha', { senha }); await this.enviar(janela, '#form-senha');
        } else await this.clicar(janela, '#confirmar-exclusao');
        await this.aguardar(janela, "document.querySelector('#mensagem-usuarios').textContent.includes('conflita')");
        assert.deepEqual(banco.preparar<[number], unknown>('SELECT * FROM usuarios WHERE id = ?').get(2), antes);
        for (const nova of novas) {
          assert.equal((await nova.webContents.executeJavaScript('window.academia.autenticacao.sessao()')).sucesso, true);
          nova.destroy();
        }
        await janela.webContents.executeJavaScript("Array.from(document.querySelectorAll('#edicao-usuario button')).find(b => b.textContent === 'Cancelar').click()");
        repository.delete(2);
        await this.enviar(janela, '#busca-usuarios');
        await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"2\"]') === null");
        console.log(`OK interface M28 ${acao}: formulário antigo rejeitado, ID reutilizado, linha/hash/identidade e duas sessões novas preservados.`);
      }

      await this.clicar(janela, 'tr[data-id="1"] [data-acao=editar]');
      await this.aguardar(janela, "document.querySelector('#form-usuario') !== null");
      await janela.webContents.executeJavaScript("document.querySelector('#form-usuario [name=ativo]').checked=false");
      await this.enviar(janela, '#form-usuario');
      await this.aguardar(janela, "document.querySelector('#mensagem-usuarios').textContent.includes('conflita')");
      assert.equal(repository.obterPublico(1)?.ativo, 1);
      await this.clicar(janela, '#cancelar-edicao');
      await this.clicar(janela, 'tr[data-id="1"] [data-acao=senha]');
      await this.preencher(janela, '#form-senha', { senha: novaSenha }); await this.enviar(janela, '#form-senha');
      await this.aguardar(janela, "document.querySelector('#form-login') !== null");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#usuarios')"), null);
      await this.login(janela, 'admin@example.invalid', novaSenha);
      await this.clicar(janela, '#sair'); await this.aguardar(janela, "document.querySelector('#form-login') !== null");
      assert.equal(repository.contarAdministradores(), 1);
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(banco.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      banco.fechar(); banco = undefined;
      composicao.encerrar(); for (const j of this.janelas) if (!j.isDestroyed()) j.destroy();
      composicao.iniciar(arquivo); const reaberta = await this.abrir(composicao);
      await this.aguardar(reaberta, "document.querySelector('#form-login') !== null");
      assert.equal(await reaberta.webContents.executeJavaScript("document.querySelector('#form-provisionamento')"), null);
      await this.login(reaberta, 'admin@example.invalid', novaSenha);
      console.log('OK interface: último admin protegido, autorredefinição exige novo login, persistência e reabertura sem reprovisionamento.');
    } catch (erro: unknown) { console.error(erro instanceof Error ? erro.message : 'Falha de interface.'); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar();
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome, /^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta, nome)); }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async abrir(composicao: Composicao): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false, (j, url) => composicao.vincularJanela(j, url));
    this.janelas.push(janela); return janela;
  }

  private async aguardar(janela: BrowserWindow, expressao: string): Promise<void> {
    await janela.webContents.executeJavaScript(`new Promise((resolve,reject) => {
      let finalizada=false;
      const observar = () => { if (!finalizada && (${expressao})) {finalizada=true;observador.disconnect();clearTimeout(limite);resolve(true);} };
      const observador=new MutationObserver(observar);
      const limite=setTimeout(() => {observador.disconnect();reject(new Error('Estado esperado da interface não apareceu.'));},8000);
      observador.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});observar();
    })`);
  }

  private async preencher(janela: BrowserWindow, formulario: string, valores: Record<string, string>): Promise<void> {
    await janela.webContents.executeJavaScript(`(() => {const f=document.querySelector(${JSON.stringify(formulario)});
      for(const [nome,valor] of Object.entries(${JSON.stringify(valores)}))f.querySelector('[name="'+nome+'"]').value=valor;})()`);
  }

  private async enviar(janela: BrowserWindow, formulario: string): Promise<void> {
    await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(formulario)}).requestSubmit()`);
  }

  private async clicar(janela: BrowserWindow, seletor: string): Promise<void> {
    await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).click()`);
  }

  private async login(janela: BrowserWindow, email: string, senha: string): Promise<void> {
    await this.preencher(janela, '#form-login', { email, senha }); await this.enviar(janela, '#form-login');
    await this.aguardar(janela, "document.querySelector('#usuarios tr[data-id=\"1\"]') !== null");
  }
}
void new VerificarInterfaceAdministrativa().executar().catch(() => app.exit(1));
