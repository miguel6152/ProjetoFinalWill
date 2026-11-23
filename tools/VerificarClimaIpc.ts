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
import type { CanalAula } from '../src/services/AulaService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarClimaIpc {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica de instrutores';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-instrutores-')), arquivo = path.join(pasta,'teste.sqlite3');
    let chamadas=0;
    const transporte:typeof fetch=async()=>{chamadas++; return new Response(JSON.stringify({
      hourly_units:{time:'unixtime',precipitation:'mm',precipitation_probability:'%'},
      hourly:{time:[Date.parse('2026-11-23T13:00:00Z')/1000],precipitation:[2],precipitation_probability:[80]}
    }));};
    const composicao = new Composicao(undefined,undefined,new ClimaService(transporte,()=>Date.parse('2026-11-22T00:00:00Z'),60,100,true)); let banco: Conexao | undefined, resultado = 0;
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

      const consultar=(janela:BrowserWindow, id:number)=>janela.webContents.executeJavaScript('window.academia.clima.consultarAula('+JSON.stringify({id})+')') as Promise<Resultado<import('../src/shared/tipos/Clima').ClimaDto>>;
      this.falha(await consultar(i,externa.id),'NAO_ENCONTRADO');
      this.falha(await consultar(semSessao,externa.id),'NAO_AUTENTICADO');
      assert.equal(chamadas,0);
      assert.equal(this.ok(await consultar(i,interna.id)).disponivel,false); assert.equal(chamadas,0);
      assert.equal(this.ok(await consultar(a,externa.id)).origem,'simulacao');
      assert.equal(this.ok(await consultar(r,externa.id)).alerta,true);
      assert.equal(chamadas,1);
      const adulterada=await a.webContents.executeJavaScript('window.academia.clima.consultarAula({id:'+externa.id+',latitude:0})') as Resultado<unknown>;
      this.falha(adulterada,'VALIDACAO');
      const estado=this.ok(await this.chamar(a,'aulas:obter',{id:externa.id}));
      assert.equal(estado.situacao,'agendada');
      console.log('OK IPC clima: admin, recepção, instrutor restrito, aula interna, ID exclusivo, cache e situação preservada.');
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
void new VerificarClimaIpc().executar().catch(erro => { console.error(erro); app.exit(1); });
