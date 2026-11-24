import type { Conexao } from '../database/Conexao';
import type { Matricula } from '../models/Matricula';
import type { ListaMatriculas, MatriculaDto, NovaMatricula } from '../shared/tipos/Matricula';
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
  public escritaAtomica<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T { return this.conexao.transacao(operacao); }
  public alunoExiste(id: number): boolean { return this.conexao.preparar<[number], { id: number }>('SELECT id FROM alunos WHERE id=?').get(id) !== undefined; }
  public planoAtivo(id: number): boolean { return this.conexao.preparar<[number], { id: number }>('SELECT id FROM planos WHERE id=? AND ativo=1').get(id) !== undefined; }
  public sobrepoe(aluno: number, inicio: string, fim: string, ignorarId?: number): boolean {
    const ignorado = ignorarId ?? null;
    return this.conexao.preparar<[number, string, string, number | null, number | null], { id: number }>(
      "SELECT id FROM matriculas WHERE aluno_id=? AND situacao='ativa' AND data_inicio<=? AND data_fim>=? AND (? IS NULL OR id<>?) LIMIT 1"
    ).get(aluno, fim, inicio, ignorado, ignorado) !== undefined;
  }
  public atualizar(id: number, atualizadoEm: string, dados: NovaMatricula): boolean {
    const agora = new Date().toISOString();
    return this.conexao.preparar<[number, number, string, string, number, string, number, string], never>(
      "UPDATE matriculas SET aluno_id=?,plano_id=?,data_inicio=?,data_fim=?,valor_contratado_centavos=?,atualizado_em=? WHERE id=? AND situacao='ativa' AND atualizado_em=?"
    ).run(dados.aluno_id, dados.plano_id, dados.data_inicio, dados.data_fim, dados.valor_contratado_centavos, agora, id, atualizadoEm).changes === 1;
  }
  public cadastrar(dados: NovaMatricula): MatriculaDto {
    const resultado = this.create({ ...dados, situacao: 'ativa' });
    const detalhes = this.detalhes(resultado.id);
    if (detalhes === undefined) throw new Error('Matrícula indisponível');
    return detalhes;
  }
  public alterarSituacao(id: number, situacao: 'cancelada' | 'encerrada'): boolean {
    return this.conexao.preparar<[string, number], never>("UPDATE matriculas SET situacao=? WHERE id=? AND situacao='ativa'").run(situacao, id).changes === 1;
  }
  public possuiVinculos(id: number): boolean {
    return this.conexao.preparar<[number, number], { presente: number }>('SELECT 1 AS presente WHERE EXISTS (SELECT 1 FROM pagamentos WHERE matricula_id=?) OR EXISTS (SELECT 1 FROM notificacoes WHERE matricula_id=?)').get(id, id) !== undefined;
  }
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
