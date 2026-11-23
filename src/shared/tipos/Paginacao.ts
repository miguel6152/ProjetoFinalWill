export interface Paginacao {
  /** Inteiro positivo; limites e offset serão validados antes das consultas. */
  pagina: number;
  /** Inteiro entre 1 e 100. */
  tamanho: number;
}

// Busca pertence aos contratos específicos; não faz parte da paginação da base.
export interface EntradaLista extends Paginacao {
  busca?: string;
}

/** Formato já publicado pelos contratos IPC. */
export interface PaginaIpc<T> extends Paginacao {
  itens: T[];
  total: number;
}

/** Resultado das leituras do repository, sem ampliar o contrato IPC. */
export interface Pagina<T> extends PaginaIpc<T> {
  totalPaginas: number;
}
