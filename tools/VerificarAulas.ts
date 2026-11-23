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
import type { CanalAula } from '../src/services/AulaService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarAulas {
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
      const interna = this.ok(await this.chamar(i,'aulas:criar',base));
      for (const invalida of [{ fim_em:base.inicio_em }, {inicio_em:'ontem'}, {latitude:91}, {longitude:-181}, {ao_ar_livre:1}, {capacidade:0}, {capacidade:1.5}])
        this.falha(await this.chamar(a,'aulas:criar',{...base,...invalida}),'VALIDACAO');
      const externa = this.ok(await this.chamar(a,'aulas:criar',{...base,instrutor_id:bia.id,ao_ar_livre:1,latitude:0,longitude:0,local:'Praça'}));
      this.falha(await this.chamar(i,'aulas:atualizar',{id:externa.id,referencia:externa.referencia,alteracoes:{instrutor_id:ana.id}}),'NAO_ENCONTRADO');
      this.falha(await this.chamar(i,'aulas:atualizar',{id:interna.id,referencia:interna.referencia,alteracoes:{instrutor_id:bia.id}}),'SEM_PERMISSAO');
      this.falha(await this.chamar(r,'aulas:criar',base),'SEM_PERMISSAO');
      this.falha(await this.chamar(semSessao,'aulas:obter',{id:interna.id}),'NAO_AUTENTICADO');
      const filtro = {pagina:1,tamanho:10,inicio:base.inicio_em,fim:base.fim_em};
      assert.equal(this.ok(await this.chamar(i,'aulas:listar',filtro)).total,1);
      assert.equal(this.ok(await this.chamar(r,'aulas:listar',filtro)).total,2);
      assert.equal(this.ok(await this.chamar(r,'aulas:listar',{...filtro,instrutor_id:bia.id})).itens[0]?.latitude,0);
      assert.equal(this.ok(await this.chamar(a,'aulas:listar',{pagina:1,tamanho:10,inicio:base.fim_em})).total,0);
      for (const cpf of ['00000000001','00000000002']) {
        const aluno = banco.preparar<[string],never>("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Teste',?,'2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')").run(cpf);
        banco.preparar<[number,number],never>("INSERT INTO inscricoes_aula(aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES (?,?,'ativa','nao_registrada','UTC','UTC')").run(interna.id,Number(aluno.lastInsertRowid));
      }
      this.falha(await this.chamar(i,'aulas:atualizar',{id:interna.id,referencia:interna.referencia,alteracoes:{capacidade:1}}),'CONFLITO');
      this.falha(await this.chamar(a,'aulas:excluir',{id:interna.id,referencia:interna.referencia}),'CONFLITO');
      this.ok(await this.chamar(i,'aulas:atualizar',{id:interna.id,referencia:interna.referencia,alteracoes:{situacao:'concluida'}}));
      const cancelada = this.ok(await this.chamar(a,'aulas:atualizar',{id:externa.id,referencia:externa.referencia,alteracoes:{situacao:'cancelada'}}));
      this.ok(await this.chamar(a,'aulas:excluir',{id:externa.id,referencia:cancelada.referencia}));
      equipe.update(ana.id,{ativo:0});
      this.falha(await this.chamar(i,'aulas:criar',base),'VALIDACAO');
      console.log('OK agenda, horários, coordenadas, permissões de origem e destino, capacidade e histórico.');
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
  private async chamar<C extends CanalAula>(janela: BrowserWindow,canal: C,entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string,unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}` : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.aulas.${canal.split(':')[1]}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>,codigo: string): void { assert.equal(resultado.sucesso,false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo,codigo); assert.doesNotMatch(resultado.erro.mensagem,/SELECT |SQLITE|DETALHE_INTERNO|stack/); }
}
void new VerificarAulas().executar().catch(erro => { console.error(erro); app.exit(1); });
