import { ClimaService } from '../src/services/ClimaService';
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

class VerificarInterfaceClima {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica interface instrutores';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-interface-instrutores-')), arquivo = path.join(pasta,'teste.sqlite3');
    const transporte:typeof fetch=async()=>new Response(JSON.stringify({
      hourly_units:{time:'unixtime',precipitation:'mm',precipitation_probability:'%'},
      hourly:{time:[Date.parse('2026-11-23T13:00:00Z')/1000],precipitation:[2],precipitation_probability:[80]}
    }));
    const composicao = new Composicao(undefined,undefined,new ClimaService(transporte,()=>Date.parse('2026-11-22T00:00:00Z'),60,100,true)); let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',() => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha), repository = new InstrutorRepository(banco);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, perfil, ativo: 1, senha_hash: hash });
      const instrutor = repository.create({nome:'Ana',usuario_id:3,email:'ana@example.invalid',telefone:'123',especialidade:'Dança',ativo:1});
      const janela = await this.abrir(composicao); await this.login(janela,'admin');
      await this.clicar(janela,'#abrir-aulas');
      await this.aguardar(janela,"document.querySelector('#aulas tbody').textContent.includes('Nenhuma aula')");
      for (const local of ['Sala','Praça']) {
        await this.clicar(janela,'#novo-aula');
        await this.preencher(janela,'#form-aula',{instrutor_id:String(instrutor.id), inicio_em:'2026-11-23T09:00', fim_em:'2026-11-23T10:00', capacidade:'5',local});
        if (local === 'Praça') {
          await this.clicar(janela,'#form-aula [name=ao_ar_livre]');
          await this.preencher(janela,'#form-aula',{latitude:'0',longitude:'0'});
        }
        await this.enviar(janela,'#form-aula');
        await this.aguardar(janela,"document.querySelector('#aulas tbody').textContent.includes(" + JSON.stringify(local) + ")");
      }
      await this.clicar(janela,'#aulas [data-acao=clima]');
      await this.aguardar(janela,"document.querySelector('#edicao-aula').textContent.includes('simulacao')");
      assert.ok((await janela.webContents.executeJavaScript("document.querySelector('#edicao-aula').textContent")).includes('80%'));
      assert.ok((await janela.webContents.executeJavaScript("document.querySelector('#edicao-aula').textContent")).includes('2 mm'));
      assert.equal(banco.preparar<[],{inicio_em:string}>('SELECT inicio_em FROM aulas ORDER BY id LIMIT 1').get()?.inicio_em,'2026-11-23T12:00:00.000Z');
      await this.clicar(janela,'#aulas [data-acao=detalhes]');
      await this.aguardar(janela,"document.querySelector('#detalhes-aula')?.textContent.includes('09:00')");
      await this.clicar(janela,'#aulas [data-acao=excluir]');
      await this.aguardar(janela,"document.querySelector('#confirmar-exclusao-aula') !== null");
      await this.clicar(janela,'#confirmar-exclusao-aula');
      await this.aguardar(janela,"document.querySelectorAll('#aulas tr[data-id]').length === 1");
      console.log('OK aulas interna e externa, agenda em São Paulo, detalhes e exclusão confirmada.');
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
void new VerificarInterfaceClima().executar().catch(erro => { console.error(erro); app.exit(1); });
