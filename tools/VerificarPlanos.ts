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
import { PlanoRepository } from '../src/repositories/PlanoRepository';
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { PlanoService } from '../src/services/PlanoService';
import { ValidacaoPlano } from '../src/services/ValidacaoPlano';
import { ErroPlano } from '../src/services/ErroPlano';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { ValorMonetario } from '../src/renderer/componentes/ValorMonetario';
import type { CanalPlano } from '../src/services/PlanoService';
import type { ContratoIpc, Resultado } from '../src/shared/ipc/ContratoIpc';

class VerificarPlanos {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Credencial sintetica de planos';

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(),'academia-planos-')), arquivo = path.join(pasta,'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined, resultado = 0;
    const limite = setTimeout(() => app.exit(1),60000); app.on('window-all-closed',() => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), repository = new PlanoRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin','recepcao','instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const a = await this.abrir(composicao), r = await this.abrir(composicao), i = await this.abrir(composicao), semSessao = await this.abrir(composicao);
      for (const [janela,perfil] of [[a,'admin'],[r,'recepcao'],[i,'instrutor']] as const) await this.login(janela,perfil);
      const criado = this.ok(await this.chamar(a,'planos:criar',{ nome: ' Mensal sintético ', duracao_meses: 1, valor_centavos: 9990, ativo: 1 }));
      assert.equal(criado.nome,'Mensal sintético'); assert.equal(repository.findById(criado.id)?.valor_centavos,9990);
      assert.deepEqual(this.ok(await this.chamar(r,'planos:obter',{ id: criado.id })),criado);
      const trimestre = this.ok(await this.chamar(a,'planos:criar',{ nome: 'Trimestral', duracao_meses: 3, valor_centavos: 0, ativo: 0 }));
      const anual = this.ok(await this.chamar(a,'planos:criar',{ nome: 'Anual', duracao_meses: 12, valor_centavos: 100001, ativo: 1 }));
      const pagina = this.ok(await this.chamar(r,'planos:listar',{ pagina: 2, tamanho: 1 }));
      assert.equal(pagina.total,3); assert.deepEqual(pagina.itens.map(plano => plano.id),[trimestre.id]);
      assert.equal(this.ok(await this.chamar(a,'planos:listar',{ pagina: 4, tamanho: 1 })).itens.length,0);
      assert.equal(this.ok(await this.chamar(a,'planos:listar',{ pagina: 1, tamanho: 10, busca: 'MENSAL' })).total,1);
      assert.equal(this.ok(await this.chamar(a,'planos:listar',{ pagina: 1, tamanho: 10, busca: "' OR 1=1 --" })).total,0);
      const editado = this.ok(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: criado.referencia, alteracoes: { nome: 'Mensal editado' } }));
      assert.equal(editado.duracao_meses,1); assert.equal(editado.valor_centavos,9990);
      this.falha(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: criado.referencia, alteracoes: { nome: 'Antigo' } }),'CONFLITO');
      this.falha(await this.chamar(a,'planos:excluir',{ id: criado.id, referencia: criado.referencia }),'CONFLITO');
      const duplicadoPermitido = this.ok(await this.chamar(a,'planos:criar',{ nome: 'Mensal editado', duracao_meses: 1, valor_centavos: 0, ativo: 1 }));
      this.ok(await this.chamar(a,'planos:excluir',{ id: duplicadoPermitido.id, referencia: duplicadoPermitido.referencia }));
      this.ok(await this.chamar(a,'planos:excluir',{ id: anual.id, referencia: anual.referencia }));
      assert.equal(repository.findById(anual.id),undefined);
      console.log('OK planos: criar, listar, obter, buscar, paginar, editar parcialmente, excluir, durações 1/3/12, valor zero e conflito entre versões.');

      const base = { nome: 'Teste', duracao_meses: 1, valor_centavos: 0, ativo: 1 };
      for (const entrada of [null, {}, { ...base, nome: ' ' }, { ...base, nome: 'x'.repeat(121) }, { ...base, duracao_meses: 2 },
        { ...base, duracao_meses: 0 }, { ...base, duracao_meses: '1' }, { ...base, valor_centavos: -1 },
        { ...base, valor_centavos: 1.2 }, { ...base, valor_centavos: '10' }, { ...base, valor_centavos: Number.MAX_SAFE_INTEGER + 1 },
        { ...base, ativo: true }, { ...base, id: 77 }, { ...base, descricao: 'Campo inexistente' }, { ...base, criado_em: 'interno' }]) this.falha(await this.chamar(a,'planos:criar',entrada),'VALIDACAO');
      for (const valor_centavos of [NaN,Infinity,-Infinity]) assert.equal(ValidacaoPlano.criar.safeParse({ ...base, valor_centavos }).success,false);
      for (const alteracoes of [{}, { nome: undefined }, { nome: 'Novo', valor_centavos: undefined }, { duracao_meses: 4 }, { valor_centavos: -1 }, { id: 3 }]) {
        this.falha(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: editado.referencia, alteracoes }),'VALIDACAO');
      }
      for (const id of [0,-1,1.5,'1 OR 1=1']) this.falha(await this.chamar(a,'planos:obter',{ id }),'VALIDACAO');
      for (const entrada of [{ pagina: 0, tamanho: 10 }, { pagina: 1, tamanho: 101 }, { pagina: Number.MAX_SAFE_INTEGER, tamanho: 100 }]) this.falha(await this.chamar(a,'planos:listar',entrada),'VALIDACAO');
      for (const canal of ['planos:obter','planos:atualizar','planos:excluir'] as const) this.falha(await this.chamar(a,canal,{ id: 9999,
        ...(canal === 'planos:obter' ? {} : { referencia: editado.referencia }), ...(canal === 'planos:atualizar' ? { alteracoes: { nome: 'Ausente' } } : {}) }),'NAO_ENCONTRADO');
      let acessos = 0; const getter = Object.defineProperty({},'nome',{ enumerable: true, get: () => { acessos++; return 'Inválido'; } });
      assert.throws(() => ValidacaoPlano.objeto(getter),ErroPlano); assert.equal(acessos,0);
      const ciclo: { alteracoes?: unknown } = {}; ciclo.alteracoes = ciclo; assert.throws(() => ValidacaoPlano.objeto(ciclo),ErroPlano);
      for (const [entrada,esperado] of [['0',0],['0,29',29],['99.90',9990],['1,2',120],['90071992547409,91',Number.MAX_SAFE_INTEGER]] as const) assert.equal(ValorMonetario.paraCentavos(entrada),esperado);
      for (const entrada of ['-1','1,234','1.000,00','1e2','NaN','','90071992547409,92']) assert.equal(ValorMonetario.paraCentavos(entrada),undefined);
      assert.equal(ValorMonetario.paraEntrada(Number.MAX_SAFE_INTEGER),'90071992547409,91');
      console.log('OK planos: nome, duração, centavos inteiros/limites, campos internos, patch vazio/undefined, paginação, IDs, getters/ciclos e conversão decimal sem arredondamento.');

      const canais: readonly CanalPlano[] = ['planos:criar','planos:listar','planos:obter','planos:atualizar','planos:excluir'];
      const naoVinculada = await new JanelaPrincipal().abrir(false); this.janelas.push(naoVinculada);
      for (const canal of canais) {
        this.falha(await this.chamar(semSessao,canal,{}),'NAO_AUTENTICADO');
        this.falha(await this.chamar(i,canal,{}),'SEM_PERMISSAO');
        this.falha(await this.chamar(naoVinculada,canal,{}),'SEM_PERMISSAO');
      }
      for (const canal of ['planos:criar','planos:atualizar','planos:excluir'] as const) this.falha(await this.chamar(r,canal,{}),'SEM_PERMISSAO');
      assert.deepEqual(await a.webContents.executeJavaScript(`({metodos:Object.keys(window.academia.planos),congelada:Object.isFrozen(window.academia.planos),invoke:typeof window.academia.invoke})`),
        { metodos: ['criar','listar','obter','atualizar','excluir'], congelada: true, invoke: 'undefined' });
      console.log('OK planos: cinco canais protegidos por origem/sessão/perfil; recepção somente leitura e instrutor sem acesso.');

      new AlunoRepository(banco).create({ nome: 'Aluno sintético', cpf: '52998224725', data_nascimento: '2000-01-01', email: null, telefone: null,
        cep: '01001000', logradouro: 'Rua', numero: '1', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1, telegram_chat_id: null, autorizado_notificar_em: null });
      banco.preparar<[number],never>(`INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
        VALUES (1,?,'2026-01-01','2026-01-31',9990,'ativa','UTC','UTC')`).run(criado.id);
      banco.executarEstrutura(`INSERT INTO pagamentos (matricula_id,competencia,data_vencimento,valor_centavos,pago_em,forma_pagamento,situacao,criado_em,atualizado_em)
        VALUES (1,'2026-01','2026-01-10',9990,NULL,NULL,'pendente','UTC','UTC');`);
      const matriculaAntes = banco.preparar<[],unknown>('SELECT * FROM matriculas').all(), pagamentoAntes = banco.preparar<[],unknown>('SELECT * FROM pagamentos').all();
      let vinculado = this.ok(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: editado.referencia,
        alteracoes: { nome: 'Plano alterado com vínculo', duracao_meses: 12, valor_centavos: 15000, ativo: 0 } }));
      assert.equal(vinculado.ativo,0);
      assert.deepEqual(banco.preparar<[],unknown>('SELECT * FROM matriculas').all(),matriculaAntes);
      assert.deepEqual(banco.preparar<[],unknown>('SELECT * FROM pagamentos').all(),pagamentoAntes);
      for (const situacao of ['ativa','cancelada','encerrada']) {
        banco.preparar<[string],never>('UPDATE matriculas SET situacao=?').run(situacao);
        this.falha(await this.chamar(a,'planos:excluir',{ id: criado.id, referencia: vinculado.referencia }),'CONFLITO'); assert.ok(repository.findById(criado.id));
      }
      vinculado = this.ok(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: vinculado.referencia, alteracoes: { ativo: 1 } }));
      assert.equal(vinculado.ativo,1);
      banco.executarEstrutura("CREATE TRIGGER falha_plano BEFORE UPDATE ON planos BEGIN SELECT RAISE(ABORT,'DETALHE_INTERNO'); END;");
      this.falha(await this.chamar(a,'planos:atualizar',{ id: criado.id, referencia: vinculado.referencia, alteracoes: { nome: 'Não salvar' } }),'CONFLITO');
      assert.equal(repository.findById(criado.id)?.nome,vinculado.nome); banco.executarEstrutura('DROP TRIGGER falha_plano;');
      await this.concorrencia(banco,usuarios);
      console.log('OK planos: desativação/reativação com vínculo, FK RESTRICT em três situações, preço/data contratados e pagamentos intactos; rollback de falha real.');

      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy(); composicao.encerrar(); banco.fechar(); banco = undefined;
      composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const reaberta = await this.abrir(composicao); await this.login(reaberta,'admin');
      const persistido = this.ok(await this.chamar(reaberta,'planos:obter',{ id: criado.id })); assert.equal(persistido.nome,vinculado.nome); assert.equal(persistido.valor_centavos,15000);
      this.falha(await this.chamar(reaberta,'planos:excluir',{ id: criado.id, referencia: vinculado.referencia }),'CONFLITO');
      assert.deepEqual(banco.preparar<[],unknown>('PRAGMA foreign_key_check').all(),[]);
      assert.equal(banco.preparar<[],{ integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check,'ok');
      console.log('OK planos: persistência após reabertura, referência renovada e integridade do SQLite.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar(); for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta),path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome,/^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta,nome)); } rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async concorrencia(banco: Conexao,usuarios: UsuarioRepository): Promise<void> {
    const sessoes = new SessaoManager(), contexto = { webContentsId: 98765 }, identidade = usuarios.identidadeConta(1); assert.ok(identidade);
    sessoes.registrar(contexto); sessoes.estabelecer(contexto,1,identidade,1);
    const service = new PlanoService(new PlanoRepository(banco),new Autorizador(sessoes,new ConsultaAutenticacaoRepository(banco)),sessoes);
    const entrada = { nome: 'Não criar', duracao_meses: 1, valor_centavos: 0, ativo: 1 };
    const logout = service.executar('planos:criar',entrada,contexto,() => {}); sessoes.encerrar(contexto);
    await assert.rejects(logout,(erro: unknown) => erro instanceof ErroAutenticacao && erro.codigo === 'NAO_AUTENTICADO');
    sessoes.estabelecer(contexto,1,identidade,1);
    const perfil = service.executar('planos:criar',entrada,contexto,() => {}); usuarios.update(1,{ perfil: 'recepcao' });
    await assert.rejects(perfil,(erro: unknown) => erro instanceof ErroPlano && erro.codigo === 'SEM_PERMISSAO'); usuarios.update(1,{ perfil: 'admin' });
    assert.equal(banco.preparar<[],{ total: number }>("SELECT COUNT(*) AS total FROM planos WHERE nome='Não criar'").get()?.total,0);
    console.log('OK planos: logout e perda de privilégio durante autorização impedem escrita.');
  }
  private async abrir(composicao: Composicao): Promise<BrowserWindow> { const janela = await new JanelaPrincipal().abrir(false,(j,url) => composicao.vincularJanela(j,url)); this.janelas.push(janela); return janela; }
  private async login(janela: BrowserWindow,perfil: string): Promise<void> { this.ok(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: `${perfil}@example.invalid`, senha: this.senha })})`)); }
  private async chamar<C extends CanalPlano>(janela: BrowserWindow,canal: C,entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string,unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}` : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.planos.${canal.slice(7)}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso,true,JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>,codigo: string): void { assert.equal(resultado.sucesso,false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo,codigo); assert.doesNotMatch(resultado.erro.mensagem,/SELECT |SQLITE|DETALHE_INTERNO|stack/); }
}
void new VerificarPlanos().executar().catch(erro => { console.error(erro); app.exit(1); });
