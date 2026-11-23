export interface RegistroPersistido {
  id: number;
  criado_em: string;
  atualizado_em: string;
}

/** Escalares das tabelas atuais. Objetos de domínio precisam de conversão explícita. */
export type ValorPersistivel = string | number | null;
// Distribuir as variantes e comparar cada uma com o tipo completo detecta
// uniões mesmo por aliases/interseções. Não é uma validação de runtime.
type EhUniao<T, Completo = T> = T extends unknown ? [Completo] extends [T] ? false : true : never;

export type RegistroSqlite<T> = {
  // Mapear as chaves técnicas fixas impede que o mapa distribua e perca a
  // informação da união original antes de aplicar a restrição.
  [K in keyof RegistroPersistido]: true extends EhUniao<T> ? never : RegistroPersistido[K];
} & {
  [K in keyof T]-?: K extends string ? ValorPersistivel : never;
};
export type Coluna<T extends RegistroSqlite<T>> = Extract<keyof T, string>;
export type ColunaDados<T extends RegistroSqlite<T>> = Exclude<Coluna<T>, keyof RegistroPersistido>;
export type ColunaAnulavel<T extends RegistroSqlite<T>> = {
  [K in ColunaDados<T>]-?: null extends T[K] ? K : never;
}[ColunaDados<T>];

type SemCampos<K extends PropertyKey> = { [P in K]?: never };

// A proteção estática só enxerga propriedades presentes no tipo da variável.
// Chaves extras ocultadas/coerções precisam da futura validação de entradas.
export type DadosCriacao<T extends RegistroSqlite<T>> = {
  [K in ColunaDados<T>]-?: T[K];
} & SemCampos<keyof RegistroPersistido>;

export type DadosAtualizacao<T extends RegistroSqlite<T>, A extends ColunaDados<T> = ColunaDados<T>> = {
  [K in A]?: T[K];
} & SemCampos<Exclude<Coluna<T>, A>>;

export type TipoSqlite = 'TEXT' | 'INTEGER' | 'REAL';
type TipoDoValor<V> = [Exclude<V, null>] extends [never] ? TipoSqlite
  : [Exclude<V, null>] extends [string] ? 'TEXT'
  : [Exclude<V, null>] extends [number] ? 'INTEGER' | 'REAL' : never;

/** Todas as chaves são obrigatórias: a leitura não possui uma seleção separada. */
export type MapaColunas<T extends RegistroSqlite<T>, A extends ColunaDados<T> = ColunaDados<T>> = {
  readonly [K in Coluna<T>]-?: {
    readonly tipo: K extends 'id' ? 'INTEGER'
      : K extends 'criado_em' | 'atualizado_em' ? 'TEXT' : TipoDoValor<T[K]>;
    readonly anulavel: null extends T[K] ? true : false;
    readonly atualizavel: K extends A ? true : false;
  };
};

export interface DefinicaoRepository<T extends RegistroSqlite<T>, A extends ColunaDados<T> = ColunaDados<T>> {
  readonly tabela: string;
  readonly colunas: MapaColunas<T, A>;
}

export interface MetadadosColuna {
  readonly tipo: TipoSqlite;
  readonly anulavel: boolean;
  readonly atualizavel: boolean;
}
