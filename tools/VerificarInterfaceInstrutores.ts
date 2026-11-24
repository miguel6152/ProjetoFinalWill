import assert from 'node:assert/strict';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Composicao } from '../src/main/Composicao';
import { Conexao } from '../src/database/Conexao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { InstrutorRepository } from '../src/repositories/InstrutorRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

class VerificarInterfaceInstrutores {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica interface instrutores';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-interface-instrutores-')), arquivo = path.join(pasta,'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',() => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha), repository = new InstrutorRepository(banco);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, perfil, ativo: 1, senha_hash: hash });
      const janela = await this.abrir(composicao); await this.login(janela,'admin');
      await this.clicar(janela,'#abrir-instrutores'); await this.aguardar(janela,"document.querySelector('#instrutores tbody').textContent.includes('Nenhum instrutor')");
      await this.clicar(janela,'#novo-instrutor');
      await this.preencher(janela,'#form-instrutor',{nome:'Ana',usuario_id:'3',especialidade:'Dança',email:'ana@example.invalid',telefone:'19900000000'});
      await this.enviar(janela,'#form-instrutor');
      await this.aguardar(janela,"document.querySelector('#instrutores [data-acao=editar]') !== null");
      await this.clicar(janela,'#instrutores [data-acao=editar]');
      await this.aguardar(janela,"document.querySelector('#form-instrutor') !== null");
      await this.preencher(janela,'#form-instrutor',{especialidade:'Funcional'});
      await this.enviar(janela,'#form-instrutor');
      await this.aguardar(janela,"document.querySelector('#instrutores tbody').textContent.includes('Funcional')");
      await this.clicar(janela,'#instrutores [data-acao=detalhes]');
      await this.aguardar(janela,"document.querySelector('#detalhes-instrutor')?.textContent.includes('Funcional')");
      assert.equal(repository.findById(1)?.usuario_id,3);
      console.log('OK demonstração pelo formulário e detalhes.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar(); for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta),path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome,/^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta,nome)); } rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async abrir(composicao: Composicao): Promise<BrowserWindow> { const janela = await new JanelaPrincipal().abrir(false,(j,url) => composicao.vincularJanela(j,url)); this.janelas.push(janela); return janela; }
  private async aguardar(janela: BrowserWindow,expressao: string): Promise<void> {
    await janela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const conferir=()=>{if(${expressao}){observador.disconnect();clearTimeout(limite);resolve(true);}};
      const observador=new MutationObserver(conferir),limite=setTimeout(()=>{observador.disconnect();reject(new Error('Estado de instrutores não apareceu: '+${JSON.stringify(expressao)}));},8000);
      observador.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});conferir();})`);
  }
  private async clicar(janela: BrowserWindow,seletor: string): Promise<void> { await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).click()`); }
  private async preencher(janela: BrowserWindow,seletor: string,valores: Record<string,string>): Promise<void> {
    await janela.webContents.executeJavaScript(`(()=>{const f=document.querySelector(${JSON.stringify(seletor)});for(const[n,v]of Object.entries(${JSON.stringify(valores)}))f.querySelector('[name="'+n+'"]').value=v;})()`);
  }
  private async enviar(janela: BrowserWindow,seletor: string): Promise<void> { await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).requestSubmit()`); }
  private async login(janela: BrowserWindow,perfil: string): Promise<void> {
    await this.aguardar(janela,"document.querySelector('#form-login') !== null"); await this.preencher(janela,'#form-login',{ email: `${perfil}@example.invalid`, senha: this.senha });
    await this.enviar(janela,'#form-login'); await this.aguardar(janela,"document.querySelector('#abrir-alunos') !== null");
  }
}
void new VerificarInterfaceInstrutores().executar().catch(erro => { console.error(erro); app.exit(1); });
