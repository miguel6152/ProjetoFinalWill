export interface NovoPlano {
  nome: string;
  duracao_meses: number;
  valor_centavos: number;
  ativo: number;
}

export interface PlanoDto extends NovoPlano {
  id: number;
  criado_em: string;
  atualizado_em: string;
  /** Referência de concorrência emitida pelo Main; não concede permissão. */
  referencia: string;
}
