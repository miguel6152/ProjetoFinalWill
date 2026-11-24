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

class VerificarInterfaceAvaliacoes {
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

      repository.create({nome:'Ana',usuario_id:3,email:'ana@example.invalid',telefone:'123',especialidade:'Dança',ativo:1});
      banco.executarEstrutura("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Teste','00000000001','2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')");
      const janela=await this.abrir(composicao);await this.login(janela,'admin');
      await this.clicar(janela,'#abrir-avaliacoes');
      await this.aguardar(janela,"document.querySelector('#novo-avaliacao') !== null");
      for (const [data,peso] of [['2026-02-01','70'],['2026-03-01','68']]) {
        await this.clicar(janela,'#novo-avaliacao');
        await this.preencher(janela,'#form-avaliacao',{aluno_id:'1',instrutor_id:'1',realizada_em:data!,peso_kg:peso!,altura_cm:'175'});
        await this.enviar(janela,'#form-avaliacao');
        await this.aguardar(janela,"document.querySelector('#avaliacoes tbody').textContent.includes("+JSON.stringify(data)+")");
      }
      assert.ok((await janela.webContents.executeJavaScript("document.querySelector('#avaliacoes').textContent")).includes('-2.00 kg'));
      await this.clicar(janela,'#avaliacoes [data-acao=detalhes]');
      await this.aguardar(janela,"document.querySelector('#detalhes-avaliacao')?.textContent.includes('Não informada')");
      await this.clicar(janela,'#avaliacoes [data-acao=excluir]');
      await this.aguardar(janela,"document.querySelector('#confirmar-exclusao-avaliacao') !== null");
      await this.clicar(janela,'#confirmar-exclusao-avaliacao');
      await this.aguardar(janela,"document.querySelectorAll('#avaliacoes tr[data-id]').length===1");
      console.log('OK duas avaliações pelo formulário, unidades, variação, detalhe e exclusão confirmada.');
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
void new VerificarInterfaceAvaliacoes().executar().catch(erro => { console.error(erro); app.exit(1); });
