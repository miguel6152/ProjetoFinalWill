import type { Conexao } from '../database/Conexao';
import type { Matricula } from '../models/Matricula';
import type { ListaMatriculas, MatriculaDto } from '../shared/tipos/Matricula';
import type { Pagina } from '../shared/ipc/ContratoIpc';
import { BaseRepository } from './BaseRepository';
import { PlanoRepository } from './PlanoRepository';

export class MatriculaRepository extends BaseRepository<Matricula, never> {
  private readonly atores: PlanoRepository;
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'matriculas', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      aluno_id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      plano_id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      data_inicio: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      data_fim: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      valor_contratado_centavos: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      situacao: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
    } });
    this.atores = new PlanoRepository(conexao);
  }
  public atomico<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T { return this.conexao.transacaoLeitura(operacao); }
  public atorAtual(id: number) { return this.atores.atorAtual(id); }
  private static readonly origem = ' FROM matriculas m JOIN alunos a ON a.id=m.aluno_id JOIN planos p ON p.id=m.plano_id';
  private static readonly colunas = 'SELECT m.id,m.aluno_id,a.nome AS aluno_nome,m.plano_id,p.nome AS plano_nome,m.data_inicio,m.data_fim,m.valor_contratado_centavos,m.situacao,m.criado_em,m.atualizado_em';
  public listar(f: ListaMatriculas): Pagina<MatriculaDto> {
    const filtro = ' WHERE (? IS NULL OR m.aluno_id=?) AND (? IS NULL OR m.plano_id=?) AND (? IS NULL OR m.situacao=?)';
    const aluno = f.aluno_id ?? null, plano = f.plano_id ?? null, situacao = f.situacao ?? null;
    const valores: [number | null, number | null, number | null, number | null, string | null, string | null] = [aluno, aluno, plano, plano, situacao, situacao];
    const total = this.conexao.preparar<typeof valores, { total: number }>('SELECT COUNT(*) AS total' + MatriculaRepository.origem + filtro).get(...valores)?.total;
    if (total === undefined) throw new Error('Contagem indisponível');
    const itens = this.conexao.preparar<[...typeof valores, number, number], MatriculaDto>(MatriculaRepository.colunas + MatriculaRepository.origem + filtro + ' ORDER BY m.id ASC LIMIT ? OFFSET ?').all(...valores, f.tamanho, (f.pagina - 1) * f.tamanho);
    return { itens, total, pagina: f.pagina, tamanho: f.tamanho };
  }
  public detalhes(id: number): MatriculaDto | undefined {
    return this.conexao.preparar<[number], MatriculaDto>(MatriculaRepository.colunas + MatriculaRepository.origem + ' WHERE m.id=?').get(id);
  }
}
