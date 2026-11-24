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
import type { CanalInstrutor } from '../src/services/InstrutorService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarInstrutores {
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
      const dados = { nome: 'Ana', email: 'ana@example.invalid', telefone: '19900000000', especialidade: 'Dança', ativo: 1, usuario_id: 3 };
      const outra = usuarios.create({ nome: 'Bia', email: 'bia@example.invalid', senha_hash: hash, perfil: 'instrutor', ativo: 1 });
      const inativa = usuarios.create({ nome: 'Cris', email: 'cris@example.invalid', senha_hash: hash, perfil: 'instrutor', ativo: 0 });
      for (const usuario_id of [99999, 2, inativa.id]) this.falha(await this.chamar(a,'instrutores:criar',{ ...dados, usuario_id }), 'VALIDACAO');
      const ana = this.ok(await this.chamar(a,'instrutores:criar',dados));
      this.falha(await this.chamar(a,'instrutores:criar',dados),'CONFLITO');
      const bia = this.ok(await this.chamar(a,'instrutores:criar',{ ...dados, nome: 'Bia', usuario_id: outra.id }));
      this.falha(await this.chamar(i,'instrutores:obter',{ id: bia.id }),'NAO_ENCONTRADO');
      assert.deepEqual(this.ok(await this.chamar(i,'instrutores:listar',{ pagina: 1, tamanho: 10 })).itens.map(x=>x.id),[ana.id]);
      assert.equal(this.ok(await this.chamar(r,'instrutores:listar',{ pagina: 2, tamanho: 1 })).itens[0]?.id,bia.id);
      assert.equal(this.ok(await this.chamar(r,'instrutores:listar',{ pagina: 1, tamanho: 10, busca: 'Bia' })).total,1);
      this.falha(await this.chamar(r,'instrutores:criar',dados),'SEM_PERMISSAO');
      this.falha(await this.chamar(semSessao,'instrutores:listar',{pagina:1,tamanho:10}),'NAO_AUTENTICADO');
      this.ok(await this.chamar(a,'instrutores:excluir',{id:bia.id,referencia:bia.referencia}));
      const editado = this.ok(await this.chamar(a,'instrutores:atualizar',{id:ana.id, referencia:ana.referencia, alteracoes:{especialidade:'Funcional'}}));
      assert.equal(this.ok(await this.chamar(i,'instrutores:obter',{id:ana.id})).especialidade,'Funcional');
      banco.preparar<[number],never>("INSERT INTO aulas(instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,situacao,criado_em,atualizado_em) VALUES (?,'funcional','2026-01-01 08:00','2026-01-01 09:00',10,0,'Sala','agendada','UTC','UTC')").run(ana.id);
      this.falha(await this.chamar(a,'instrutores:excluir',{id:ana.id,referencia:editado.referencia}),'CONFLITO');
      banco.preparar<[number],never>('DELETE FROM aulas WHERE instrutor_id = ?').run(ana.id);
      banco.executarEstrutura("INSERT INTO alunos(nome,cpf,data_nascimento,cep,logradouro,numero,bairro,cidade,uf,ativo,criado_em,atualizado_em) VALUES ('Teste','00000000000','2000-01-01','00000000','Rua','1','Centro','Teste','SP',1,'UTC','UTC')");
      banco.preparar<[number],never>("INSERT INTO avaliacoes_fisicas(aluno_id,instrutor_id,realizada_em,peso_kg,altura_cm,criado_em,atualizado_em) VALUES (1,?,'2026-01-01',70,175,'UTC','UTC')").run(ana.id);
      this.falha(await this.chamar(a,'instrutores:excluir',{id:ana.id,referencia:editado.referencia}),'CONFLITO');
      composicao.encerrar(); banco.fechar(); banco = new Conexao(arquivo);
      assert.equal(new InstrutorRepository(banco).findById(ana.id)?.especialidade,'Funcional');
      console.log('OK cadastro, vínculo, perfis, paginação, busca, edição, exclusão, histórico e reabertura.');
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
  private async chamar<C extends CanalInstrutor>(janela: BrowserWindow,canal: C,entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string,unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}` : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.instrutores.${canal.split(':')[1]}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>,codigo: string): void { assert.equal(resultado.sucesso,false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo,codigo); assert.doesNotMatch(resultado.erro.mensagem,/SELECT |SQLITE|DETALHE_INTERNO|stack/); }
}
void new VerificarInstrutores().executar().catch(erro => { console.error(erro); app.exit(1); });
