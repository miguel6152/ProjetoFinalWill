import { types } from 'node:util';
import { ErroRepository } from './ErroRepository';
import type { Coluna, ColunaAnulavel, ColunaDados, DefinicaoRepository, MetadadosColuna, RegistroSqlite } from './TiposRepository';

export class ConfiguracaoRepository<T extends RegistroSqlite<T>, A extends ColunaDados<T> = ColunaDados<T>> {
  public readonly tabela: string;
  public readonly colunas: readonly Coluna<T>[];
  public readonly colunasCriacao: readonly ColunaDados<T>[];
  public readonly colunasAtualizacao: readonly A[];
  public readonly colunasAnulaveis: readonly ColunaAnulavel<T>[];

  public readonly metadados: Readonly<Record<string, MetadadosColuna>>;

  public constructor(definicao: DefinicaoRepository<T, A>) {
    // Capturar descriptors, nunca avaliar getters da definição. Tudo abaixo
    // é validado sobre cópias locais; a origem não é relida para armazenar.
    const raiz: Record<string, unknown> = this.copiarObjeto(definicao);
    const mapa: Record<string, unknown> = this.copiarObjeto(raiz['colunas']);
    const copias: Record<string, Record<string, unknown>> = Object.create(null) as Record<string, Record<string, unknown>>;
    for (const nome of Object.keys(mapa)) copias[nome] = this.copiarObjeto(mapa[nome]);

    this.validarChaves(raiz, ['tabela', 'colunas']);
    const tabela: unknown = raiz['tabela'];
    this.validarIdentificador(tabela);
    const nomes: string[] = Object.keys(copias);
    const gerenciadas: readonly string[] = ['id', 'criado_em', 'atualizado_em'];
    if (gerenciadas.some((nome): boolean => !Object.hasOwn(copias, nome))) this.falhar();
    const metadados: Record<string, MetadadosColuna> = Object.create(null) as Record<string, MetadadosColuna>;
    for (const nome of nomes) {
      this.validarIdentificador(nome);
      const coluna = copias[nome];
      if (coluna === undefined) this.falhar();
      this.validarChaves(coluna, ['tipo', 'anulavel', 'atualizavel']);
      const tipo: unknown = coluna['tipo'];
      const anulavel: unknown = coluna['anulavel'];
      const atualizavel: unknown = coluna['atualizavel'];
      if (tipo !== 'TEXT' && tipo !== 'INTEGER' && tipo !== 'REAL') this.falhar();
      if (typeof anulavel !== 'boolean' || typeof atualizavel !== 'boolean') this.falhar();
      if (gerenciadas.includes(nome) && (anulavel || atualizavel || tipo !== (nome === 'id' ? 'INTEGER' : 'TEXT'))) this.falhar();
      metadados[nome] = Object.freeze({ tipo, anulavel, atualizavel });
    }
    this.tabela = tabela;
    // Associar nomes validados ao mapa tipado recebido não descobre T em runtime.
    this.colunas = Object.freeze(nomes) as readonly Coluna<T>[];
    this.colunasCriacao = Object.freeze(nomes.filter((nome): boolean => !gerenciadas.includes(nome))) as readonly ColunaDados<T>[];
    this.colunasAtualizacao = Object.freeze(nomes.filter((nome): boolean => metadados[nome]?.atualizavel === true)) as readonly A[];
    this.colunasAnulaveis = Object.freeze(nomes.filter((nome): boolean => metadados[nome]?.anulavel === true)) as readonly ColunaAnulavel<T>[];
    this.metadados = Object.freeze(metadados);
    Object.freeze(this);
  }

  private copiarObjeto(valor: unknown): Record<string, unknown> {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) this.falhar();
    const prototipo: unknown = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) this.falhar();
    const descritores: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(valor);
    const copia: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const chave of Reflect.ownKeys(descritores)) {
      if (typeof chave !== 'string') this.falhar();
      const descritor: PropertyDescriptor | undefined = descritores[chave];
      if (descritor === undefined || !Object.hasOwn(descritor, 'value') || !descritor.enumerable) this.falhar();
      copia[chave] = descritor.value;
    }
    return copia;
  }

  private validarChaves(objeto: Record<string, unknown>, esperadas: readonly string[]): void {
    const chaves: string[] = Object.keys(objeto);
    if (chaves.length !== esperadas.length || esperadas.some((chave): boolean => !Object.hasOwn(objeto, chave))) this.falhar();
  }

  private validarIdentificador(valor: unknown): asserts valor is string {
    if (typeof valor !== 'string' || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(valor)) this.falhar();
  }

  private falhar(): never {
    throw new ErroRepository('CONFIGURACAO_INVALIDA');
  }
}
