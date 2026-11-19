import { DataAcademia } from '../src/services/DataAcademia';
import type { PagamentoDto } from '../src/shared/tipos/Pagamento';
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

class VerificarPagamentos {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica de pagamentos';
  public async executar(): Promise<void> {
    process.env.MENSAGENS_MODO = 'simulado';
    process.env.MENSAGENS_AUTOMATICAS = 'false';
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-pagamentos-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, codigo = 0;
    const limite = setTimeout(() => app.exit(1), 60000); app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const hash = await new HashSenhaArgon2().gerar(this.senha), usuarios = new UsuarioRepository(banco);
      for (const perfil of ['admin', 'recepcao', 'instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const alunos = new AlunoRepository(banco), planos = new PlanoRepository(banco);
      const aluno = alunos.create({ nome: 'Aluno sintético', cpf: '52998224725', data_nascimento: '2000-01-01', email: null, telefone: null, cep: '01001000', logradouro: 'Rua', numero: '1', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1, telegram_chat_id: null, autorizado_notificar_em: null });
      const plano = planos.create({ nome: '<Plano sintético>', duracao_meses: 1, valor_centavos: 9990, ativo: 1 });
      banco.preparar<[number, number], never>(`INSERT INTO matriculas
        (aluno_id, plano_id, data_inicio, data_fim, valor_contratado_centavos, situacao, criado_em, atualizado_em)
        VALUES (?, ?, '2026-01-01','2026-03-31',10000,'ativa','UTC','UTC')`).run(aluno.id, plano.id);
      const recepcao = await this.abrir(composicao), instrutor = await this.abrir(composicao);
      const entrar = async (janela: BrowserWindow, perfil: string) => {
        this.ok(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({
          email: perfil + '@example.invalid', senha: this.senha })})`));
      };
      const chamar = (janela: BrowserWindow, metodo: 'criar' | 'quitar' | 'listar' | 'obter', dados: unknown): Promise<Resultado<PagamentoDto>> =>
        janela.webContents.executeJavaScript(`window.academia.pagamentos.${metodo}(${JSON.stringify(dados)})`);
      await entrar(instrutor, 'instrutor');
      const novo = { matricula_id: 1, competencia: '2026-02', data_vencimento: '2026-02-28', valor_centavos: 10000 };
      for (const metodo of ['listar','obter','criar','quitar'] as const) {
        this.falha(await chamar(instrutor, metodo, novo), 'SEM_PERMISSAO');
        this.falha(await chamar(recepcao, metodo, novo), 'NAO_AUTENTICADO');
      }
      const relatorio = (j: BrowserWindow, entrada: unknown): Promise<Resultado<unknown>> =>
        j.webContents.executeJavaScript(`window.academia.pagamentos.inadimplentes(${JSON.stringify(entrada)})`);
      this.falha(await relatorio(instrutor, { ordem: 'valor' }), 'SEM_PERMISSAO');
      this.falha(await relatorio(recepcao, { ordem: 'atraso' }), 'NAO_AUTENTICADO');
      const verificarAvisos = (j: BrowserWindow): Promise<Resultado<unknown>> =>
        j.webContents.executeJavaScript('window.academia.avisos.verificar(undefined)');
      this.falha(await verificarAvisos(recepcao), 'NAO_AUTENTICADO');
      this.falha(await verificarAvisos(instrutor), 'SEM_PERMISSAO');
      const configurar = (j: BrowserWindow, dados: unknown): Promise<Resultado<unknown>> =>
        j.webContents.executeJavaScript(`window.academia.avisos.configurar(${JSON.stringify(dados)})`);
      const vinculo = { id: 1, chat: '123', autorizar: true };
      this.falha(await configurar(instrutor,vinculo), 'SEM_PERMISSAO');
      this.falha(await configurar(recepcao,vinculo), 'NAO_AUTENTICADO');
      await entrar(recepcao, 'recepcao');
      this.falha(await configurar(recepcao,{ ...vinculo, chat: '-100123' }), 'VALIDACAO');
      this.falha(await configurar(recepcao,{ ...vinculo, chat: null }), 'VALIDACAO');
      this.ok(await relatorio(recepcao, { ordem: 'valor' }));
      for (const filtro of [{ inicio: '2026-02-30' }, { inicio: '2026-04-01', fim: '2026-03-01' },
        { ordem: 'sql' }, { data_referencia: '2000-01-01' }]) {
        this.falha(await relatorio(recepcao, { ordem: 'atraso', ...filtro }), 'VALIDACAO');
      }
      for (const invalido of [{valor_centavos: 0}, {valor_centavos: -100}, {valor_centavos: 0.5},
        {matricula_id: 999}, {competencia: '2026-13'}, {data_vencimento: '2026-02-29'}]) {
        this.falha(await chamar(recepcao, 'criar', { ...novo, ...invalido }), 'VALIDACAO');
      }
      const criacoes = await Promise.all([chamar(recepcao, 'criar', novo), chamar(recepcao, 'criar', novo)]);
      assert.equal(criacoes.filter(r => r.sucesso).length, 1);
      this.falha(criacoes.find(r => !r.sucesso)!, 'CONFLITO');
      const item = this.ok(criacoes.find(r => r.sucesso)!);
      assert.equal(item.situacao, 'pendente');
      assert.equal(item.pago_em, null);
      const baixa = { id: item.id, data: '2026-02-28', forma_pagamento: 'pix' };
      this.falha(await chamar(recepcao, 'quitar', { ...baixa, forma_pagamento: 'outro' }), 'VALIDACAO');
      this.falha(await chamar(recepcao, 'quitar', { ...baixa, data: '2026-02-30' }), 'VALIDACAO');
      const baixas = await Promise.all([chamar(recepcao, 'quitar', baixa), chamar(recepcao, 'quitar', baixa)]);
      assert.equal(baixas.filter(r => r.sucesso).length, 1);
      this.falha(baixas.find(r => !r.sucesso)!, 'CONFLITO');
      banco.preparar<[number], never>('UPDATE planos SET valor_centavos=12345 WHERE id=?').run(plano.id);
      composicao.encerrar();
      banco.fechar();
      composicao.iniciar(arquivo);
      const janela = await this.abrir(composicao);
      await this.aguardar(janela, "document.querySelector('#form-login') !== null");
      await janela.webContents.executeJavaScript(`const f=document.querySelector('#form-login'); f.elements.email.value='admin@example.invalid';
        f.elements.senha.value=${JSON.stringify(this.senha)}; f.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#abrir-mensalidades') !== null");
      const pago = this.ok(await chamar(janela, 'obter', { id: item.id }));
      assert.equal(pago.valor_centavos, 10000);
      assert.equal(pago.forma_pagamento, 'pix');
      assert.equal(pago.pago_em?.slice(0,10), baixa.data);
      assert.equal(pago.situacao, 'pago');
      await janela.webContents.executeJavaScript("document.querySelector('#abrir-mensalidades').click()");
      await this.aguardar(janela, "document.querySelector('#mensalidades tbody')?.textContent.includes('R$ 100,00')");
      await janela.webContents.executeJavaScript("document.querySelector('#mensalidades tbody button').click()");
      await this.aguardar(janela, "document.querySelector('#detalhe-financeiro')?.textContent.includes('28/02/2026 por pix')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#recebimento') === null"), true);
      await janela.webContents.executeJavaScript(`document.querySelector('#mensalidades details').open=true;
        const novoForm=document.querySelector('#lancamento');
        novoForm.elements.matricula.value='1'; novoForm.elements.competencia.value='2026-03';
        novoForm.elements.vencimento.value='2026-03-31'; novoForm.elements.valor.value='100,00'; novoForm.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#mensalidades [role=status]').textContent.includes('lançada')");
      await janela.webContents.executeJavaScript(`const filtros=document.querySelector('#filtro-financeiro');
        filtros.elements.aluno.value='1'; filtros.elements.competencia.value='2026-03'; filtros.elements.situacao.value='pendente';
        filtros.requestSubmit()`);
      await this.aguardar(janela, "document.querySelectorAll('#mensalidades tbody tr').length === 1 && document.querySelector('#mensalidades tbody').textContent.includes('2026-03')");
      await janela.webContents.executeJavaScript("document.querySelector('#mensalidades tbody button').click()");
      await this.aguardar(janela, "document.querySelector('#recebimento button')?.textContent.includes('R$ 100,00')");
      await janela.webContents.executeJavaScript(`const recibo=document.querySelector('#recebimento');
        recibo.elements.data.value='2026-03-31'; recibo.elements.forma.value='dinheiro'; recibo.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#mensalidades [role=status]').textContent.includes('integral registrado')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#mensalidades tbody').textContent"), 'Nenhuma mensalidade encontrada.');
      assert.ok(await janela.webContents.executeJavaScript("document.querySelector('#detalhe-financeiro').textContent.includes('31/03/2026 por dinheiro')"));
      this.ok(await chamar(janela, 'criar', { ...novo, competencia: '2000-01', data_vencimento: '2000-01-31' }));
      this.ok(await chamar(janela, 'criar', { ...novo, competencia: '2000-02', data_vencimento: '2000-02-29', valor_centavos: 15000 }));
      await janela.webContents.executeJavaScript("document.querySelector('#abrir-inadimplencia').click()");
      await this.aguardar(janela, "document.querySelector('#inadimplencia .resultado')?.textContent.includes('R$ 250,00')");
      await janela.webContents.executeJavaScript(`const periodo=document.querySelector('#inadimplencia form');
        periodo.elements.inicio.value='2000-01-31'; periodo.elements.fim.value='2000-02-29'; periodo.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#inadimplencia summary')?.textContent.includes('Mensalidades: 2')");
      await janela.webContents.executeJavaScript(`document.querySelector('#inadimplencia details').open=true;
        document.querySelector('#inadimplencia tbody button').click()`);
      await this.aguardar(janela, "document.querySelector('#recebimento button')?.textContent.includes('R$ 100,00')");
      await janela.webContents.executeJavaScript(`const baixaUI=document.querySelector('#recebimento');
        baixaUI.elements.data.value='2000-03-01'; baixaUI.elements.forma.value='pix'; baixaUI.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#inadimplencia [role=status]')?.textContent.includes('registrado')");
      assert.ok(await janela.webContents.executeJavaScript("document.querySelector('#inadimplencia summary').textContent.includes('Mensalidades: 1 · R$ 150,00')"));
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#inadimplencia form').elements.inicio.value"), '2000-01-31');
      // Uma nova vigência, mesmo sem nova mensalidade, produz aviso pelo IPC.
      banco = new Conexao(arquivo);
      banco.preparar<[string], never>("UPDATE matriculas SET data_inicio='2000-01-01',data_fim=? WHERE id=1")
        .run(DataAcademia.civil(new Date()));
      await janela.webContents.executeJavaScript("document.querySelector('#abrir-avisos').click()");
      await this.aguardar(janela, "document.querySelector('#avisos fieldset')?.disabled === false");
      await janela.webContents.executeJavaScript("document.querySelector('#verificar-avisos').click()");
      await this.aguardar(janela, "document.querySelector('#avisos tbody')?.textContent.includes('No dia do término')");
      await janela.webContents.executeJavaScript("document.querySelector('#avisos tbody button').click()");
      await this.aguardar(janela, "document.querySelector('#avisos [role=status]')?.textContent.includes('marcado como lido')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('#avisos tbody .marcar-lido') === null"), true);
      assert.deepEqual(banco.preparar<[], unknown>("SELECT situacao,enviada_em,tentativas FROM notificacoes WHERE canal='interno' AND lido_em IS NOT NULL").all(),
        [{ situacao: 'pendente', enviada_em: null, tentativas: 0 }]);
      await janela.webContents.executeJavaScript(`const prefs=document.querySelector('#avisos details'); prefs.open=true;
        prefs.querySelector('[name=aluno]').value='1'; prefs.querySelector('form').requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#avisos [name=chat]') !== null");
      await janela.webContents.executeJavaScript(`const config=document.querySelector('#avisos [name=chat]').form;
        config.elements.chat.value='123'; config.querySelector('[type=checkbox][required]').checked=true;
        config.elements.consente.checked=true; config.requestSubmit()`);
      await this.aguardar(janela, "document.querySelector('#avisos details').textContent.includes('Recebimento autorizado')");
      await janela.webContents.executeJavaScript("document.querySelector('#avisos .abrir-entrega').click()");
      await this.aguardar(janela, "document.querySelector('.processar-entrega')?.textContent === 'Simular entrega'");
      await janela.webContents.executeJavaScript("document.querySelector('.processar-entrega').click()");
      await this.aguardar(janela, "document.querySelector('#avisos').textContent.includes('Estado: simulado')");
      assert.equal(await janela.webContents.executeJavaScript("document.querySelector('.processar-entrega') === null"),true);
      assert.deepEqual(banco.preparar<[],unknown>('SELECT estado,mensagem_id FROM entrega_tentativas').all(),
        [{estado:'simulado',mensagem_id:null}]);
      console.log('OK: lançamento, duplicidade, validação, perfis, quitação concorrente, histórico e R$ 100,00 após reabrir.');
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
void new VerificarPagamentos().executar().catch(erro => { console.error(erro); app.exit(1); });
