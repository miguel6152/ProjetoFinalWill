import { ServidorRelatorios } from '../src/api/ServidorRelatorios';
import { CredenciaisRelatorios } from '../src/api/CredenciaisRelatorios';
import { ConsultaRelatorioService } from '../src/services/ConsultaRelatorioService';
import { RelatorioRepository } from '../src/repositories/RelatorioRepository';
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

import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarApiRelatorios {
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
      const a = await this.abrir(composicao), r = await this.abrir(composicao), i = await this.abrir(composicao);
      for (const [janela,perfil] of [[a,'admin'],[r,'recepcao'],[i,'instrutor']] as const) await this.login(janela,perfil);
      const equipe = new InstrutorRepository(banco);
      const ficha = { nome: 'Ana', email: 'ana@example.invalid', telefone: '123', especialidade: 'Dança', ativo: 1, usuario_id: 3 };
      const ana = equipe.create(ficha);
      const outra = usuarios.create({ nome:'Bia', email:'bia@example.invalid', senha_hash:hash, perfil:'instrutor', ativo:1 });
      equipe.create({ ...ficha, nome:'Bia', usuario_id:outra.id });

      banco.preparar<[number],never>("INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,situacao,criado_em,atualizado_em) VALUES (?,'funcional','2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',2,0,'Sala','agendada','UTC','UTC')").run(ana.id);
      banco.executarEstrutura("INSERT INTO planos(nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em) VALUES ('Plano',1,100,1,'UTC','UTC')");
      for (const cpf of ['00000000001','00000000002','00000000003']) {
        const aluno=banco.preparar<[string],never>("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Teste',?,'2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')").run(cpf);
        banco.preparar<[number],never>("INSERT INTO matriculas(aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (?,1,'2026-01-01','2026-01-01',100,'ativa','UTC','UTC')").run(Number(aluno.lastInsertRowid));
      }

      banco.executarEstrutura("INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES (1,1,'ativa','nao_registrada','UTC','UTC')");

      for(const presenca of ['presente','presente','ausente','nao_registrada']){
        const aula=banco.preparar<[number],never>("INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,situacao,criado_em,atualizado_em) VALUES (?,'funcional','2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',2,0,'Sala','concluida','UTC','UTC')").run(ana.id);
        banco.preparar<[number,string],never>("INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES (?,1,'ativa',?,'UTC','UTC')").run(Number(aula.lastInsertRowid),presenca);
      }
      banco.executarEstrutura("INSERT INTO avaliacoes_fisicas(aluno_id,instrutor_id,realizada_em,peso_kg,altura_cm,criado_em,atualizado_em) VALUES (1,1,'2026-01-01',70,175,'UTC','UTC'),(1,2,'2026-02-01',68,175,'UTC','UTC')");
      const acesso=composicao.acessoRelatorios({webContentsId:a.webContents.id});
      const recepcao=composicao.acessoRelatorios({webContentsId:r.webContents.id});
      const instrutor=composicao.acessoRelatorios({webContentsId:i.webContents.id});
      const consultar=(rota:string,token?:string)=>fetch(acesso.endereco+rota,{headers:token?{Authorization:'Bearer '+token}:{}});
      const evolucao='/relatorios/evolucao?aluno_id=1&inicio=2026-01-01&fim=2026-02-01';
      const frequencia='/relatorios/frequencia?inicio=2026-01-01T00:00:00Z&fim=2026-01-02T00:00:00Z';
      assert.equal((await consultar(evolucao)).status,401);
      assert.equal((await consultar(evolucao,recepcao.token)).status,403);
      assert.equal((await consultar('/relatorios/evolucao?aluno_id=x',acesso.token)).status,400);
      assert.equal((await consultar(evolucao+'&aluno_id=2',acesso.token)).status,400);
      assert.equal((await consultar('/relatorios/evolucao?aluno_id=1&inicio=2025-01-01&fim=2026-02-01',acesso.token)).status,400);
      const resposta=await consultar(evolucao,instrutor.token);
      assert.equal(resposta.status,200);
      const pontos=await resposta.json() as {pontos:{peso_kg:number}[]};
      assert.deepEqual(pontos.pontos.map(p=>p.peso_kg),[70,68]);
      const freq=await consultar(frequencia,recepcao.token);
      assert.equal(freq.status,200);
      const dados=await freq.json() as {itens:{presentes:number;ausentes:number;nao_registradas:number;percentual_presenca:number|null}[]};
      assert.equal(dados.itens[0]?.presentes,2);assert.equal(dados.itens[0]?.ausentes,1);assert.equal(dados.itens[0]?.nao_registradas,1);
      assert.equal(dados.itens[0]?.percentual_presenca?.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),'66,67');
      const vazio=await consultar('/relatorios/frequencia?inicio=2025-01-01T00:00:00Z&fim=2025-01-02T00:00:00Z',acesso.token);
      assert.deepEqual((await vazio.json() as {itens:unknown[]}).itens,[]);
      await a.webContents.executeJavaScript('window.academia.autenticacao.sair(undefined)');
      assert.equal((await consultar(frequencia,acesso.token)).status,401);
      const outraJanela=await this.abrir(composicao);
      await outraJanela.webContents.executeJavaScript('window.academia.autenticacao.entrar('+JSON.stringify({email:'bia@example.invalid',senha:this.senha})+')');
      const outro=composicao.acessoRelatorios({webContentsId:outraJanela.webContents.id});
      assert.deepEqual((await (await consultar(frequencia,outro.token)).json() as {itens:unknown[]}).itens,[]);
      assert.equal((await consultar('/relatorios/evolucao?aluno_id=3&inicio=2026-01-01&fim=2026-02-01',instrutor.token)).status,403);
      const porta=Number(new URL(acesso.endereco).port);
      banco.executarEstrutura("INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES (2,2,'ativa','nao_registrada','UTC','UTC'),(3,2,'cancelada','presente','UTC','UTC')");
      const semChamada=await consultar(frequencia+'&aluno_id=2',recepcao.token);
      const contagem=await semChamada.json() as {itens:{percentual_presenca:number|null;presentes:number;nao_registradas:number}[]};
      assert.equal(contagem.itens[0]?.percentual_presenca,null);
      assert.equal(contagem.itens[0]?.presentes,0);
      assert.equal(contagem.itens[0]?.nao_registradas,1);
      const bloqueado=new ServidorRelatorios(new ConsultaRelatorioService(new RelatorioRepository(banco),
        new Autorizador(new SessaoManager(),new ConsultaAutenticacaoRepository(banco)),new SessaoManager()),
        new CredenciaisRelatorios(new SessaoManager()));
      assert.equal(await bloqueado.iniciar(porta),false);assert.ok(bloqueado.estado().erro);bloqueado.encerrar();
      composicao.encerrar();
      await assert.rejects(fetch(acesso.endereco+frequencia));
      console.log('OK HTTP real: 400,401,403, revogação, escopo, evolução, vazio, frequência 66,67%, porta ocupada e encerramento.');
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
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
}
void new VerificarApiRelatorios().executar().catch(erro => { console.error(erro); app.exit(1); });
