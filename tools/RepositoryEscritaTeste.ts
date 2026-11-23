import { BaseRepository } from '../src/repositories/BaseRepository';
import type { Conexao } from '../src/database/Conexao';
import type { RegistroPersistido } from '../src/repositories/TiposRepository';

export interface RegistroEscritaTeste extends RegistroPersistido {
  nome: string;
  observacao: string | null;
  quantidade: number;
  ativo: number;
  proporcao: number;
  pai_id: number;
  imutavel: string;
}

/** Apenas fixture: todas as cinco operações são herdadas da implementação real. */
export class RepositoryEscritaTeste extends BaseRepository<RegistroEscritaTeste,
  'nome' | 'observacao' | 'quantidade' | 'ativo' | 'proporcao' | 'pai_id'> {
  public constructor(conexao: Conexao) {
    super(conexao, {
      tabela: 'registros_escrita',
      colunas: {
        id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
        nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        observacao: { tipo: 'TEXT', anulavel: true, atualizavel: true },
        quantidade: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        ativo: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        proporcao: { tipo: 'REAL', anulavel: false, atualizavel: true },
        pai_id: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        imutavel: { tipo: 'TEXT', anulavel: false, atualizavel: false },
        criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
        atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
      }
    });
  }
}
