export interface NovoInstrutor {
  nome: string;
  usuario_id: number;
  email: string;
  telefone: string;
  especialidade: string;
  ativo: number;
}

export interface InstrutorDto extends NovoInstrutor {
  id: number;
  criado_em: string;
  atualizado_em: string;
  /** Referência de concorrência emitida pelo Main; não concede permissão. */
  referencia: string;
}
