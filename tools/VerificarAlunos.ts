import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { Conexao } from '../src/database/Conexao';
import { Composicao } from '../src/main/Composicao';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { UsuarioRepository } from '../src/repositories/UsuarioRepository';
import { AlunoRepository } from '../src/repositories/AlunoRepository';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';
import { ValidacaoAluno } from '../src/services/ValidacaoAluno';
import { AlunoService } from '../src/services/AlunoService';
import { ErroAluno } from '../src/services/ErroAluno';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { ConsultaAutenticacaoRepository } from '../src/repositories/ConsultaAutenticacaoRepository';
import { Autorizador } from '../src/main/seguranca/Autorizador';
import { SessaoManager } from '../src/main/seguranca/SessaoManager';
import type { CanalAluno } from '../src/services/AlunoService';
import type { ContratoIpc, Resultado, NovoAluno, AlunoDto } from '../src/shared/ipc/ContratoIpc';

/** Exercita preload/IPC reais, sem mocks de banco e sem userData. */
class VerificarAlunos {
  private readonly janelas: BrowserWindow[] = [];
  private readonly senha = 'Senha sintetica apenas para testes';
  private readonly entrada: NovoAluno = { nome: ' Aluno Sintético ', cpf: '529.982.247-25', data_nascimento: '2000-02-29',
    email: ' ALUNO@EXAMPLE.INVALID ', telefone: '(11) 99999-0000', cep: '01001-000', logradouro: 'Praça de teste',
    numero: 's/n', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', ativo: 1 };

  public async executar(): Promise<void> {
    const pasta = mkdtempSync(path.join(tmpdir(), 'academia-alunos-')), arquivo = path.join(pasta, 'teste.sqlite3');
    const composicao = new Composicao(); let banco: Conexao | undefined; let resultado = 0;
    const limite = setTimeout(() => { console.error('Tempo limite: alunos.'); app.exit(1); }, 60000);
    app.on('window-all-closed', () => {});
    try {
      await app.whenReady(); composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const usuarios = new UsuarioRepository(banco), hash = await new HashSenhaArgon2().gerar(this.senha);
      for (const perfil of ['admin', 'recepcao', 'instrutor'] as const) usuarios.create({ nome: perfil, email: `${perfil}@example.invalid`, senha_hash: hash, perfil, ativo: 1 });
      const a = await this.abrir(composicao), r = await this.abrir(composicao), i = await this.abrir(composicao), semSessao = await this.abrir(composicao);
      for (const [janela, perfil] of [[a, 'admin'], [r, 'recepcao'], [i, 'instrutor']] as const) await this.login(janela, perfil);
      const repository = new AlunoRepository(banco);
      const criado = this.ok(await this.chamar(r, 'alunos:criar', this.entrada));
      assert.equal(criado.nome, 'Aluno Sintético'); assert.equal(criado.cpf, '52998224725');
      assert.equal(criado.email, 'aluno@example.invalid'); assert.equal(criado.cep, '01001000'); assert.equal(criado.telefone, '11999990000');
      assert.match(criado.referencia, /^[0-9a-f]{64}$/); assert.ok(!('telegram_chat_id' in criado));
      const obtido = this.ok(await this.chamar(a, 'alunos:obter', { id: criado.id })); assert.deepEqual(obtido, criado);
      const lista = this.ok(await this.chamar(a, 'alunos:listar', { pagina: 1, tamanho: 10 }));
      assert.deepEqual(lista.itens, [{ id: criado.id, nome: criado.nome, ativo: 1, cpf_mascarado: '***.***.247-**' }]);
      for (const busca of ['sintético', '52998224725', 'ALUNO@EXAMPLE', '11999990000']) assert.equal(this.ok(await this.chamar(a, 'alunos:listar', { pagina: 1, tamanho: 10, busca })).total, 1);
      assert.equal(this.ok(await this.chamar(a, 'alunos:listar', { pagina: 1, tamanho: 10, busca: "' OR 1=1 --" })).total, 0);
      assert.equal(this.ok(await this.chamar(a, 'alunos:listar', { pagina: 2, tamanho: 10 })).itens.length, 0);
      this.falha(await this.chamar(a, 'alunos:criar', this.entrada), 'CONFLITO');
      const alterado = this.ok(await this.chamar(r, 'alunos:atualizar', { id: criado.id, referencia: criado.referencia, alteracoes: { nome: 'Nome alterado', email: null, telefone: null, ativo: 0 } }));
      assert.equal(alterado.nome, 'Nome alterado'); assert.equal(alterado.email, null); assert.equal(alterado.cpf, criado.cpf);
      assert.equal(repository.findById(criado.id)?.ativo, 0);
      this.falha(await this.chamar(a, 'alunos:atualizar', { id: criado.id, referencia: criado.referencia, alteracoes: { nome: 'Formulário antigo' } }), 'CONFLITO');
      this.falha(await this.chamar(a, 'alunos:excluir', { id: criado.id, referencia: criado.referencia }), 'CONFLITO');
      // Campos do Vitor permanecem intocados por atualizações administrativas de alunos.
      banco.preparar<[number], never>("UPDATE alunos SET telegram_chat_id='teste-interno',autorizado_notificar_em='2026-01-01T00:00:00Z' WHERE id=?").run(criado.id);
      const comContato = this.administrativo(this.ok(await this.chamar(a, 'alunos:obter', { id: criado.id })));
      const reativado = this.ok(await this.chamar(a, 'alunos:atualizar', { id: criado.id, referencia: comContato.referencia, alteracoes: { ativo: 1 } }));
      assert.equal(repository.findById(criado.id)?.telegram_chat_id, 'teste-interno');
      assert.equal(repository.findById(criado.id)?.autorizado_notificar_em, '2026-01-01T00:00:00Z');
      const outro = this.ok(await this.chamar(a, 'alunos:criar', { ...this.entrada, cpf: '11144477735' }));
      this.falha(await this.chamar(a, 'alunos:atualizar', { id: criado.id, referencia: reativado.referencia, alteracoes: { cpf: outro.cpf } }), 'CONFLITO');
      assert.equal(repository.findById(criado.id)?.cpf, criado.cpf);
      const segundaPagina = this.ok(await this.chamar(a, 'alunos:listar', { pagina: 2, tamanho: 1 }));
      assert.equal(segundaPagina.total, 2); assert.deepEqual(segundaPagina.itens.map(aluno => aluno.id), [outro.id]);
      this.ok(await this.chamar(a, 'alunos:excluir', { id: outro.id, referencia: outro.referencia }));
      console.log('OK alunos: CRUD parcial, normalização, busca, paginação, CPF mascarado, duplicidade, conflito de edição e preservação de notificações.');

      const invalidas: unknown[] = [null, {}, { ...this.entrada, cpf: '11111111111' }, { ...this.entrada, cpf: '52998224724' },
        { ...this.entrada, cpf: '529a98224725' }, { ...this.entrada, data_nascimento: '2001-02-29' }, { ...this.entrada, data_nascimento: '2999-01-01' },
        { ...this.entrada, nome: ' ' }, { ...this.entrada, email: 'invalido' }, { ...this.entrada, telefone: '123' },
        { ...this.entrada, cep: '123' }, { ...this.entrada, uf: 'XX' }, { ...this.entrada, ativo: true },
        { ...this.entrada, numero: '' }, { ...this.entrada, id: 22 }, { ...this.entrada, criado_em: 'interno' },
        { ...this.entrada, telegram_chat_id: 'proibido' }];
      for (const entrada of invalidas) this.falha(await this.chamar(a, 'alunos:criar', entrada), 'VALIDACAO');
      for (const alteracoes of [{}, { nome: undefined }, { nome: 'Novo', telefone: undefined }, { cpf: '00000000000' }, { telegram_chat_id: 'x' }]) {
        this.falha(await this.chamar(a, 'alunos:atualizar', { id: criado.id, referencia: reativado.referencia, alteracoes }), 'VALIDACAO');
      }
      for (const entrada of [{ pagina: 0, tamanho: 10 }, { pagina: 1, tamanho: 101 }, { pagina: Number.MAX_SAFE_INTEGER, tamanho: 100 }]) this.falha(await this.chamar(a, 'alunos:listar', entrada), 'VALIDACAO');
      for (const id of [0, -1, 1.5, '1 OR 1=1']) this.falha(await this.chamar(a, 'alunos:obter', { id }), 'VALIDACAO');
      this.falha(await this.chamar(a, 'alunos:obter', { id: 9999 }), 'NAO_ENCONTRADO');
      this.falha(await this.chamar(a, 'alunos:excluir', { id: 9999, referencia: reativado.referencia }), 'NAO_ENCONTRADO');
      this.falha(await this.chamar(a, 'alunos:atualizar', { id: 9999, referencia: reativado.referencia, alteracoes: { nome: 'Ausente' } }), 'NAO_ENCONTRADO');
      let acessos = 0;
      const getter = Object.defineProperty({}, 'nome', { enumerable: true, get: () => { acessos++; return 'Inseguro'; } });
      assert.throws(() => ValidacaoAluno.objeto(getter), ErroAluno); assert.equal(acessos, 0);
      const ciclo: { alteracoes?: unknown } = {}; ciclo.alteracoes = ciclo;
      assert.throws(() => ValidacaoAluno.objeto(ciclo), ErroAluno);
      console.log('OK alunos: entradas inválidas, dígitos do CPF, calendário, futuro, campos internos, patch vazio/undefined, limites, getters e ciclos.');

      const canais: readonly CanalAluno[] = ['alunos:criar','alunos:listar','alunos:obter','alunos:atualizar','alunos:excluir'];
      for (const canal of canais) this.falha(await this.chamar(semSessao, canal, {}), 'NAO_AUTENTICADO');
      const naoVinculada = await new JanelaPrincipal().abrir(false); this.janelas.push(naoVinculada);
      for (const canal of canais) this.falha(await this.chamar(naoVinculada, canal, {}), 'SEM_PERMISSAO');
      for (const canal of ['alunos:criar','alunos:atualizar','alunos:excluir'] as const) this.falha(await this.chamar(i, canal, {}), 'SEM_PERMISSAO');
      this.falha(await this.chamar(r, 'alunos:excluir', { id: criado.id, referencia: reativado.referencia }), 'SEM_PERMISSAO');
      assert.equal(this.ok(await this.chamar(i, 'alunos:listar', { pagina: 1, tamanho: 10 })).total, 0);
      this.falha(await this.chamar(i, 'alunos:obter', { id: criado.id }), 'NAO_ENCONTRADO');
      banco.executarEstrutura(`INSERT INTO instrutores (usuario_id,nome,email,telefone,especialidade,ativo,criado_em,atualizado_em)
        VALUES (3,'Instrutor sintético','instrutor@example.invalid','0','teste',1,'UTC','UTC');
        INSERT INTO avaliacoes_fisicas (aluno_id,instrutor_id,realizada_em,peso_kg,altura_cm,cintura_cm,quadril_cm,braco_cm,coxa_cm,observacoes,criado_em,atualizado_em)
        VALUES (1,1,'2026-01-01T00:00:00Z',70,170,NULL,NULL,NULL,NULL,NULL,'UTC','UTC');`);
      const restrito = { id: criado.id, nome: reativado.nome, ativo: 1 };
      assert.deepEqual(this.ok(await this.chamar(i, 'alunos:listar', { pagina: 1, tamanho: 10 })).itens, [restrito]);
      assert.deepEqual(this.ok(await this.chamar(i, 'alunos:obter', { id: criado.id })), restrito);
      assert.equal(this.ok(await this.chamar(i, 'alunos:listar', { pagina: 1, tamanho: 10, busca: criado.cpf })).total, 0);
      this.falha(await this.chamar(a, 'alunos:excluir', { id: criado.id, referencia: reativado.referencia }), 'CONFLITO');
      assert.ok(repository.findById(criado.id));
      banco.executarEstrutura('DELETE FROM avaliacoes_fisicas;');
      banco.executarEstrutura(`INSERT INTO aulas (instrutor_id,modalidade,inicio_em,fim_em,capacidade,ao_ar_livre,local,latitude,longitude,situacao,criado_em,atualizado_em)
        VALUES(1,'funcional','2026-01-01T10:00:00Z','2026-01-01T11:00:00Z',10,0,'Sala',NULL,NULL,'agendada','UTC','UTC');
        INSERT INTO inscricoes_aula (aula_id,aluno_id,situacao,presenca,criado_em,atualizado_em) VALUES(1,1,'ativa','nao_registrada','UTC','UTC');`);
      assert.deepEqual(this.ok(await this.chamar(i, 'alunos:obter', { id: criado.id })), restrito);
      this.falha(await this.chamar(a, 'alunos:excluir', { id: criado.id, referencia: reativado.referencia }), 'CONFLITO');
      banco.executarEstrutura('DELETE FROM inscricoes_aula;');
      banco.executarEstrutura(`INSERT INTO planos (nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em) VALUES ('Fixture',1,0,1,'UTC','UTC');
        INSERT INTO matriculas (aluno_id,plano_id,data_inicio,data_fim,valor_contratado_centavos,situacao,criado_em,atualizado_em)
        VALUES (1,1,'2026-01-01','2026-01-31',0,'cancelada','UTC','UTC');`);
      this.falha(await this.chamar(a, 'alunos:excluir', { id: criado.id, referencia: reativado.referencia }), 'CONFLITO');
      assert.ok(repository.findById(criado.id)); banco.executarEstrutura('DELETE FROM matriculas;');
      assert.deepEqual(await a.webContents.executeJavaScript(`({metodos:Object.keys(window.academia.alunos),congelada:Object.isFrozen(window.academia.alunos),invoke:typeof window.academia.invoke})`),
        { metodos: ['criar','listar','obter','atualizar','excluir'], congelada: true, invoke: 'undefined' });
      this.falha(await a.webContents.executeJavaScript('window.academia.alunos.listar({pagina:1,tamanho:10,usuarioId:1})'), 'VALIDACAO');
      console.log('OK alunos: cinco canais autenticados, perfis, escopo por aulas/avaliações, ausência de dados sensíveis e três FKs RESTRICT.');

      await this.concorrencia(banco, usuarios, criado.id);
      const excluido = this.ok(await this.chamar(a, 'alunos:excluir', { id: criado.id, referencia: reativado.referencia }));
      assert.deepEqual(excluido, { id: criado.id, excluido: true }); assert.equal(repository.findById(criado.id), undefined);
      const persistente = this.ok(await this.chamar(a, 'alunos:criar', { ...this.entrada, email: null, telefone: null }));
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      composicao.encerrar(); banco.fechar(); banco = undefined;
      composicao.iniciar(arquivo); banco = new Conexao(arquivo);
      const reaberta = await this.abrir(composicao); await this.login(reaberta, 'admin');
      const aposReabrir = this.administrativo(this.ok(await this.chamar(reaberta, 'alunos:obter', { id: persistente.id })));
      assert.equal(aposReabrir.nome, persistente.nome); assert.equal(aposReabrir.cpf, persistente.cpf);
      this.falha(await this.chamar(reaberta, 'alunos:excluir', { id: persistente.id, referencia: persistente.referencia }), 'CONFLITO');
      assert.deepEqual(banco.preparar<[], unknown>('PRAGMA foreign_key_check').all(), []);
      assert.equal(banco.preparar<[], { integrity_check: string }>('PRAGMA integrity_check').get()?.integrity_check, 'ok');
      console.log('OK alunos: exclusão física, persistência após reabrir, referência renovada e integridade SQLite.');
    } catch (erro: unknown) { console.error(erro); resultado = 1; }
    finally {
      clearTimeout(limite); composicao.encerrar(); banco?.fechar();
      for (const janela of this.janelas) if (!janela.isDestroyed()) janela.destroy();
      assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
      for (const nome of readdirSync(pasta)) { assert.match(nome, /^teste\.sqlite3(?:-journal|-wal|-shm)?$/); unlinkSync(path.join(pasta, nome)); }
      rmdirSync(pasta);
    }
    app.exit(resultado);
  }

  private async concorrencia(banco: Conexao, usuarios: UsuarioRepository, alunoId: number): Promise<void> {
    const sessoes = new SessaoManager(), contexto = { webContentsId: 98765 }, dados = new ConsultaAutenticacaoRepository(banco);
    const identidade = usuarios.identidadeConta(1); assert.ok(identidade);
    sessoes.registrar(contexto); sessoes.estabelecer(contexto, 1, identidade, 1);
    const service = new AlunoService(new AlunoRepository(banco), new Autorizador(sessoes, dados), sessoes);
    const pendente = service.executar('alunos:criar', this.entrada, contexto, () => {});
    sessoes.encerrar(contexto);
    await assert.rejects(pendente, (erro: unknown) => erro instanceof ErroAutenticacao && erro.codigo === 'NAO_AUTENTICADO');
    sessoes.estabelecer(contexto, 1, identidade, 1);
    const perfil = service.executar('alunos:criar', this.entrada, contexto, () => {});
    usuarios.update(1, { perfil: 'instrutor' });
    await assert.rejects(perfil, (erro: unknown) => erro instanceof ErroAluno && erro.codigo === 'SEM_PERMISSAO');
    usuarios.update(1, { perfil: 'admin' });
    const original = this.administrativo(await service.executar('alunos:obter', { id: alunoId }, contexto, () => {}) as AlunoDto);
    banco.executarEstrutura("CREATE TRIGGER falha_aluno BEFORE UPDATE ON alunos BEGIN SELECT RAISE(ABORT,'falha interna sintética'); END;");
    try {
      await assert.rejects(service.executar('alunos:atualizar', { id: alunoId, referencia: original.referencia, alteracoes: { nome: 'Não persistir' } }, contexto, () => {}));
      assert.equal(new AlunoRepository(banco).findById(alunoId)?.nome, original.nome);
    } finally { banco.executarEstrutura('DROP TRIGGER falha_aluno;'); }
    console.log('OK alunos: logout e perda de perfil durante autorização impedem escrita; falha SQL faz rollback.');
  }

  private async abrir(composicao: Composicao): Promise<BrowserWindow> {
    const janela = await new JanelaPrincipal().abrir(false, (j, url) => composicao.vincularJanela(j, url)); this.janelas.push(janela); return janela;
  }
  private async login(janela: BrowserWindow, perfil: string): Promise<void> {
    this.ok(await janela.webContents.executeJavaScript(`window.academia.autenticacao.entrar(${JSON.stringify({ email: `${perfil}@example.invalid`, senha: this.senha })})`));
  }
  private async chamar<C extends CanalAluno>(janela: BrowserWindow, canal: C, entrada: unknown): Promise<Resultado<ContratoIpc[C]['saida']>> {
    // Literal JS preserva undefined, ao contrário de serialização JSON do objeto inteiro.
    const objeto = entrada !== null && typeof entrada === 'object' && 'alteracoes' in entrada
      ? `{...${JSON.stringify(entrada)},alteracoes:{${Object.entries(entrada.alteracoes as Record<string, unknown>).map(([k,v]) => `${JSON.stringify(k)}:${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(',')}}}`
      : JSON.stringify(entrada);
    return janela.webContents.executeJavaScript(`window.academia.alunos.${canal.slice(7)}(${objeto})`) as Promise<Resultado<ContratoIpc[C]['saida']>>;
  }
  private ok<T>(resultado: Resultado<T>): T { assert.equal(resultado.sucesso, true, JSON.stringify(resultado)); if (!resultado.sucesso) throw new Error('Operação recusada.'); return resultado.dados; }
  private falha(resultado: Resultado<unknown>, codigo: string): void {
    assert.equal(resultado.sucesso, false); if (resultado.sucesso) throw new Error('Esperada recusa.'); assert.equal(resultado.erro.codigo, codigo);
    assert.doesNotMatch(resultado.erro.mensagem, /SELECT |SQLITE|senha_hash|stack|teste-interno/);
  }
  private administrativo(aluno: ContratoIpc['alunos:obter']['saida']): AlunoDto { assert.ok('cpf' in aluno); return aluno; }
}
void new VerificarAlunos().executar().catch(erro => { console.error(erro); app.exit(1); });
