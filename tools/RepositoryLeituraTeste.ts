import { BaseRepository } from '../src/repositories/BaseRepository';
import type { Conexao } from '../src/database/Conexao';
import type { RegistroPersistido } from '../src/repositories/TiposRepository';

export interface RegistroLeituraTeste extends RegistroPersistido {
  nome: string;
  observacao: string | null;
  quantidade: number;
  pai_id: number;
}

/** Fixture exclusiva: exercita as leituras reais herdadas, sem implementar escritas. */
export class RepositoryLeituraTeste extends BaseRepository<RegistroLeituraTeste> {
  public constructor(conexao: Conexao) {
    super(conexao, {
      tabela: 'registros_leitura',
      colunas: {
        id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
        nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        observacao: { tipo: 'TEXT', anulavel: true, atualizavel: true },
        quantidade: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        pai_id: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
        atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
      }
    });
  }

  // A classe precisa satisfazer a base abstrata para testar as leituras.
  // As escritas não são utilizadas e falham explicitamente nesta fixture.
  public override create(): never { throw new Error('Escrita indisponível na fixture de leitura.'); }
  public override update(): never { throw new Error('Escrita indisponível na fixture de leitura.'); }
  public override delete(): never { throw new Error('Escrita indisponível na fixture de leitura.'); }
}
