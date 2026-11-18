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
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { PlanoRepository } from '../src/repositories/PlanoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import type { Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarMatriculas {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica de matriculas';
  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-matriculas-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, codigo = 0;
    const limite = setTimeout(() => app.exit(1), 60000); app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const hash = await new HashSenhaArgon2().gerar(this.senha), usuarios = new UsuarioRepository(banco);
      for (const perfil of ['admin', 'recepcao', 'instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const alunos = new AlunoRepository(banco), planos = new PlanoRepository(banco);
      const aluno = alunos.create({ nome: 'Aluno sintético', cpf: '52998224725', data_nascimento: '2000-01-01', email: null, telefone: null, cep: '01001000', logradouro: 'Rua', numero: '1', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1, telegram_chat_id: null, autorizado_notificar_em: null });
      const plano = planos.create({ nome: '<Plano sintético>', duracao_meses: 1, valor_centavos: 9990, ativo: 1 });
      const outro = planos.create({ nome: 'Outro plano', duracao_meses: 3, valor_centavos: 0, ativo: 1 });
      const inserir = banco.preparar<[number, number, string], never>("INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (?,?,'2026-01-01','2026-01-31',9990,?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')");
      for (let n = 0; n < 11; n++) inserir.run(aluno.id, n === 0 ? outro.id : plano.id, n === 0 ? 'cancelada' : 'ativa');
      const admin = await this.abrir(composicao), recepcao = await this.abrir(composicao), instrutor = await this.abrir(composicao), anonimo = await this.abrir(composicao);
      for (const [janela, perfil] of [[admin,'admin'],[recepcao,'recepcao'],[instrutor,'instrutor']] as const) this.ok(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: `${perfil}@example.invalid`, senha: this.senha })})`));
      const consultar = (janela: BrowserWindow, metodo: string, entrada: unknown): Promise<Resultado<unknown>> => janela.webContents.executeJavaScript(`window.academia.matriculas.${metodo}(${JSON.stringify(entrada)})`) as Promise<Resultado<unknown>>;
      const pagina = this.ok(await consultar(admin, 'listar', { pagina: 2, tamanho: 10 })) as { total: number; itens: { id: number }[] };
      assert.equal(pagina.total, 11); assert.deepEqual(pagina.itens.map(m => m.id), [11]);
      const filtrada = this.ok(await consultar(recepcao, 'listar', { pagina: 1, tamanho: 10, aluno_id: aluno.id, plano_id: outro.id, situacao: 'cancelada' })) as { total: number; itens: { id: number }[] };
      assert.equal(filtrada.total, 1); assert.equal(filtrada.itens[0]?.id, 1);
      const detalhes = this.ok(await consultar(recepcao, 'obter', { id: 1 })) as { aluno_nome: string; plano_nome: string; valor_contratado_centavos: number };
      assert.equal(detalhes.aluno_nome, 'Aluno sintético'); assert.equal(detalhes.plano_nome, 'Outro plano'); assert.equal(detalhes.valor_contratado_centavos, 9990);
      for (const entrada of [{ pagina: 0, tamanho: 10 }, { pagina: 1, tamanho: 101 }, { pagina: 1, tamanho: 10, aluno_id: '1 OR 1=1' }, { pagina: 1, tamanho: 10, situacao: 'invalida' }, { pagina: 1, tamanho: 10, extra: 1 }]) this.falha(await consultar(admin, 'listar', entrada), 'VALIDACAO');
      this.falha(await consultar(admin, 'obter', { id: 999 }), 'NAO_ENCONTRADO');
      for (const [janela, esperado] of [[instrutor,'SEM_PERMISSAO'],[anonimo,'NAO_AUTENTICADO']] as const) for (const metodo of ['listar','obter']) this.falha(await consultar(janela, metodo, {}), esperado);
      assert.deepEqual(await admin.webContents.executeJavaScript('Object.keys(window.academia.matriculas)'), ['criar','listar','obter']);
      const novo = { aluno_id: aluno.id, plano_id: outro.id, data_inicio: '2026-01-31', data_fim: '2026-02-28', valor_contratado_centavos: 0 };
      this.falha(await consultar(admin, 'criar', novo), 'CONFLITO');
      const primeiro = this.ok(await consultar(recepcao, 'criar', { ...novo, data_inicio: '2026-02-01' })) as { id: number; situacao: string; valor_contratado_centavos: number };
      assert.equal(primeiro.situacao, 'ativa'); assert.equal(primeiro.valor_contratado_centavos, 0);
      for (const dados of [{ ...novo, aluno_id: 999 }, { ...novo, plano_id: 999 }, { ...novo, data_inicio: '2026-02-30' }, { ...novo, data_inicio: '2026-03-01', data_fim: '2026-02-01' }, { ...novo, valor_contratado_centavos: -1 }, { ...novo, valor_contratado_centavos: 1.5 }, { ...novo, situacao: 'cancelada' }]) this.falha(await consultar(admin, 'criar', dados), 'VALIDACAO');
      const inativo = planos.create({ nome: 'Inativo', duracao_meses: 1, valor_centavos: 1, ativo: 0 });
      this.falha(await consultar(admin, 'criar', { ...novo, plano_id: inativo.id }), 'VALIDACAO');
      this.falha(await consultar(instrutor, 'criar', novo), 'SEM_PERMISSAO');
      this.falha(await consultar(anonimo, 'criar', novo), 'NAO_AUTENTICADO');
      const simultaneo = { ...novo, data_inicio: '2026-03-01', data_fim: '2026-03-31' };
      const concorrentes = await Promise.all([consultar(admin, 'criar', simultaneo), consultar(recepcao, 'criar', simultaneo)]);
      assert.equal(concorrentes.filter(r => r.sucesso).length, 1); assert.equal(concorrentes.filter(r => !r.sucesso && r.erro.codigo === 'CONFLITO').length, 1);
      banco.preparar<[], never>("INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (1,1,'2026-04-01','2026-04-30',0,'encerrada','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),(1,1,'2026-04-01','2026-04-30',0,'cancelada','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')").run();
      this.ok(await consultar(admin, 'criar', { ...novo, data_inicio: '2026-04-01', data_fim: '2026-04-30' }));
      await recepcao.webContents.executeJavaScript(`document.querySelector('#form-login [name=email]').value='recepcao@example.invalid'; document.querySelector('#form-login [name=senha]').value=${JSON.stringify(this.senha)}; document.querySelector('#form-login').requestSubmit()`);
      await this.aguardar(recepcao, "document.querySelector('#abrir-matriculas') !== null");
      await recepcao.webContents.executeJavaScript("document.querySelector('#abrir-matriculas').click()");
      await this.aguardar(recepcao, "document.querySelectorAll('#matriculas tbody tr[data-id]').length === 10");
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelectorAll('#matriculas img').length"), 0);
      await recepcao.webContents.executeJavaScript("document.querySelector('#matriculas tbody button').click()");
      await this.aguardar(recepcao, "document.querySelector('#detalhes-matricula') !== null");
      assert.ok((await recepcao.webContents.executeJavaScript("document.querySelector('#detalhes-matricula').textContent") as string).includes('Outro plano'));
      await recepcao.webContents.executeJavaScript("document.querySelector('[name=plano_id]').value='2'; document.querySelector('[name=situacao]').value='cancelada'; document.querySelector('#filtros-matriculas').requestSubmit()");
      await this.aguardar(recepcao, "document.querySelectorAll('#matriculas tbody tr[data-id]').length === 1");
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#matriculas tbody tr').dataset.id"), '1');
      await recepcao.webContents.executeJavaScript("document.querySelector('#nova-matricula').click(); const f=document.querySelector('#form-matricula'); f.elements.aluno_id.value='1'; f.elements.plano_id.value='1'; f.elements.data_inicio.value='2026-05-01'; f.elements.data_fim.value='2026-05-31'; f.elements.valor.value='25,50'; f.requestSubmit()");
      await this.aguardar(recepcao, "document.querySelector('#mensagem-matriculas').textContent.includes('cadastrada')");
      assert.equal(banco.preparar<[], { total: number }>("SELECT COUNT(*) AS total FROM matriculas WHERE data_inicio='2026-05-01' AND valor_contratado_centavos=2550").get()?.total, 1);
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      console.log('OK: paginação, filtros combinados, detalhes, validação, perfis, sessão e interface Electron.');
    } catch (erro: unknown) { console.error(erro); codigo = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar(); for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome, /^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta, nome)); } rmdirSync(pasta);
    }
    app.exit(codigo);
  }
  private async abrir(composicao: Composicao): Promise<BrowserWindow> { const janela = await new JanelaPrincipal().abrir(false, (j, url) => composicao.vincularJanela(j, url)); this.janelas.push(janela); return janela; }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso, true, JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Consulta recusada'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>, codigo: string): void { assert.equal(resultado.sucesso, false); if (resultado.sucesso) throw new Error('Esperada recusa'); assert.equal(resultado.erro.codigo, codigo); }
  private async aguardar(janela: BrowserWindow, expressao: string): Promise<void> {
    await janela.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const verificar=()=>{if(${expressao}){observador.disconnect();clearTimeout(limite);resolve(true);}};const observador=new MutationObserver(verificar),limite=setTimeout(()=>{observador.disconnect();reject(new Error('Interface não atualizada'));},8000);observador.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});verificar();})`);
  }
}
void new VerificarMatriculas().executar().catch(erro => { console.error(erro); app.exit(1); });
