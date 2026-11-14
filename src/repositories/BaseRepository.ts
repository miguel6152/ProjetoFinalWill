import type { Conexao } from '../database/Conexao';
import { types } from 'node:util';
import type { Pagina, Paginacao } from '../shared/tipos/Paginacao';
import { ConfiguracaoRepository } from './ConfiguracaoRepository';
import { ErroRepository } from './ErroRepository';
import type { ColunaDados, DadosAtualizacao, DadosCriacao, DefinicaoRepository, RegistroSqlite, ValorPersistivel } from './TiposRepository';

export abstract class BaseRepository<T extends RegistroSqlite<T>, A extends ColunaDados<T> = ColunaDados<T>> {
  protected readonly configuracao: ConfiguracaoRepository<T, A>;

  protected constructor(protected readonly conexao: Conexao, definicao: DefinicaoRepository<T, A>) {
    this.configuracao = new ConfiguracaoRepository<T, A>(definicao);
  }

  public create(dados: DadosCriacao<T>): T {
    const entrada = this.validarEscrita(dados, this.configuracao.colunasCriacao, true);
    const colunas = [...this.configuracao.colunasCriacao, 'criado_em', 'atualizado_em'];
    const instante = new Date().toISOString();
    const valores: ValorPersistivel[] = [...entrada.valores, instante, instante];
    try {
      // O envelope é comprovadamente síncrono para o contrato da conexão,
      // sem coerções de T nem enfraquecimento da proteção contra Promises.
      return this.conexao.transacao<{ registro: T }>(() => {
        const resultado = this.conexao.preparar<ValorPersistivel[], never>(
          `INSERT INTO "${this.configuracao.tabela}" (${colunas.map((coluna): string => `"${coluna}"`).join(', ')}) VALUES (${colunas.map((): string => '?').join(', ')})`
        ).run(...valores);
        const id = Number(resultado.lastInsertRowid);
        if (resultado.changes !== 1 || !Number.isSafeInteger(id) || id < 1) throw new ErroRepository('INTERNO');
        const persistido = this.findById(id);
        if (persistido === undefined) throw new ErroRepository('INTERNO');
        return { registro: persistido };
      }).registro;
    } catch (erro: unknown) {
      throw this.traduzirErro(erro);
    }
  }

  public findById(id: number): T | undefined {
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroRepository('ENTRADA_INVALIDA');
    try {
      return this.conexao.preparar<[number], T>(
        `SELECT ${this.selecao()} FROM "${this.configuracao.tabela}" WHERE "id" = ?`
      ).get(id);
    } catch (erro: unknown) {
      throw this.traduzirErro(erro);
    }
  }

  public findAll(paginacao: Paginacao): Pagina<T> {
    const { pagina, tamanho, offset } = this.validarPaginacao(paginacao);
    try {
      return this.conexao.transacaoLeitura<Pagina<T>>((): Pagina<T> => {
        const contagem = this.conexao.preparar<[], { total: number }>(
          `SELECT COUNT(*) AS total FROM "${this.configuracao.tabela}"`
        ).get();
        if (contagem === undefined || !Number.isSafeInteger(contagem.total) || contagem.total < 0) {
          throw new ErroRepository('INTERNO');
        }
        const itens = this.conexao.preparar<[number, number], T>(
          `SELECT ${this.selecao()} FROM "${this.configuracao.tabela}" ORDER BY "id" ASC LIMIT ? OFFSET ?`
        ).all(tamanho, offset);
        return { itens, total: contagem.total, pagina, tamanho, totalPaginas: Math.ceil(contagem.total / tamanho) };
      });
    } catch (erro: unknown) {
      throw this.traduzirErro(erro);
    }
  }

  public update(id: number, alteracoes: DadosAtualizacao<T, A>): T | undefined {
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroRepository('ENTRADA_INVALIDA');
    const entrada = this.validarEscrita(alteracoes, this.configuracao.colunasAtualizacao, false);
    const valores: ValorPersistivel[] = [...entrada.valores, new Date().toISOString(), id];
    try {
      return this.conexao.transacao<{ registro: T | undefined }>(() => {
        const resultado = this.conexao.preparar<ValorPersistivel[], never>(
          `UPDATE "${this.configuracao.tabela}" SET ${entrada.colunas.map((coluna): string => `"${coluna}" = ?`).join(', ')}, "atualizado_em" = ? WHERE "id" = ?`
        ).run(...valores);
        if (resultado.changes === 0) return { registro: undefined };
        if (resultado.changes !== 1) throw new ErroRepository('INTERNO');
        const persistido = this.findById(id);
        if (persistido === undefined) throw new ErroRepository('INTERNO');
        return { registro: persistido };
      }).registro;
    } catch (erro: unknown) {
      throw this.traduzirErro(erro);
    }
  }

  public delete(id: number): boolean {
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroRepository('ENTRADA_INVALIDA');
    try {
      return this.conexao.transacao<boolean>(() => {
        const resultado = this.conexao.preparar<[number], never>(
          `DELETE FROM "${this.configuracao.tabela}" WHERE "id" = ?`
        ).run(id);
        if (resultado.changes !== 0 && resultado.changes !== 1) throw new ErroRepository('INTERNO');
        return resultado.changes === 1;
      });
    } catch (erro: unknown) {
      throw this.traduzirErro(erro);
    }
  }

  private validarEscrita(valor: unknown, permitidas: readonly string[], criacao: boolean): {
    colunas: string[]; valores: ValorPersistivel[];
  } {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) {
      throw new ErroRepository('ENTRADA_INVALIDA');
    }
    const prototipo: unknown = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) throw new ErroRepository('ENTRADA_INVALIDA');
    const descritores = Object.getOwnPropertyDescriptors(valor);
    const chaves = Reflect.ownKeys(descritores);
    if ((criacao && chaves.length !== permitidas.length) || (!criacao && chaves.length === 0)) {
      throw new ErroRepository('ENTRADA_INVALIDA');
    }
    // A ordem do SQL vem da configuração, nunca de fragmentos externos.
    for (const chave of chaves) {
      if (typeof chave !== 'string' || !permitidas.includes(chave)) throw new ErroRepository('ENTRADA_INVALIDA');
    }
    const colunas = permitidas.filter((coluna): boolean => Object.hasOwn(descritores, coluna));
    const valores: ValorPersistivel[] = [];
    for (const coluna of colunas) {
      const descritor = descritores[coluna];
      if (descritor === undefined || !Object.hasOwn(descritor, 'value') || !descritor.enumerable) {
        throw new ErroRepository('ENTRADA_INVALIDA');
      }
      const campo: unknown = descritor.value;
      const metadados = this.configuracao.metadados[coluna];
      if (metadados === undefined) throw new ErroRepository('CONFIGURACAO_INVALIDA');
      if (campo === null) {
        if (!metadados.anulavel) throw new ErroRepository('ENTRADA_INVALIDA');
      } else if (metadados.tipo === 'TEXT') {
        if (typeof campo !== 'string') throw new ErroRepository('ENTRADA_INVALIDA');
      } else if (typeof campo !== 'number' || !Number.isFinite(campo) ||
          (metadados.tipo === 'INTEGER' && !Number.isSafeInteger(campo))) {
        throw new ErroRepository('ENTRADA_INVALIDA');
      }
      // As verificações acima estreitam cada valor, sem converter tipos.
      if (campo !== null && typeof campo !== 'number' && typeof campo !== 'string') throw new ErroRepository('ENTRADA_INVALIDA');
      valores.push(campo);
    }
    return { colunas, valores };
  }

  private selecao(): string {
    // Somente nomes internos já materializados, validados e congelados.
    return this.configuracao.colunas.map((coluna): string => `"${coluna}"`).join(', ');
  }

  private validarPaginacao(valor: unknown): Paginacao & { offset: number } {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) {
      throw new ErroRepository('ENTRADA_INVALIDA');
    }
    const prototipo: unknown = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) throw new ErroRepository('ENTRADA_INVALIDA');
    const descritores = Object.getOwnPropertyDescriptors(valor);
    if (Reflect.ownKeys(descritores).length !== 2) throw new ErroRepository('ENTRADA_INVALIDA');
    const p = descritores['pagina'];
    const t = descritores['tamanho'];
    if (p === undefined || t === undefined || !Object.hasOwn(p, 'value') || !Object.hasOwn(t, 'value')) {
      throw new ErroRepository('ENTRADA_INVALIDA');
    }
    const pagina: unknown = p.value;
    const tamanho: unknown = t.value;
    if (typeof pagina !== 'number' || !Number.isSafeInteger(pagina) || pagina < 1 ||
        typeof tamanho !== 'number' || !Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > 100) {
      throw new ErroRepository('ENTRADA_INVALIDA');
    }
    const offset = (pagina - 1) * tamanho;
    if (!Number.isSafeInteger(offset)) throw new ErroRepository('ENTRADA_INVALIDA');
    return { pagina, tamanho, offset };
  }

  private traduzirErro(erro: unknown): ErroRepository {
    if (erro instanceof ErroRepository) return erro;
    const codigo: unknown = erro instanceof Error ? Object.getOwnPropertyDescriptor(erro, 'code')?.value : undefined;
    if (typeof codigo === 'string' && (codigo === 'SQLITE_CONSTRAINT' || codigo.startsWith('SQLITE_CONSTRAINT_'))) {
      return new ErroRepository('CONFLITO');
    }
    return new ErroRepository(codigo === 'SQLITE_BUSY' || codigo === 'SQLITE_LOCKED' ? 'INDISPONIVEL' : 'INTERNO');
  }
}
