import assert from 'node:assert/strict';
import { ConfiguracaoRepository } from '../src/repositories/ConfiguracaoRepository';
import { ErroRepository } from '../src/repositories/ErroRepository';
import type { CodigoErroRepository } from '../src/repositories/ErroRepository';
import type { DefinicaoRepository, RegistroPersistido } from '../src/repositories/TiposRepository';

interface RegistroTeste extends RegistroPersistido {
  nome: string;
  observacao: string | null;
  quantidade: number;
}
type Atualizaveis = 'nome' | 'observacao';
type DefinicaoTeste = DefinicaoRepository<RegistroTeste, Atualizaveis>;

class VerificarContratosRepository {
  private casosInvalidos: number = 0;

  public executar(): void {
    this.verificarConfiguracaoValida();
    this.verificarConfiguracoesInvalidas();
    this.verificarAcessoresEColecoes();
    this.verificarImutabilidade();
    this.verificarErros();
    console.log('OK: ' + this.casosInvalidos + ' configurações inválidas rejeitadas; mapas completos, flags, acessores, coleções, cópia imutável e códigos de erro. Nenhum banco aberto.');
  }

  private definicaoValida(): DefinicaoTeste {
    return {
      tabela: 'registros_teste',
      colunas: {
        id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
        nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        observacao: { tipo: 'TEXT', anulavel: true, atualizavel: true },
        quantidade: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
        criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
        atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
      }
    };
  }

  private verificarConfiguracaoValida(): void {
    const definicao = this.definicaoValida();
    const configuracao = new ConfiguracaoRepository<RegistroTeste, Atualizaveis>(definicao);
    assert.equal(configuracao.tabela, definicao.tabela);
    assert.deepEqual(configuracao.colunas, Object.keys(definicao.colunas));
    assert.deepEqual(configuracao.colunasCriacao, ['nome', 'observacao', 'quantidade']);
    assert.deepEqual(configuracao.colunasAtualizacao, ['nome', 'observacao']);
    assert.deepEqual(configuracao.colunasAnulaveis, ['observacao']);
    assert.equal(configuracao.metadados['quantidade']?.atualizavel, false);
    assert.equal(configuracao.metadados['observacao']?.anulavel, true);
    assert.equal(configuracao.metadados['nome']?.anulavel, false);
    // Sem lista de leitura independente, todos os campos do mapa entram na seleção.
    assert.equal(configuracao.colunas.length, Object.keys(definicao.colunas).length);
    const semAtualizacao: DefinicaoRepository<RegistroTeste, never> = {
      ...definicao,
      colunas: {
        ...definicao.colunas,
        nome: { ...definicao.colunas.nome, atualizavel: false },
        observacao: { ...definicao.colunas.observacao, atualizavel: false }
      }
    };
    assert.deepEqual(new ConfiguracaoRepository<RegistroTeste, never>(semAtualizacao).colunasAtualizacao, []);
    const nula: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, definicao);
    const mapaNulo = Object.assign(Object.create(null) as Record<string, unknown>, definicao.colunas);
    nula['colunas'] = mapaNulo;
    assert.deepEqual(new ConfiguracaoRepository<RegistroTeste, Atualizaveis>(nula as unknown as DefinicaoTeste).colunas, configuracao.colunas);
  }

  private verificarConfiguracoesInvalidas(): void {
    for (const invalida of [null, undefined, [], {}, { ...this.definicaoValida(), sql: 'fragmento' }]) this.rejeitar(invalida);
    for (const tabela of ['', 'Planos', 'public.registros', 'registros; DROP TABLE alunos', 'registros--', 'registros teste', '__proto__', 'tabela"', 1, null]) {
      this.rejeitar({ ...this.definicaoValida(), tabela });
    }
    for (const colunas of [undefined, null, [], ['nome', 'nome'], 'nome', new Map(), new Set(), new Date()]) {
      this.rejeitar({ ...this.definicaoValida(), colunas });
    }
    for (const protegida of ['id', 'criado_em', 'atualizado_em'] as const) {
      const colunas = { ...this.definicaoValida().colunas };
      Reflect.deleteProperty(colunas, protegida);
      this.rejeitar({ ...this.definicaoValida(), colunas });
      for (const flags of [{ atualizavel: true }, { anulavel: true }, { tipo: 'REAL' }]) {
        this.rejeitar({ ...this.definicaoValida(), colunas: { ...this.definicaoValida().colunas, [protegida]: { ...this.definicaoValida().colunas[protegida], ...flags } } });
      }
    }
    for (const metadados of [
      null, [], new Date(), 'TEXT',
      { tipo: 'BLOB', anulavel: false, atualizavel: true },
      { tipo: {}, anulavel: false, atualizavel: true },
      { tipo: 'TEXT', anulavel: 'false', atualizavel: true },
      { tipo: 'TEXT', anulavel: false, atualizavel: 1 },
      { tipo: 'TEXT', anulavel: false },
      { tipo: 'TEXT', anulavel: false, atualizavel: true, extra: 'interna' }
    ]) this.rejeitar({ ...this.definicaoValida(), colunas: { ...this.definicaoValida().colunas, nome: metadados } });
    this.rejeitar({ ...this.definicaoValida(), colunas: { ...this.definicaoValida().colunas, 'nome; DROP TABLE alunos': { tipo: 'TEXT', anulavel: false, atualizavel: true } } });
    this.rejeitar({ ...this.definicaoValida(), colunasCriacao: ['id'] });
    this.rejeitar({ ...this.definicaoValida(), colunasAnulaveis: [] });
    this.rejeitar({ ...this.definicaoValida(), colunasAtualizacao: ['quantidade'] });
    this.rejeitar({ ...this.definicaoValida(), [Symbol('sql')]: 'fragmento' });
    this.rejeitar({ ...this.definicaoValida(), colunas: { ...this.definicaoValida().colunas, [Symbol('coluna')]: {} } });
    const oculta = this.definicaoValida();
    Object.defineProperty(oculta, 'tabela', { value: 'registros_teste', enumerable: false });
    this.rejeitar(oculta);
  }

  private verificarAcessoresEColecoes(): void {
    let leituras: number = 0;
    const tabelaVariavel = this.definicaoValida();
    Object.defineProperty(tabelaVariavel, 'tabela', {
      enumerable: true,
      get: (): string => ++leituras === 1 ? 'registros_teste' : 'registros; DROP TABLE alunos; --'
    });
    this.rejeitar(tabelaVariavel);
    assert.equal(leituras, 0, 'Nem a primeira leitura do getter é permitida.');
    const listaVariavel = this.definicaoValida();
    Object.defineProperty(listaVariavel, 'colunasCriacao', {
      enumerable: true,
      get: (): string[] => ++leituras === 1 ? ['nome', 'observacao', 'quantidade'] : ['id']
    });
    this.rejeitar(listaVariavel);
    assert.equal(leituras, 0);
    const mapaVariavel = this.definicaoValida();
    Object.defineProperty(mapaVariavel, 'colunas', {
      enumerable: true,
      get: (): unknown => ++leituras === 1 ? this.definicaoValida().colunas : { id: { tipo: 'INTEGER', anulavel: false, atualizavel: true } }
    });
    this.rejeitar(mapaVariavel);
    assert.equal(leituras, 0);
    const flagVariavel = this.definicaoValida();
    Object.defineProperty(flagVariavel.colunas.nome, 'atualizavel', { enumerable: true, get: (): boolean => { leituras++; return true; } });
    this.rejeitar(flagVariavel);
    assert.equal(leituras, 0);
    const setter = this.definicaoValida();
    Object.defineProperty(setter, 'tabela', { enumerable: true, set: (_valor: unknown): void => { leituras++; } });
    this.rejeitar(setter);
    assert.equal(leituras, 0);
    for (const alvo of ['raiz', 'mapa', 'coluna'] as const) {
      const definicao = this.definicaoValida();
      const objeto: object = alvo === 'raiz' ? definicao : alvo === 'mapa' ? definicao.colunas : definicao.colunas.nome;
      Object.setPrototypeOf(objeto, { personalizado: true });
      this.rejeitar(definicao);
    }
    const iteravel = { ...this.definicaoValida().colunas, [Symbol.iterator]: (): never => { leituras++; throw new Error('Não executar iterador.'); } };
    this.rejeitar({ ...this.definicaoValida(), colunas: iteravel });
    assert.equal(leituras, 0);
    const arrayPersonalizado: unknown[] = [];
    Object.setPrototypeOf(arrayPersonalizado, Object.create(Array.prototype));
    this.rejeitar({ ...this.definicaoValida(), colunas: arrayPersonalizado });
    let armadilhas: number = 0;
    const proxy = new Proxy(this.definicaoValida(), {
      getPrototypeOf: (): never => { armadilhas++; throw new Error('Não executar trap.'); },
      ownKeys: (): never => { armadilhas++; throw new Error('Não executar trap.'); }
    });
    this.rejeitar(proxy);
    assert.equal(armadilhas, 0);
    const revogavel = Proxy.revocable(this.definicaoValida(), {});
    revogavel.revoke();
    this.rejeitar(revogavel.proxy);
  }

  private rejeitar(definicao: unknown): void {
    // Apenas testes de runtime contornam o contrato estático.
    assert.throws(() => new ConfiguracaoRepository<RegistroTeste, Atualizaveis>(definicao as DefinicaoTeste), (erro: unknown): boolean => {
      assert.ok(erro instanceof ErroRepository);
      assert.equal(erro.codigo, 'CONFIGURACAO_INVALIDA');
      assert.equal(erro.message, 'Configuração de persistência inválida.');
      return true;
    });
    this.casosInvalidos++;
  }

  private verificarImutabilidade(): void {
    const original = this.definicaoValida();
    const entrada = { ...original, colunas: { ...original.colunas, nome: { ...original.colunas.nome } } };
    const configuracao = new ConfiguracaoRepository<RegistroTeste, Atualizaveis>(entrada);
    entrada.tabela = 'alterada';
    Reflect.set(entrada.colunas.nome, 'tipo', 'REAL');
    Reflect.set(entrada.colunas.nome, 'anulavel', true);
    Reflect.deleteProperty(entrada.colunas, 'observacao');
    assert.equal(configuracao.tabela, original.tabela);
    assert.equal(configuracao.metadados['nome']?.tipo, 'TEXT');
    assert.equal(configuracao.metadados['nome']?.anulavel, false);
    assert.ok(configuracao.colunas.includes('observacao'));
    assert.deepEqual(configuracao.colunasAnulaveis, ['observacao']);
    assert.ok(Object.isFrozen(configuracao));
    assert.ok(Object.isFrozen(configuracao.metadados));
    assert.throws(() => Object.assign(configuracao, { tabela: 'outra' }), TypeError);
    assert.throws(() => Object.assign(configuracao.metadados, { id: {} }), TypeError);
    const nome = configuracao.metadados['nome'];
    assert.ok(nome);
    assert.throws(() => Object.assign(nome, { tipo: 'REAL' }), TypeError);
    for (const lista of [configuracao.colunas, configuracao.colunasCriacao, configuracao.colunasAtualizacao, configuracao.colunasAnulaveis]) {
      assert.ok(Object.isFrozen(lista));
      assert.throws(() => Reflect.apply(Array.prototype.push, lista, ['id']), TypeError);
    }
    for (const coluna of Object.values(configuracao.metadados)) assert.ok(Object.isFrozen(coluna));
  }

  private verificarErros(): void {
    const codigos: readonly CodigoErroRepository[] = ['CONFIGURACAO_INVALIDA', 'ENTRADA_INVALIDA', 'CONFLITO', 'INDISPONIVEL', 'INTERNO'];
    for (const codigo of codigos) {
      const erro = new ErroRepository(codigo);
      assert.ok(erro instanceof Error);
      assert.equal(erro.name, 'ErroRepository');
      assert.equal(erro.codigo, codigo);
      assert.ok(erro.message.length > 0);
    }
    let conversoes: number = 0;
    const objeto = { toString: (): string => { conversoes++; return 'CONFLITO'; } };
    const primitivo = { [Symbol.toPrimitive]: (): never => { conversoes++; throw new Error('Não converter.'); } };
    for (const invalido of [objeto, primitivo, 1, ['CONFLITO'], {}, null, undefined, false, Symbol('CONFLITO'), 'DESCONHECIDO', new String('CONFLITO')]) {
      const erro = new ErroRepository(invalido);
      assert.equal(erro.codigo, 'INTERNO');
      assert.equal(typeof erro.codigo, 'string');
      assert.equal(erro.message, new ErroRepository('INTERNO').message);
    }
    assert.equal(conversoes, 0);
  }
}

new VerificarContratosRepository().executar();
