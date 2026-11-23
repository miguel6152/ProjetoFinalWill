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
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

class VerificarIntegracaoJulio {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica interface instrutores';
  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-integracao-julio-')), arquivo = path.join(pasta,'teste.sqlite3');
    const transporte: typeof fetch = async () => new Response(JSON.stringify({
      hourly_units: {time:'unixtime',precipitation:'mm',precipitation_probability:'%'},
      hourly: {time:[Date.parse('2026-01-01T13:00:00Z')/1000],precipitation:[2],precipitation_probability:[80]}
    }));
    const composicao = new Composicao(undefined,undefined,new ClimaService(transporte,()=>Date.parse('2026-01-01T00:00:00Z'),60,100,true));
    let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',()=>{});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({nome:perfil,email:`${perfil}@example.invalid`,perfil,ativo:1,senha_hash:hash});
      banco.executarEstrutura("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Aluno fictício','00000000001','2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')");
      banco.executarEstrutura("INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em) VALUES ('Plano teste',1,10000,1,'UTC','UTC')");
      banco.executarEstrutura("INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (1,1,'2026-01-01','2026-01-31',10000,'ativa','UTC','UTC')");
      const janela = await this.abrir(composicao); await this.login(janela,'admin');
      // Operações passam pela ponte real do Electron e pelas validações do Main.
      await janela.webContents.executeJavaScript(`(async()=>{
        const p=window.academia;
        const ok=r=>{if(!r.sucesso)throw new Error(JSON.stringify(r));return r.dados;};
        const instrutor=ok(await p.instrutores.criar({nome:'Ana fictícia',usuario_id:3,email:'ana@example.invalid',telefone:'123',especialidade:'Funcional',ativo:1}));
        for(const presenca of ['presente','presente','ausente','nao_registrada']){
          const aula=ok(await p.aulas.criar({instrutor_id:instrutor.id,modalidade:'funcional',inicio_em:'2026-01-01T12:00:00Z',fim_em:'2026-01-01T13:00:00Z',capacidade:2,situacao:'agendada',local:'Praça fictícia',ao_ar_livre:1,latitude:0,longitude:0}));
          const clima=ok(await p.clima.consultarAula({id:aula.id}));
          if(!clima.disponivel || clima.origem!=='simulacao')throw new Error('Clima de teste não identificado');
          const inscricao=ok(await p.inscricoes.criar({aula_id:aula.id,aluno_id:1,situacao:'ativa',presenca:'nao_registrada'}));
          if(presenca!=='nao_registrada')ok(await p.inscricoes.atualizar({id:inscricao.id,referencia:inscricao.referencia,alteracoes:{presenca}}));
          ok(await p.aulas.atualizar({id:aula.id,referencia:aula.referencia,alteracoes:{situacao:'concluida'}}));
        }
        for(const [data,peso]of [['2026-01-01',70],['2026-01-02',68]])ok(await p.avaliacoes.criar({aluno_id:1,instrutor_id:instrutor.id,realizada_em:data,peso_kg:peso,altura_cm:175,cintura_cm:null,quadril_cm:null,braco_cm:null,coxa_cm:null,observacoes:null}));
      })()`);
      await this.clicar(janela,'#abrir-evolucao');
      await this.preencher(janela,'#filtros-relatorio',{aluno_id:'1',inicio:'2026-01-01',fim:'2026-01-02'});
      await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelectorAll('#resultado-relatorio tbody tr').length === 2");
      const pesos = await janela.webContents.executeJavaScript("Array.from(document.querySelectorAll('#resultado-relatorio tbody tr'),tr=>Number(tr.children[1].textContent))");
      assert.deepEqual(pesos,banco.preparar<[],{peso_kg:number}>('SELECT peso_kg FROM avaliacoes_fisicas ORDER BY realizada_em,id').all().map(p=>p.peso_kg));
      await this.clicar(janela,'#abrir-frequencia');
      await this.preencher(janela,'#filtros-relatorio',{inicio:'2026-01-01',fim:'2026-01-01'});
      await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelector('#resultado-relatorio tbody').textContent.includes('66,67%')");
      const contagens=await janela.webContents.executeJavaScript("Array.from(document.querySelector('#resultado-relatorio tbody tr').children).slice(2,5).map(td=>Number(td.textContent))");
      const sql=banco.preparar<[],{p:number;a:number;n:number}>("SELECT SUM(presenca='presente') p,SUM(presenca='ausente') a,SUM(presenca='nao_registrada') n FROM inscricoes_aula WHERE situacao='ativa'").get()!;
      assert.deepEqual(contagens,[sql.p,sql.a,sql.n]);assert.deepEqual(contagens,[2,1,1]);
      const concorrentes = await janela.webContents.executeJavaScript(`Promise.all([
        window.academia.relatorios.evolucao({aluno_id:1,inicio:'2026-01-01',fim:'2026-01-02'}),
        window.academia.relatorios.frequencia({inicio:'2026-01-01T00:00:00Z',fim:'2026-01-02T00:00:00Z'})])`);
      assert.ok(concorrentes.every((r: {sucesso:boolean}) => r.sucesso));
      await this.preencher(janela,'#filtros-relatorio',{aula_id:'4'});await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelector('#resultado-relatorio tbody').textContent.includes('sem denominador')");
      await this.preencher(janela,'#filtros-relatorio',{inicio:'2025-01-01',fim:'2025-01-02',aula_id:''});await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelector('#mensagem-relatorio').textContent.includes('Nenhum resultado')");
      // Atrasa uma resposta HTTP real para conferir o logout durante a consulta.
      const originalFetch = globalThis.fetch;
      let liberar!: () => void, iniciou!: () => void;
      const retida = new Promise<void>(resolve => { liberar = resolve; });
      const iniciouHttp = new Promise<void>(resolve => { iniciou = resolve; });
      globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
        const resposta = await originalFetch(...args); iniciou(); await retida; return resposta;
      };
      try {
        await this.preencher(janela,'#filtros-relatorio',{inicio:'2026-01-01',fim:'2026-01-01'});
        await this.enviar(janela,'#filtros-relatorio'); await iniciouHttp;
        await this.clicar(janela,'#sair'); await this.login(janela,'recepcao');
      } finally { globalThis.fetch = originalFetch; liberar(); }
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#abrir-evolucao')"),null);
      const negado=await janela.webContents.executeJavaScript("window.academia.relatorios.evolucao({aluno_id:1,inicio:'2026-01-01',fim:'2026-01-02'})");
      assert.equal(negado.erro.codigo,'SEM_PERMISSAO');
      await this.clicar(janela,'#abrir-frequencia');
      await this.preencher(janela,'#filtros-relatorio',{inicio:'2026-01-01',fim:'2026-01-01'});
      composicao.encerrarApiRelatorios();await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelector('#mensagem-relatorio').textContent.includes('API de relatórios indisponível')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelectorAll('#resultado-relatorio tbody tr').length"),0);
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#filtros-relatorio button').disabled"),false);
      await this.enviar(janela,'#filtros-relatorio');
      await this.aguardar(janela,"document.querySelector('#mensagem-relatorio').textContent.includes('API de relatórios indisponível')");
      console.log('OK fluxo Electron completo via IPC; clima simulado explícito; relatórios HTTP reais; tela=SQL; 66,67%; sem denominador; vazio; troca de sessão; acesso negado; API desligada e nova tentativa.');
    } catch(erro:unknown){console.error(erro);resultado=1;}
    finally {
      clearTimeout(limite);composicao.encerrar();banco?.fechar();for(const janela of this.janelas)if(!janela.isDestroyed())janela.destroy();
      assert.equal(path.dirname(pasta),path.resolve(tmpdir()));
      for(const nome of readdirSync(pasta)){assert.match(nome,/^teste\.sqlite3(?:-journal|-wal|-shm)?$/);unlinkSync(path.join(pasta,nome));}rmdirSync(pasta);
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
void new VerificarIntegracaoJulio().executar().catch(erro => { console.error(erro); app.exit(1); });
