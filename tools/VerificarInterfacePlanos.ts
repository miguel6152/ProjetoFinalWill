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
import { PlanoRepository } from '../src/repositories/PlanoRepository';
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

class VerificarInterfacePlanos {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica interface planos';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-interface-planos-')), arquivo = path.join(pasta,'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',() => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha), repository = new PlanoRepository(banco);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, perfil, ativo: 1, senha_hash: hash });
      const janela = await this.abrir(composicao); await this.login(janela,'admin');
      await this.clicar(janela,'#abrir-planos'); await this.aguardar(janela,"document.querySelector('#planos tbody').textContent.includes('Nenhum plano')");
      await this.clicar(janela,'#novo-plano');
      const nome = '<img src=x onerror="window.__xss=true">';
      await this.preencher(janela,'#form-plano',{ nome, duracao_meses: '1', valor: '0,29' }); await this.enviar(janela,'#form-plano');
      await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"1\"]') !== null");
      assert.equal(repository.findById(1)?.valor_centavos,29);
      assert.equal(await janela.webContents.executeJavaScript("document.querySelectorAll('#planos img').length"),0);
      assert.equal(await janela.webContents.executeJavaScript('typeof window.__xss'),'undefined');
      await this.clicar(janela,'#planos [data-acao=detalhes]'); await this.aguardar(janela,"document.querySelector('#detalhes-plano') !== null");
      assert.ok((await janela.webContents.executeJavaScript("document.querySelector('#detalhes-plano').textContent")).includes('R$ 0,29'));
      await this.clicar(janela,'#planos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-plano') !== null");
      await this.preencher(janela,'#form-plano',{ nome: 'Plano trimestral editado', duracao_meses: '3', valor: '1234.56' });
      await janela.webContents.executeJavaScript("document.querySelector('#form-plano [name=ativo]').checked=false");
      await this.enviar(janela,'#form-plano'); await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"1\"]').textContent.includes('Inativo')");
      assert.equal(repository.findById(1)?.valor_centavos,123456); assert.equal(repository.findById(1)?.duracao_meses,3);
      await this.preencher(janela,'#busca-planos',{ busca: 'ausente' }); await this.enviar(janela,'#busca-planos');
      await this.aguardar(janela,"document.querySelector('#planos tbody').textContent.includes('Nenhum plano')");
      await this.preencher(janela,'#busca-planos',{ busca: '' }); await this.enviar(janela,'#busca-planos');
      await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"1\"]') !== null");
      console.log('OK interface planos: cadastro, detalhes, edição, desativação, busca, reais/centavos persistidos e HTML tratado como texto.');

      await this.clicar(janela,'#planos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-plano') !== null");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#form-plano [name=valor]').value"),'1234,56');
      await this.preencher(janela,'#form-plano',{ valor: '1,234' }); await this.enviar(janela,'#form-plano');
      await this.aguardar(janela,"document.querySelector('#mensagem-planos').textContent.includes('duas casas')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#form-plano button[type=submit]').disabled"),false);
      await this.preencher(janela,'#form-plano',{ nome: ' ', valor: '0' }); await this.enviar(janela,'#form-plano');
      await this.aguardar(janela,"document.querySelector('#mensagem-planos').textContent.includes('nome')");
      assert.equal(repository.findById(1)?.valor_centavos,123456); await this.clicar(janela,'#cancelar-plano');
      const recepcao = await this.abrir(composicao); await this.login(recepcao,'recepcao'); await this.clicar(recepcao,'#abrir-planos');
      await this.aguardar(recepcao,"document.querySelector('#planos tr[data-id=\"1\"]') !== null");
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#novo-plano')"),null);
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#planos [data-acao=editar],#planos [data-acao=excluir]')"),null);
      await this.clicar(recepcao,'#planos [data-acao=detalhes]'); await this.aguardar(recepcao,"document.querySelector('#detalhes-plano') !== null");
      const instrutor = await this.abrir(composicao); await this.login(instrutor,'instrutor');
      assert.equal(await instrutor.webContents.executeJavaScript("document.querySelector('#abrir-planos')"),null);
      console.log('OK interface planos: validação local e no Main, recuperação após erro, recepção somente leitura e instrutor sem navegação de planos.');

      new AlunoRepository(banco).create({ nome: 'Aluno fixture', cpf: '52998224725', data_nascimento: '2000-01-01', email: null, telefone: null,
        cep: '01001000', logradouro: 'Rua', numero: '1', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1, telegram_chat_id: null, autorizado_notificar_em: null });
      banco.executarEstrutura(`INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
        VALUES (1,1,'2026-01-01','2026-03-31',777,'ativa','UTC','UTC');`);
      const vinculo = banco.preparar<[],unknown>('SELECT * FROM matriculas').all();
      await this.clicar(janela,'#planos [data-acao=excluir]'); await this.aguardar(janela,"document.querySelector('#confirmar-exclusao-plano') !== null");
      await this.clicar(janela,'#confirmar-exclusao-plano'); await this.aguardar(janela,"document.querySelector('#mensagem-planos').textContent.includes('desativados')");
      assert.ok(repository.findById(1));
      await janela.webContents.executeJavaScript("Array.from(document.querySelectorAll('#edicao-plano button')).find(b=>b.textContent==='Cancelar').click()");
      await this.clicar(janela,'#planos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-plano') !== null");
      await this.preencher(janela,'#form-plano',{ nome: 'Plano anual gratuito', duracao_meses: '12', valor: '0' });
      await this.enviar(janela,'#form-plano'); await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"1\"]').textContent.includes('Plano anual gratuito')");
      assert.deepEqual(banco.preparar<[],unknown>('SELECT * FROM matriculas').all(),vinculo); assert.equal(repository.findById(1)?.valor_centavos,0);
      await this.clicar(janela,'#planos [data-acao=editar]'); await this.aguardar(janela,"document.querySelector('#form-plano') !== null");
      repository.update(1,{ nome: 'Alteração concorrente' });
      await this.preencher(janela,'#form-plano',{ nome: 'Não sobrescrever' }); await this.enviar(janela,'#form-plano');
      await this.aguardar(janela,"document.querySelector('#mensagem-planos').textContent.includes('Consulte novamente')");
      assert.equal(repository.findById(1)?.nome,'Alteração concorrente'); await this.clicar(janela,'#cancelar-plano');

      await this.clicar(janela,'#novo-plano'); await this.preencher(janela,'#form-plano',{ nome: 'Sem vínculos', valor: '10,00' });
      await this.enviar(janela,'#form-plano'); await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"2\"]') !== null");
      await this.clicar(janela,'#planos tr[data-id="2"] [data-acao=excluir]'); await this.aguardar(janela,"document.querySelector('#confirmar-exclusao-plano') !== null");
      await this.clicar(janela,'#confirmar-exclusao-plano'); await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"2\"]') === null");
      assert.equal(repository.findById(2),undefined);
      await this.clicar(janela,'#abrir-alunos'); await this.aguardar(janela,"document.querySelector('#alunos tr[data-id=\"1\"]') !== null");
      await this.clicar(janela,'#abrir-usuarios'); await this.aguardar(janela,"document.querySelector('#usuarios tbody tr[data-id=\"1\"]') !== null");
      await this.clicar(janela,'#abrir-planos'); await this.aguardar(janela,"document.querySelector('#planos tr[data-id=\"1\"]') !== null");
      await janela.webContents.executeJavaScript('window.academia.autenticacao.sair()');
      await this.enviar(janela,'#busca-planos'); await this.aguardar(janela,"document.querySelector('#form-login') !== null");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#planos')"),null);
      assert.deepEqual(banco.preparar<[],unknown>('PRAGMA foreign_key_check').all(),[]);
      console.log('OK interface planos: exclusão com vínculo recusada, plano gratuito/desativado preserva matrícula, conflito concorrente, exclusão sem vínculo, navegação e sessão inválida.');
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
      const observador=new MutationObserver(conferir),limite=setTimeout(()=>{observador.disconnect();reject(new Error('Estado de planos não apareceu: '+${JSON.stringify(expressao)}));},8000);
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
void new VerificarInterfacePlanos().executar().catch(erro => { console.error(erro); app.exit(1); });
