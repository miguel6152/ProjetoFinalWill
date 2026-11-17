import assert from 'node:assert/strict';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Composicao } from '../src/main/Composicao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { Conexao } from '../src/database/Conexao';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { ViaCepService } from '../src/services/ViaCepService';
import { TransporteViaCepTeste } from './TransporteViaCepTeste';

class VerificarViaCepInterface {
  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-cep-interface-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const transporte = new TransporteViaCepTeste(), composicao = new Composicao(new ViaCepService(transporte.requisitar, 1000));
    let banco: Conexao | undefined, janela: BrowserWindow | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1), 60000);
    app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const senha = 'Credencial sintetica da interface CEP';
      new UsuarioRepository(banco).create({ nome: 'Admin CEP', email: 'admin@example.invalid', perfil: 'admin', ativo: 1, senha_hash: await new HashSenhaArgon2().gerar(senha) });
      janela = await new JanelaPrincipal().abrir(false, (j,url) => composicao.vincularJanela(j,url));
      await this.aguardar(janela,"document.querySelector('#form-login') !== null");
      await janela.webContents.executeJavaScript(`(()=>{const f=document.querySelector('#form-login');f.querySelector('[name=email]').value='admin@example.invalid';f.querySelector('[name=senha]').value=${JSON.stringify(senha)};f.requestSubmit();})()`);
      await this.aguardar(janela,"document.querySelector('#abrir-alunos') !== null");
      await this.clicar(janela,'#abrir-alunos');
      await this.aguardar(janela,"document.querySelector('#alunos tbody').textContent.includes('Nenhum aluno')");
      await this.clicar(janela,'#novo-aluno');
      await this.preencher(janela,{ cep: '123' }); await this.clicar(janela,'#consultar-cep');
      await this.aguardar(janela,"document.querySelector('#mensagem-cep').textContent.includes('oito dígitos')");
      assert.equal(transporte.chamadas,0);
      await this.preencher(janela,{ nome: 'Aluno ViaCEP', cpf: '52998224725', data_nascimento: '2000-01-01', cep: '01001-000',
        logradouro: 'Rua anterior', bairro: 'Bairro anterior', cidade: 'Cidade anterior', uf: 'RJ', numero: '42', complemento: 'Complemento manual' });
      await this.clicar(janela,'#consultar-cep'); await this.concluida(janela);
      assert.deepEqual(await this.endereco(janela),{ logradouro: 'Praça sintética', bairro: 'Bairro sintético', cidade: 'São Paulo', uf: 'SP', numero: '42', complemento: 'Complemento manual' });
      assert.equal(await janela.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#form-aluno input,#form-aluno select')).every(c=>!c.disabled&&!c.readOnly)`),true);
      await this.preencher(janela,{ logradouro: 'Rua corrigida manualmente' });
      await this.salvar(janela); await this.aguardar(janela,"document.querySelector('#alunos tr[data-id=\"1\"]') !== null");
      assert.equal(new AlunoRepository(banco).findById(1)?.logradouro,'Rua corrigida manualmente');
      assert.equal(new AlunoRepository(banco).findById(1)?.cidade,'São Paulo');
      console.log('OK ViaCEP interface: CEP inválido sem HTTP, botão real → preload → Main → mock HTTP, preenchimento, número/complemento preservados, correção manual persistida.');

      await this.clicar(janela,'#alunos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-aluno') !== null");
      await this.preencher(janela,{ logradouro: 'Rua manual', bairro: 'Bairro manual', cidade: 'Cidade manual', uf: 'RJ' });
      transporte.cenario = 'parcial'; await this.clicar(janela,'#consultar-cep'); await this.concluida(janela);
      assert.deepEqual(await this.endereco(janela),{ logradouro: 'Rua manual', bairro: 'Bairro manual', cidade: 'São Paulo', uf: 'SP', numero: '42', complemento: 'Complemento manual' });
      for (const [cenario, texto] of [['inexistente','CEP não encontrado'], ['rede','Não foi possível conectar'], ['indisponivel','está indisponível'], ['timeout','tempo limite']] as const) {
        transporte.cenario = cenario;
        const antes = await this.endereco(janela); await this.clicar(janela,'#consultar-cep');
        await this.aguardar(janela,`document.querySelector('#mensagem-cep').textContent.includes(${JSON.stringify(texto)})`);
        assert.deepEqual(await this.endereco(janela),antes);
        assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#consultar-cep').disabled"),false);
        assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#form-aluno button[type=submit]').disabled"),false);
      }
      await this.preencher(janela,{ logradouro: 'Endereço manual após falha' });
      await this.salvar(janela); await this.aguardar(janela,"document.querySelector('#form-aluno') === null");
      assert.equal(new AlunoRepository(banco).findById(1)?.logradouro,'Endereço manual após falha');
      console.log('OK ViaCEP interface: resposta parcial preserva campos ausentes; inexistência/rede/HTTP/timeout mantêm formulário editável, nova tentativa e salvamento manual.');

      await this.clicar(janela,'#alunos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-aluno') !== null");
      transporte.cenario = 'pendente';
      let iniciou = new Promise<void>(resolver => { transporte.iniciou = resolver; });
      await this.clicar(janela,'#consultar-cep'); await iniciou;
      await this.preencher(janela,{ cep: '20040002', logradouro: 'Rua do novo CEP' });
      const comOutroCep = await this.endereco(janela); transporte.liberar?.();
      await this.aguardar(janela,"document.querySelector('#consultar-cep').disabled === false");
      assert.deepEqual(await this.endereco(janela),comOutroCep);
      await this.preencher(janela,{ cep: '01001000' });
      iniciou = new Promise<void>(resolver => { transporte.iniciou = resolver; });
      await this.clicar(janela,'#consultar-cep'); await iniciou;
      await this.preencher(janela,{ logradouro: 'Correção durante consulta' }); transporte.liberar?.(); await this.concluida(janela);
      assert.equal((await this.endereco(janela))['logradouro'],'Correção durante consulta');
      assert.equal((await this.endereco(janela))['bairro'],'Bairro sintético');

      iniciou = new Promise<void>(resolver => { transporte.iniciou = resolver; });
      await this.clicar(janela,'#consultar-cep'); await iniciou;
      // Salvar não depende da rede e remove o formulário antes de chegar a resposta.
      await this.preencher(janela,{ logradouro: 'Salvo enquanto consulta estava pendente' });
      await this.salvar(janela); await this.aguardar(janela,"document.querySelector('#form-aluno') === null");
      assert.equal(new AlunoRepository(banco).findById(1)?.logradouro,'Salvo enquanto consulta estava pendente');
      await this.clicar(janela,'#novo-aluno');
      await this.preencher(janela,{ logradouro: 'Novo formulário preservado', cep: '20040002' });
      transporte.liberar?.();
      // A próxima chamada IPC funciona como barreira após a resposta pendente do handler.
      await janela.webContents.executeJavaScript('window.academia.autenticacao.sessao()');
      assert.equal((await this.endereco(janela))['logradouro'],'Novo formulário preservado');
      console.log('OK ViaCEP interface: resposta antiga não altera CEP novo nem edição manual; salvar durante HTTP funciona e formulário substituto é preservado.');
      assert.deepEqual(banco.preparar<[],unknown>('PRAGMA foreign_key_check').all(),[]);
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar(); if (janela !== undefined && !janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta),path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome,/^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta,nome)); }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async aguardar(janela: BrowserWindow, expressao: string): Promise<void> {
    await janela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const verificar=()=>{if(${expressao}){observador.disconnect();clearTimeout(limite);resolve(true);}};
      const observador=new MutationObserver(verificar),limite=setTimeout(()=>{observador.disconnect();reject(new Error('Estado ViaCEP não apareceu: '+${JSON.stringify(expressao)}));},8000);
      observador.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});verificar();})`);
  }
  private async clicar(janela: BrowserWindow, seletor: string): Promise<void> { await janela.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)}).click()`); }
  private async preencher(janela: BrowserWindow, valores: Record<string,string>): Promise<void> {
    await janela.webContents.executeJavaScript(`(()=>{const f=document.querySelector('#form-aluno');for(const[n,v]of Object.entries(${JSON.stringify(valores)})){const c=f.querySelector('[name="'+n+'"]');c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  }
  private async endereco(janela: BrowserWindow): Promise<Record<string,string>> {
    return janela.webContents.executeJavaScript(`Object.fromEntries(['logradouro','bairro','cidade','uf','numero','complemento'].map(n=>[n,document.querySelector('#form-aluno [name='+n+']').value]))`) as Promise<Record<string,string>>;
  }
  private async salvar(janela: BrowserWindow): Promise<void> { await janela.webContents.executeJavaScript("document.querySelector('#form-aluno').requestSubmit()"); }
  private async concluida(janela: BrowserWindow): Promise<void> { await this.aguardar(janela,"document.querySelector('#mensagem-cep').textContent.includes('Consulta concluída')"); }
}
void new VerificarViaCepInterface().executar().catch(erro => { console.error(erro); app.exit(1); });
