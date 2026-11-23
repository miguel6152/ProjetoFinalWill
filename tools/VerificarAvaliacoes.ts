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

import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import type { CanalAvaliacao } from '../src/services/AvaliacaoService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarAvaliacoes {
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

      banco.executarEstrutura("INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES (1,1,'ativa','nao_registrada','UTC','UTC')");
      const dados={aluno_id:1,realizada_em:'2026-02-01',peso_kg:70,altura_cm:175};
      const primeira=this.ok(await this.chamar(i,'avaliacoes:criar',dados));
      assert.equal(primeira.instrutor_id,ana.id); assert.equal(primeira.cintura_cm,null);
      const segunda=this.ok(await this.chamar(a,'avaliacoes:criar',{...dados,realizada_em:'2026-03-01',peso_kg:68,instrutor_id:bia.id}));
      const lista=this.ok(await this.chamar(i,'avaliacoes:listar',{pagina:1,tamanho:10,aluno_id:1}));
      assert.deepEqual(lista.itens.map(x=>x.id),[primeira.id,segunda.id]);
      assert.equal(lista.itens[1]!.peso_kg-lista.itens[0]!.peso_kg,-2);
      this.ok(await this.chamar(i,'avaliacoes:obter',{id:segunda.id}));
      this.falha(await this.chamar(i,'avaliacoes:excluir',{id:segunda.id,referencia:segunda.referencia}),'SEM_PERMISSAO');
      this.falha(await this.chamar(i,'avaliacoes:atualizar',{id:segunda.id,referencia:segunda.referencia,alteracoes:{peso_kg:65}}),'SEM_PERMISSAO');
      this.falha(await this.chamar(i,'avaliacoes:criar',{...dados,instrutor_id:bia.id}),'SEM_PERMISSAO');
      for (const invalido of [{peso_kg:0},{cintura_cm:0},{altura_cm:-1},{realizada_em:'2026-02-30'}])
        this.falha(await this.chamar(i,'avaliacoes:criar',{...dados,...invalido}),'VALIDACAO');
      const fora=this.ok(await this.chamar(a,'avaliacoes:criar',{...dados,aluno_id:2,instrutor_id:bia.id}));
      this.falha(await this.chamar(i,'avaliacoes:obter',{id:fora.id}),'NAO_ENCONTRADO');
      this.falha(await this.chamar(i,'avaliacoes:atualizar',{id:primeira.id,referencia:primeira.referencia,alteracoes:{aluno_id:2}}),'SEM_PERMISSAO');
      for(const canal of ['avaliacoes:criar','avaliacoes:listar','avaliacoes:obter','avaliacoes:atualizar','avaliacoes:excluir'] as const)
        this.falha(await this.chamar(r,canal,{}),'SEM_PERMISSAO');
      const editada=this.ok(await this.chamar(i,'avaliacoes:atualizar',{id:primeira.id,referencia:primeira.referencia,alteracoes:{cintura_cm:80}}));
      this.ok(await this.chamar(i,'avaliacoes:excluir',{id:editada.id,referencia:editada.referencia}));
      composicao.encerrar(); banco.fechar(); banco=new Conexao(arquivo);
      assert.equal(banco.preparar<[number],{peso_kg:number}>('SELECT peso_kg FROM avaliacoes_fisicas WHERE id=?').get(segunda.id)?.peso_kg,68);
      console.log('OK opcionais, medidas, datas, histórico, autoria, escopo, edição, exclusão e persistência; variação de -2 kg.');
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
  private async chamar<C extends CanalAvaliacao>(janela: BrowserWindow,canal: C,entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string,unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}` : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.avaliacoes.${canal.split(':')[1]}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>,codigo: string): void { assert.equal(resultado.sucesso,false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo,codigo); assert.doesNotMatch(resultado.erro.mensagem,/SELECT |SQLITE|DETALHE_INTERNO|stack/); }
}
void new VerificarAvaliacoes().executar().catch(erro => { console.error(erro); app.exit(1); });
