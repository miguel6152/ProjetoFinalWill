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
import { InscricaoRepository } from '../src/repositories/InscricaoRepository';
import { InscricaoService } from '../src/services/InscricaoService';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import type { CanalInscricao } from '../src/services/InscricaoService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarInscricoes {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica de instrutores';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-instrutores-')), arquivo = path.join(pasta,'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',() => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const a = await this.abrir(composicao), r = await this.abrir(composicao), i = await this.abrir(composicao), semSessao = await this.abrir(composicao);
      for (const [janela,perfil] of [[a,'admin'],[r,'recepcao'],[i,'instrutor']] as const) await this.login(janela,perfil);
      const equipe = new InstrutorRepository(banco);
      const ficha = { nome: 'Ana', email: 'ana@example.invalid', telefone: '123', especialidade: 'Dança', ativo: 1, usuario_id: 3 };
      const ana = equipe.create(ficha);
      const outra = usuarios.create({ nome:'Bia', email:'bia@example.invalid', senha_hash:hash, perfil:'instrutor', ativo:1 });
      const bia = equipe.create({ ...ficha, nome:'Bia', usuario_id:outra.id });
      const base = { instrutor_id:ana.id, modalidade:'funcional', inicio_em:'2026-11-23T12:00:00.000Z', fim_em:'2026-11-23T13:00:00.000Z',
        capacidade:4, situacao:'agendada', local:'Sala A', ao_ar_livre:0, latitude:null, longitude:null };

      banco.preparar<[number],never>("INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,situacao,criado_em,atualizado_em) VALUES (?,'funcional','2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',2,0,'Sala','agendada','UTC','UTC')").run(ana.id);
      banco.executarEstrutura("INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em) VALUES ('Plano',1,100,1,'UTC','UTC')");
      for (const cpf of ['00000000001','00000000002','00000000003']) {
        const aluno=banco.preparar<[string],never>("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Teste',?,'2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')").run(cpf);
        banco.preparar<[number],never>("INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (?,1,'2026-01-01','2026-01-01',100,'ativa','UTC','UTC')").run(Number(aluno.lastInsertRowid));
      }
      const dados={aula_id:1,aluno_id:1,situacao:'ativa',presenca:'nao_registrada'};
      const primeira=this.ok(await this.chamar(r,'inscricoes:criar',dados));
      this.falha(await this.chamar(r,'inscricoes:criar',dados),'CONFLITO');
      const segunda=this.ok(await this.chamar(i,'inscricoes:criar',{...dados,aluno_id:2}));
      this.falha(await this.chamar(a,'inscricoes:criar',{...dados,aluno_id:3}),'CONFLITO');
      const cancelada=this.ok(await this.chamar(r,'inscricoes:atualizar',{id:primeira.id,referencia:primeira.referencia,alteracoes:{situacao:'cancelada'}}));
      assert.equal(cancelada.situacao,'cancelada');
      const reinscrita=this.ok(await this.chamar(r,'inscricoes:criar',dados));
      assert.equal(reinscrita.id,primeira.id);
      assert.equal(reinscrita.presenca,'nao_registrada');
      this.ok(await this.chamar(i,'inscricoes:atualizar',{id:reinscrita.id,referencia:reinscrita.referencia,alteracoes:{presenca:'presente'}}));
      const ausente=this.ok(await this.chamar(i,'inscricoes:atualizar',{id:segunda.id,referencia:segunda.referencia,alteracoes:{presenca:'ausente'}}));
      this.falha(await this.chamar(a,'inscricoes:excluir',{id:ausente.id,referencia:ausente.referencia}),'CONFLITO');
      assert.equal(this.ok(await this.chamar(r,'inscricoes:listar',{pagina:1,tamanho:10,aula_id:1})).total,2);
      banco.executarEstrutura("UPDATE aulas SET situacao='concluida' WHERE id=1");
      this.falha(await this.chamar(a,'inscricoes:criar',{...dados,aluno_id:3}),'CONFLITO');
      console.log('OK limites inclusivos, lotação, duplicidade, cancelamento, reinscrição e chamada preservada.');
      banco.executarEstrutura("INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,situacao,criado_em,atualizado_em) VALUES (1,'funcional','2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',1,0,'Sala','agendada','UTC','UTC')");
      const outroBanco=new Conexao(arquivo);
      try {
        const contexto={webContentsId:98765}, sessoes=new SessaoManager();
        sessoes.registrar(contexto);
        sessoes.estabelecer(contexto,1,usuarios.identidadeConta(1)!,1);
        const servicos=[banco,outroBanco].map(conexao=>new InscricaoService(new InscricaoRepository(conexao),
          new Autorizador(sessoes,new ConsultaAutenticacaoRepository(conexao)),sessoes));
        const disputa=await Promise.allSettled(servicos.map((servico,index)=>servico.executar('inscricoes:criar',
          {...dados,aula_id:2,aluno_id:index+1},contexto,()=>{})));
        assert.equal(disputa.filter(resultado=>resultado.status==='fulfilled').length,1);
        assert.equal(new InscricaoRepository(outroBanco).listar({pagina:1,tamanho:10,aula_id:2},null).total,1);
      } finally {outroBanco.fechar();}
      const teste=this.ok(await this.chamar(a,'inscricoes:listar',{pagina:1,tamanho:10,aula_id:2})).itens[0]!;
      this.ok(await this.chamar(a,'inscricoes:excluir',{id:teste.id,referencia:teste.referencia}));
      banco.executarEstrutura("UPDATE aulas SET instrutor_id=2 WHERE id=2");
      const fora=this.ok(await this.chamar(a,'inscricoes:criar',{...dados,aula_id:2}));
      this.falha(await this.chamar(i,'inscricoes:atualizar',{id:fora.id,referencia:fora.referencia,alteracoes:{aula_id:1}}),'NAO_ENCONTRADO');
      this.ok(await this.chamar(a,'inscricoes:excluir',{id:fora.id,referencia:fora.referencia}));
      this.falha(await this.chamar(i,'inscricoes:criar',{...dados,aula_id:2}),'SEM_PERMISSAO');
      banco.executarEstrutura("UPDATE aulas SET inicio_em='2026-01-02T12:00:00Z',fim_em='2026-01-02T13:00:00Z' WHERE id=2");
      this.falha(await this.chamar(a,'inscricoes:criar',{...dados,aula_id:2}),'CONFLITO');
      banco.executarEstrutura("UPDATE aulas SET situacao='cancelada' WHERE id=2");
      this.falha(await this.chamar(a,'inscricoes:criar',{...dados,aula_id:2}),'CONFLITO');
      console.log('OK duas conexões disputam uma vaga, exclusão, fora do escopo, vigência encerrada e aula cancelada.');
      const tela=await this.abrir(composicao);
      await tela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const limite=setTimeout(()=>reject(new Error('Login indisponível')),5000);
        const intervalo=setInterval(()=>{
          const form=document.querySelector('#form-login');
          if(!form)return;
          clearInterval(intervalo);clearTimeout(limite);
          form.querySelector('[name=email]').value='admin@example.invalid';
          form.querySelector('[name=senha]').value=${JSON.stringify(this.senha)};
          form.requestSubmit();resolve(true);
        },25);
      })`);
      await tela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const limite=setTimeout(()=>reject(new Error('Agenda indisponível')),5000);
        const intervalo=setInterval(()=>{
          const botao=document.querySelector('#abrir-inscricoes');
          if(!botao)return;
          clearInterval(intervalo);clearTimeout(limite);botao.click();resolve(true);
        },25);
      })`);
      await tela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const limite=setTimeout(()=>reject(new Error('Chamada indisponível')),5000);
        const intervalo=setInterval(()=>{
          const tabela=document.querySelector('#inscricoes');
          if(!tabela?.textContent.includes('presente') || !tabela.textContent.includes('ausente'))return;
          clearInterval(intervalo);clearTimeout(limite);resolve(true);
        },25);
      })`);
      console.log('OK tela de chamada acessível pelo login e navegação, com presente e ausente.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar(); for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta),path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome,/^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta,nome)); } rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async abrir(composicao: Composicao): Promise<BrowserWindow> { const janela = await new JanelaPrincipal().abrir(false,(j,url) => composicao.vincularJanela(j,url)); this.janelas.push(janela); return janela; }
  private async login(janela: BrowserWindow,perfil: string): Promise<void> { this.ok(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: `${perfil}@example.invalid`, senha: this.senha })})`)); }
  private async chamar<C extends CanalInscricao>(janela: BrowserWindow,canal: C,entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string,unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}` : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.inscricoes.${canal.split(':')[1]}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>,codigo: string): void { assert.equal(resultado.sucesso,false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo,codigo); assert.doesNotMatch(resultado.erro.mensagem,/SELECT |SQLITE|DETALHE_INTERNO|stack/); }
}
void new VerificarInscricoes().executar().catch(erro => { console.error(erro); app.exit(1); });
