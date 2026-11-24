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
      for (const [janela, esperado] of [[instrutor,'SEM_PERMISSAO'],[anonimo,'NAO_AUTENTICADO']] as const) for (const metodo of ['listar','obter','atualizar']) this.falha(await consultar(janela, metodo, {}), esperado);
      assert.deepEqual(await admin.webContents.executeJavaScript('Object.keys(window.academia.matriculas)'), ['criar','cancelar','encerrar','excluir','listar','obter','atualizar']);
      const novo = { aluno_id: aluno.id, plano_id: outro.id, data_inicio: '2026-01-31', data_fim: '2026-02-28', valor_contratado_centavos: 0 };
      this.falha(await consultar(admin, 'criar', novo), 'CONFLITO');
      const primeiro = this.ok(await consultar(recepcao, 'criar', { ...novo, data_inicio: '2026-02-01' })) as { id: number; situacao: string; valor_contratado_centavos: number };
      assert.equal(primeiro.situacao, 'ativa'); assert.equal(primeiro.valor_contratado_centavos, 0);
      for (const dados of [{ ...novo, aluno_id: 999 }, { ...novo, plano_id: 999 }, { ...novo, data_inicio: '2026-02-30' }, { ...novo, data_inicio: '2026-03-01', data_fim: '2026-02-01' }, { ...novo, valor_contratado_centavos: -1 }, { ...novo, valor_contratado_centavos: 1.5 }, { ...novo, situacao: 'cancelada' }]) this.falha(await consultar(admin, 'criar', dados), 'VALIDACAO');
      const inativo = planos.create({ nome: 'Inativo', duracao_meses: 1, valor_centavos: 1, ativo: 0 });
      this.falha(await consultar(admin, 'criar', { ...novo, plano_id: inativo.id }), 'VALIDACAO');
      this.falha(await consultar(instrutor, 'criar', novo), 'SEM_PERMISSAO');
      this.falha(await consultar(anonimo, 'criar', novo), 'NAO_AUTENTICADO');
      const alunoEdicao = alunos.create({ nome: 'Aluno de edição', cpf: '11144477735', data_nascimento: '2000-01-01', email: null, telefone: null, cep: '01001000', logradouro: 'Rua', numero: '2', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1, telegram_chat_id: null, autorizado_notificar_em: null });
      const matriculaEdicao = this.ok(await consultar(recepcao, 'criar', { aluno_id: alunoEdicao.id, plano_id: plano.id,
        data_inicio: '2026-05-01', data_fim: '2026-05-31', valor_contratado_centavos: 10000 })) as { id: number; referencia: string; atualizado_em: string };
      banco.preparar<[number], never>("UPDATE matriculas SET atualizado_em='2000-01-01T00:00:00.000Z' WHERE id=?").run(matriculaEdicao.id);
      const referenciaInicial = this.ok(await consultar(recepcao, 'obter', { id: matriculaEdicao.id })) as { referencia: string };
      const alteracoes = { aluno_id: aluno.id, plano_id: outro.id, data_inicio: '2026-06-01', data_fim: '2026-06-30', valor_contratado_centavos: 12550 };
      this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia,
        alteracoes: { ...alteracoes, aluno_id: 999 } }), 'VALIDACAO');
      this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia,
        alteracoes: { ...alteracoes, plano_id: inativo.id } }), 'VALIDACAO');
      for (const invalida of [{ data_inicio: '2026-02-30' }, { data_inicio: '2026-07-01', data_fim: '2026-06-01' }]) {
        this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia,
          alteracoes: { ...alteracoes, ...invalida } }), 'VALIDACAO');
      }
      this.falha(await consultar(instrutor, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia, alteracoes }), 'SEM_PERMISSAO');
      this.falha(await consultar(anonimo, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia, alteracoes }), 'NAO_AUTENTICADO');
      const atualizada = this.ok(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id,
        referencia: referenciaInicial.referencia, alteracoes })) as { id: number; aluno_id: number; plano_id: number; data_inicio: string; data_fim: string; valor_contratado_centavos: number; atualizado_em: string; referencia: string };
      assert.equal(atualizada.aluno_id, aluno.id); assert.equal(atualizada.plano_id, outro.id);
      assert.equal(atualizada.data_inicio, '2026-06-01'); assert.equal(atualizada.data_fim, '2026-06-30');
      assert.equal(atualizada.valor_contratado_centavos, 12550); assert.notEqual(atualizada.referencia, referenciaInicial.referencia);
      assert.notEqual(atualizada.atualizado_em, '2000-01-01T00:00:00.000Z');
      this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: referenciaInicial.referencia, alteracoes }), 'CONFLITO');
      this.ok(await consultar(recepcao, 'criar', { aluno_id: aluno.id, plano_id: plano.id,
        data_inicio: '2026-07-01', data_fim: '2026-07-31', valor_contratado_centavos: 9000 }));
      this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: atualizada.referencia,
        alteracoes: { ...alteracoes, data_inicio: '2026-07-15', data_fim: '2026-08-15' } }), 'CONFLITO');
      const antesConcorrencia = this.ok(await consultar(recepcao, 'obter', { id: matriculaEdicao.id })) as typeof atualizada;
      const concorrentesEdicao = await Promise.all([
        consultar(admin, 'atualizar', { id: matriculaEdicao.id, referencia: antesConcorrencia.referencia, alteracoes: { ...alteracoes, valor_contratado_centavos: 13000 } }),
        consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: antesConcorrencia.referencia, alteracoes: { ...alteracoes, valor_contratado_centavos: 14000 } })
      ]);
      assert.equal(concorrentesEdicao.filter(r => r.sucesso).length, 1);
      assert.equal(concorrentesEdicao.filter(r => !r.sucesso && r.erro.codigo === 'CONFLITO').length, 1);
      const antesRollback = this.ok(await consultar(recepcao, 'obter', { id: matriculaEdicao.id })) as typeof atualizada;
      const linhaAntesRollback = banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(matriculaEdicao.id);
      banco.preparar<[], never>(`CREATE TRIGGER falha_edicao_matricula BEFORE UPDATE OF valor_contratado_centavos ON matriculas
        WHEN NEW.id=${matriculaEdicao.id} BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;`).run();
      this.falha(await consultar(recepcao, 'atualizar', { id: matriculaEdicao.id, referencia: antesRollback.referencia,
        alteracoes: { ...alteracoes, valor_contratado_centavos: 15000 } }), 'INTERNO');
      assert.deepEqual(banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(matriculaEdicao.id), linhaAntesRollback);
      banco.preparar<[], never>('DROP TRIGGER falha_edicao_matricula').run();
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
      await this.aguardar(recepcao, "document.querySelector('#editar-matricula') !== null");
      await recepcao.webContents.executeJavaScript("document.querySelector('#editar-matricula').click(); const fe=document.querySelector('#form-editar-matricula'); fe.elements.valor.value='30,75'; fe.requestSubmit()");
      await this.aguardar(recepcao, "document.querySelector('#mensagem-matriculas').textContent.includes('atualizada')");
      assert.equal(banco.preparar<[], { total: number }>("SELECT COUNT(*) AS total FROM matriculas WHERE data_inicio='2026-05-01' AND valor_contratado_centavos=3075").get()?.total, 1);
      banco.preparar<[], never>("INSERT INTO pagamentos (matricula_id,competencia,data_vencimento,valor_centavos,situacao,criado_em,atualizado_em) VALUES (2,'2026-01','2026-01-31',9990,'pendente','UTC','UTC')").run();
      banco.preparar<[], never>("INSERT INTO notificacoes (matricula_id,tipo,canal,chave_deduplicacao,agendada_para,situacao,tentativas,criado_em,atualizado_em) VALUES (2,'vencimento_plano','teste','matricula-2','UTC','pendente',0,'UTC','UTC')").run();
      const antes = banco.preparar<[], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=2').get();
      const pagamentos = banco.preparar<[], unknown>('SELECT * FROM pagamentos').all(), notificacoes = banco.preparar<[], unknown>('SELECT * FROM notificacoes').all();
      await recepcao.webContents.executeJavaScript("document.querySelector('#filtros-matriculas [name=plano_id]').value=''; document.querySelector('#filtros-matriculas [name=situacao]').value=''; document.querySelector('#filtros-matriculas').requestSubmit()");
      await this.aguardar(recepcao, "document.querySelector('#matriculas tr[data-id=\"2\"]') !== null");
      await recepcao.webContents.executeJavaScript("document.querySelector('#matriculas tr[data-id=\"2\"] button').click()");
      await this.aguardar(recepcao, "document.querySelector('#cancelar-matricula') !== null");
      await recepcao.webContents.executeJavaScript("document.querySelector('#cancelar-matricula').click()");
      assert.equal(banco.preparar<[], { situacao: string }>('SELECT situacao FROM matriculas WHERE id=2').get()?.situacao, 'ativa');
      await recepcao.webContents.executeJavaScript("document.querySelector('#confirmar-situacao-matricula').click()");
      await this.aguardar(recepcao, "document.querySelector('#mensagem-matriculas').textContent.includes('cancelada')");
      assert.deepEqual(banco.preparar<[], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=2').get(), { ...antes, situacao: 'cancelada' });
      assert.deepEqual(banco.preparar<[], unknown>('SELECT * FROM pagamentos').all(), pagamentos);
      assert.deepEqual(banco.preparar<[], unknown>('SELECT * FROM notificacoes').all(), notificacoes);
      for (const metodo of ['cancelar','encerrar']) this.falha(await consultar(admin, metodo, { id: 2 }), 'CONFLITO');
      const inserirPrazo = banco.preparar<[string], never>("INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em) VALUES (1,1,'2000-01-01',date('now','localtime',?),0,'ativa','UTC','UTC')");
      const futura = Number(inserirPrazo.run('+1 day').lastInsertRowid), hoje = Number(inserirPrazo.run('+0 days').lastInsertRowid), ontem = Number(inserirPrazo.run('-1 day').lastInsertRowid);
      for (const id of [futura, hoje]) this.falha(await consultar(admin, 'encerrar', { id }), 'VALIDACAO');
      banco.preparar<[number], never>("INSERT INTO pagamentos (matricula_id,competencia,data_vencimento,valor_centavos,situacao,criado_em,atualizado_em) VALUES (?,'2026-01','2026-01-31',0,'pendente','UTC','UTC')").run(ontem);
      banco.preparar<[number], never>("INSERT INTO notificacoes (matricula_id,tipo,canal,chave_deduplicacao,agendada_para,situacao,tentativas,criado_em,atualizado_em) VALUES (?,'vencimento_plano','teste','encerrar-teste','UTC','pendente',0,'UTC','UTC')").run(ontem);
      const pagamentoEncerramento = banco.preparar<[number], unknown>('SELECT * FROM pagamentos WHERE matricula_id=?').all(ontem);
      const notificacaoEncerramento = banco.preparar<[number], unknown>('SELECT * FROM notificacoes WHERE matricula_id=?').all(ontem);
      const concluida = this.ok(await consultar(recepcao, 'encerrar', { id: ontem })) as { situacao: string };
      assert.equal(concluida.situacao, 'encerrada');
      assert.deepEqual(banco.preparar<[number], unknown>('SELECT * FROM pagamentos WHERE matricula_id=?').all(ontem), pagamentoEncerramento);
      assert.deepEqual(banco.preparar<[number], unknown>('SELECT * FROM notificacoes WHERE matricula_id=?').all(ontem), notificacaoEncerramento);
      for (const metodo of ['cancelar','encerrar']) {
        this.falha(await consultar(admin, metodo, { id: ontem }), 'CONFLITO');
        this.falha(await consultar(instrutor, metodo, { id: futura }), 'SEM_PERMISSAO');
        this.falha(await consultar(anonimo, metodo, { id: futura }), 'NAO_AUTENTICADO');
      }
      const pelaTela = Number(inserirPrazo.run('-1 day').lastInsertRowid);
      banco.preparar<[number, number], never>('UPDATE matriculas SET plano_id=? WHERE id=?').run(inativo.id, pelaTela);
      const antesEncerrar = banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(pelaTela);
      await recepcao.webContents.executeJavaScript(`document.querySelector('#filtros-matriculas [name=plano_id]').value=${JSON.stringify(String(inativo.id))}; document.querySelector('#filtros-matriculas').requestSubmit()`);
      await this.aguardar(recepcao, `document.querySelector('#matriculas tr[data-id="${pelaTela}"]') !== null`);
      await recepcao.webContents.executeJavaScript(`document.querySelector('#matriculas tr[data-id="${pelaTela}"] button').click()`);
      await this.aguardar(recepcao, "document.querySelector('#encerrar-matricula') !== null");
      await recepcao.webContents.executeJavaScript("document.querySelector('#encerrar-matricula').click()");
      assert.equal(banco.preparar<[number], { situacao: string }>('SELECT situacao FROM matriculas WHERE id=?').get(pelaTela)?.situacao, 'ativa');
      await recepcao.webContents.executeJavaScript("document.querySelector('#confirmar-situacao-matricula').click()");
      await this.aguardar(recepcao, "document.querySelector('#mensagem-matriculas').textContent.includes('encerrada')");
      assert.deepEqual(banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(pelaTela), { ...antesEncerrar, situacao: 'encerrada' });
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#encerrar-matricula')"), null);
      assert.equal(await recepcao.webContents.executeJavaScript("document.querySelector('#excluir-matricula')"), null);
      const pagamentoSomente = Number(inserirPrazo.run('-1 day').lastInsertRowid), notificacaoSomente = Number(inserirPrazo.run('-1 day').lastInsertRowid), semVinculos = Number(inserirPrazo.run('-1 day').lastInsertRowid);
      banco.preparar<[number], never>("INSERT INTO pagamentos (matricula_id,competencia,data_vencimento,valor_centavos,situacao,criado_em,atualizado_em) VALUES (?,'2026-01','2026-01-31',0,'pendente','UTC','UTC')").run(pagamentoSomente);
      banco.preparar<[number], never>("INSERT INTO notificacoes (matricula_id,tipo,canal,chave_deduplicacao,agendada_para,situacao,tentativas,criado_em,atualizado_em) VALUES (?,'vencimento_plano','teste','apenas-notificacao','UTC','pendente',0,'UTC','UTC')").run(notificacaoSomente);
      for (const id of [pagamentoSomente, notificacaoSomente]) {
        const m = this.ok(await consultar(admin, 'obter', { id })) as { referencia: string; aluno_id: number; plano_id: number; data_inicio: string; data_fim: string; valor_contratado_centavos: number };
        const estadoAntes = banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(id);
        this.falha(await consultar(admin, 'atualizar', { id, referencia: m.referencia, alteracoes: {
          aluno_id: m.aluno_id, plano_id: m.plano_id, data_inicio: m.data_inicio, data_fim: m.data_fim,
          valor_contratado_centavos: m.valor_contratado_centavos + 1
        } }), 'CONFLITO');
        assert.deepEqual(banco.preparar<[number], Record<string, unknown>>('SELECT * FROM matriculas WHERE id=?').get(id), estadoAntes);
        const bloqueio = await consultar(admin, 'excluir', { id, referencia: m.referencia });
        this.falha(bloqueio, 'CONFLITO');
        assert.ok(!bloqueio.sucesso && JSON.stringify(bloqueio.erro.campos).includes('pagamentos ou notificações'));
        assert.ok(banco.preparar<[number], unknown>('SELECT id FROM matriculas WHERE id=?').get(id));
      }
      const m = this.ok(await consultar(admin, 'obter', { id: semVinculos })) as { referencia: string };
      this.falha(await consultar(recepcao, 'excluir', { id: semVinculos, referencia: m.referencia }), 'SEM_PERMISSAO');
      this.falha(await consultar(instrutor, 'excluir', { id: semVinculos, referencia: m.referencia }), 'SEM_PERMISSAO');
      this.falha(await consultar(anonimo, 'excluir', { id: semVinculos, referencia: m.referencia }), 'NAO_AUTENTICADO');
      this.ok(await consultar(admin, 'cancelar', { id: semVinculos }));
      this.falha(await consultar(admin, 'excluir', { id: semVinculos, referencia: m.referencia }), 'CONFLITO');
      const novoAlvo = this.ok(await consultar(admin, 'obter', { id: semVinculos })) as { referencia: string };
      this.ok(await consultar(admin, 'excluir', { id: semVinculos, referencia: novoAlvo.referencia }));
      assert.equal(banco.preparar<[number], unknown>('SELECT id FROM matriculas WHERE id=?').get(semVinculos), undefined);
      const telaExcluir = Number(inserirPrazo.run('-1 day').lastInsertRowid);
      banco.preparar<[number, number], never>('UPDATE matriculas SET plano_id=? WHERE id=?').run(inativo.id, telaExcluir);
      await admin.webContents.executeJavaScript(`document.querySelector('#form-login [name=email]').value='admin@example.invalid'; document.querySelector('#form-login [name=senha]').value=${JSON.stringify(this.senha)}; document.querySelector('#form-login').requestSubmit()`);
      await this.aguardar(admin, "document.querySelector('#abrir-matriculas') !== null");
      await admin.webContents.executeJavaScript("document.querySelector('#abrir-matriculas').click()");
      await this.aguardar(admin, "document.querySelector('#matriculas tbody tr') !== null");
      await admin.webContents.executeJavaScript(`document.querySelector('#filtros-matriculas [name=plano_id]').value=${JSON.stringify(String(inativo.id))}; document.querySelector('#filtros-matriculas').requestSubmit()`);
      await this.aguardar(admin, `document.querySelector('#matriculas tr[data-id="${telaExcluir}"]') !== null`);
      await admin.webContents.executeJavaScript(`document.querySelector('#matriculas tr[data-id="${telaExcluir}"] button').click()`);
      await this.aguardar(admin, "document.querySelector('#excluir-matricula') !== null");
      await admin.webContents.executeJavaScript("document.querySelector('#excluir-matricula').click()");
      assert.ok(banco.preparar<[number], unknown>('SELECT id FROM matriculas WHERE id=?').get(telaExcluir));
      await admin.webContents.executeJavaScript("document.querySelector('#confirmar-exclusao-matricula').click()");
      await this.aguardar(admin, "document.querySelector('#mensagem-matriculas').textContent.includes('excluída')");
      assert.equal(banco.preparar<[number], unknown>('SELECT id FROM matriculas WHERE id=?').get(telaExcluir), undefined);
      assert.throws(() => banco!.preparar<[number], never>('DELETE FROM matriculas WHERE id=?').run(pagamentoSomente));
      assert.throws(() => banco!.preparar<[number], never>('DELETE FROM matriculas WHERE id=?').run(notificacaoSomente));
      banco.preparar<[number, number], never>('UPDATE matriculas SET plano_id=? WHERE id=?').run(inativo.id, notificacaoSomente);
      await admin.webContents.executeJavaScript("document.querySelector('#filtros-matriculas').requestSubmit()");
      await this.aguardar(admin, `document.querySelector('#matriculas tr[data-id="${notificacaoSomente}"]') !== null`);
      await admin.webContents.executeJavaScript(`document.querySelector('#matriculas tr[data-id="${notificacaoSomente}"] button').click()`);
      await this.aguardar(admin, "document.querySelector('#excluir-matricula') !== null");
      await admin.webContents.executeJavaScript("document.querySelector('#excluir-matricula').click(); document.querySelector('#confirmar-exclusao-matricula').click()");
      await this.aguardar(admin, "document.querySelector('#mensagem-matriculas').textContent.includes('pagamentos ou notificações')");
      assert.ok(banco.preparar<[number], unknown>('SELECT id FROM matriculas WHERE id=?').get(notificacaoSomente));
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
