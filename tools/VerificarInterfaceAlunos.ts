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
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

class VerificarInterfaceAlunos {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica para interface alunos';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-interface-alunos-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined; let resultado = 0;
    const limite = setTimeout(() => { console.error('Tempo limite: interface alunos.'); app.exit(1); }, 60000);
    app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const janela = await this.abrir(composicao); await this.login(janela, 'admin');
      await this.clicar(janela, '#abrir-alunos'); await this.aguardar(janela, "document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      await this.clicar(janela, '#novo-aluno');
      const nome = '<img src=x onerror="window.__xss=true">';
      await this.preencher(janela, '#form-aluno', { nome, cpf: '529.982.247-25', data_nascimento: '2000-02-29',
        email: 'teste@example.invalid', telefone: '(11) 99999-0000', cep: '01001-000', logradouro: 'Rua sintética', numero: '10',
        complemento: 'Sala de teste', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' });
      await this.enviar(janela, '#form-aluno');
      await this.aguardar(janela, "document.querySelector('#alunos tr[data-id=\"1\"]') !== null");
      assert.equal(new AlunoRepository(banco).findById(1)?.nome, nome);
      assert.equal(await janela.webContents.executeJavaScript("document.querySelectorAll('#alunos img').length"), 0);
      assert.equal(await janela.webContents.executeJavaScript('typeof window.__xss'), 'undefined');
      const texto: string = await janela.webContents.executeJavaScript("document.querySelector('#alunos tbody').textContent");
      assert.ok(texto.includes('***.***.247-**')); assert.ok(!texto.includes('52998224725'));
      await this.clicar(janela, '#alunos [data-acao=detalhes]');
      await this.aguardar(janela, "document.querySelector('#detalhes-aluno') !== null");
      assert.ok((await janela.webContents.executeJavaScript("document.querySelector('#detalhes-aluno').textContent")).includes('52998224725'));
      await this.clicar(janela, '#alunos [data-acao=editar]');
      await this.aguardar(janela, "document.querySelector('#form-aluno') !== null");
      await this.preencher(janela, '#form-aluno', { nome: 'Aluno editado', email: '', telefone: '', complemento: '' });
      await janela.webContents.executeJavaScript("document.querySelector('#form-aluno [name=ativo]').checked=false");
      await this.enviar(janela, '#form-aluno');
      await this.aguardar(janela, "document.querySelector('#alunos tr[data-id=\"1\"]').textContent.includes('Inativo')");
      assert.equal(new AlunoRepository(banco).findById(1)?.email, null);
      await this.preencher(janela, '#busca-alunos', { busca: 'ausente' }); await this.enviar(janela, '#busca-alunos');
      await this.aguardar(janela, "document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      await this.preencher(janela, '#busca-alunos', { busca: 'Aluno editado' }); await this.enviar(janela, '#busca-alunos');
      await this.aguardar(janela, "document.querySelector('#alunos tr[data-id=\"1\"]') !== null");
      console.log('OK interface alunos: cadastrar, listar com máscara, detalhes, editar, desativar, limpar opcionais, buscar e impedir execução de HTML.');

      await this.clicar(janela, '#novo-aluno');
      await this.preencher(janela, '#form-aluno', { nome: 'Inválido', cpf: '11111111111', data_nascimento: '2000-01-01',
        cep: '01001000', logradouro: 'Rua', numero: '1', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' });
      await this.enviar(janela, '#form-aluno');
      await this.aguardar(janela, "document.querySelector('#mensagem-alunos').textContent.includes('cpf')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#form-aluno button[type=submit]').disabled"), false);
      await this.clicar(janela, '#cancelar-aluno');
      const recepcao = await this.abrir(composicao); await this.login(recepcao, 'recepcao');
      await this.clicar(recepcao, '#abrir-alunos'); await this.aguardar(recepcao, "document.querySelector('#alunos tr[data-id=\"1\"]') !== null");
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#alunos [data-acao=excluir]')"), null);
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#novo-aluno') !== null"), true);
      const instrutor = await this.abrir(composicao); await this.login(instrutor, 'instrutor');
      await this.clicar(instrutor, '#abrir-alunos'); await this.aguardar(instrutor, "document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      assert.equal(await instrutor.webContents.executeJavaScript("document.querySelector('#novo-aluno')"), null);
      console.log('OK interface alunos: validação do Main exibida, formulário liberado após erro, recepção sem exclusão, instrutor sem cadastro e sem alunos fora do escopo.');

      // Referência antiga não permite sobrescrever alteração de outra janela.
      await this.clicar(janela, '#alunos [data-acao=editar]'); await this.aguardar(janela, "document.querySelector('#form-aluno') !== null");
      new AlunoRepository(banco).update(1, { nome: 'Alterado por outra janela' });
      await this.preencher(janela, '#form-aluno', { nome: 'Não sobrescrever' }); await this.enviar(janela, '#form-aluno');
      await this.aguardar(janela, "document.querySelector('#mensagem-alunos').textContent.includes('Consulte novamente')");
      assert.equal(new AlunoRepository(banco).findById(1)?.nome, 'Alterado por outra janela');
      await this.clicar(janela, '#cancelar-aluno');
      await this.clicar(janela, '#alunos [data-acao=excluir]');
      await this.aguardar(janela, "document.querySelector('#confirmar-exclusao-aluno') !== null");
      await this.clicar(janela, '#confirmar-exclusao-aluno');
      await this.aguardar(janela, "document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      assert.equal(new AlunoRepository(banco).findById(1), undefined);
      await this.clicar(janela, '#abrir-usuarios'); await this.aguardar(janela, "document.querySelector('#usuarios tbody tr[data-id=\"1\"]') !== null");
      // Revogação pelo Main obriga a tela de alunos a voltar ao login na próxima operação.
      await this.clicar(recepcao, '#sair'); await this.aguardar(recepcao, "document.querySelector('#form-login') !== null");
      await this.clicar(janela, '#abrir-alunos'); await this.aguardar(janela, "document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      await janela.webContents.executeJavaScript('window.academia.autenticacao.sair()');
      await this.enviar(janela, '#busca-alunos'); await this.aguardar(janela, "document.querySelector('#form-login') !== null");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#alunos')"), null);
      console.log('OK interface alunos: conflito entre janelas, exclusão confirmada persistida, navegação de usuários preservada e sessão inválida remove dados da tela.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
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
    const janela = await new JanelaPrincipal().abrir(false, (j,url) => composicao.vincularJanela(j,url)); this.janelas.push(janela); return janela;
  }
  private async aguardar(janela: BrowserWindow, expressao: string): Promise<void> {
    await janela.webContents.executeJavaScript(`new Promise((resolve,reject) => {
      const verificar=()=>{if(${expressao}){observador.disconnect();clearTimeout(limite);resolve(true);}};
      const observador=new MutationObserver(verificar),limite=setTimeout(()=>{observador.disconnect();reject(new Error('Estado esperado não apareceu: '+${JSON.stringify(expressao)}));},8000);
      observador.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});verificar();})`);
  }
  private async preencher(janela: BrowserWindow, seletor: string, valores: Record<string,string>): Promise<void> {
    await janela.webContents.executeJavaScript(`(()=>{const f=document.querySelector(${JSON.stringify(seletor)});for(const[n,v]of Object.entries(${JSON.stringify(valores)}))f.querySelector('[name="'+n+'"]').value=v;})()`);
  }
  private async enviar(janela: BrowserWindow, seletor: string): Promise<void> { await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).requestSubmit()`); }
  private async clicar(janela: BrowserWindow, seletor: string): Promise<void> { await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).click()`); }
  private async login(janela: BrowserWindow, perfil: string): Promise<void> {
    await this.aguardar(janela, "document.querySelector('#form-login') !== null");
    await this.preencher(janela, '#form-login', { email: `${perfil}@example.invalid`, senha: this.senha }); await this.enviar(janela, '#form-login');
    await this.aguardar(janela, "document.querySelector('#abrir-alunos') !== null");
  }
}
void new VerificarInterfaceAlunos().executar().catch(erro => { console.error(erro); app.exit(1); });
