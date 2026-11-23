export interface NovoAluno {
  nome: string;
  cpf: string;
  data_nascimento: string;
  email: string | null;
  telefone: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  ativo: number;
}

/** Projeção mínima para instrutores; nunca contém CPF, contato ou endereço. */
export interface AlunoInstrutorDto { id: number; nome: string; ativo: number }
export interface AlunoResumoDto extends AlunoInstrutorDto { cpf_mascarado?: string }
export interface AlunoDto extends NovoAluno {
  id: number;
  criado_em: string;
  atualizado_em: string;
  /** Controle de concorrência emitido pelo Main; não concede acesso. */
  referencia: string;
}
