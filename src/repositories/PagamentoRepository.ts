import type { FiltroInadimplencia, MensalidadeVencida } from '../shared/tipos/Inadimplencia';
import type { Conexao } from '../database/Conexao';
import type { Pagamento } from '../models/Pagamento';
import type { AlteracoesPagamento, FiltroPagamentos, PagamentoDto, Recebimento } from '../shared/tipos/Pagamento';
import { BaseRepository } from './BaseRepository';
import { ErroRepository } from './ErroRepository';

export class PagamentoRepository extends BaseRepository<Pagamento, never> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'pagamentos', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      matricula_id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      competencia: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      data_vencimento: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      valor_centavos: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      situacao: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      pago_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      forma_pagamento: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      cancelado_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      motivo_cancelamento: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      cancelado_por: { tipo: 'INTEGER', anulavel: true, atualizavel: false }
    } });
  }

  private static readonly origem = ` FROM pagamentos p
    JOIN matriculas m ON m.id = p.matricula_id JOIN alunos a ON a.id = m.aluno_id`;
  private static readonly colunas = `SELECT p.id, p.matricula_id, p.competencia, p.data_vencimento,
    p.valor_centavos, p.situacao, p.pago_em, p.forma_pagamento, p.criado_em, p.atualizado_em,
    p.cancelado_em, p.motivo_cancelamento, p.cancelado_por, u.nome AS cancelado_por_nome,
    a.id AS aluno_id, a.nome AS aluno_nome`;

  public detalhes(id: number): PagamentoDto | undefined {
    return this.conexao.preparar<[number], PagamentoDto>(
      PagamentoRepository.colunas + PagamentoRepository.origem + ' LEFT JOIN usuarios u ON u.id=p.cancelado_por WHERE p.id = ?'
    ).get(id);
  }

  public listar(f: FiltroPagamentos) {
    const filtro = ` WHERE (? IS NULL OR m.aluno_id = ?) AND (? IS NULL OR p.competencia = ?)
      AND (? IS NULL OR p.situacao = ?)`;
    const aluno = f.aluno_id ?? null, competencia = f.competencia ?? null, situacao = f.situacao ?? null;
    const valores = [aluno, aluno, competencia, competencia, situacao, situacao] as const;
    const origem = PagamentoRepository.origem + ' LEFT JOIN usuarios u ON u.id=p.cancelado_por' + filtro;
    const total = this.conexao.preparar<[...typeof valores], { total: number }>(
      'SELECT COUNT(*) AS total' + origem
    ).get(...valores)!.total;
    const itens = this.conexao.preparar<[...typeof valores, number, number], PagamentoDto>(
      PagamentoRepository.colunas + origem + ' ORDER BY p.data_vencimento, p.id LIMIT ? OFFSET ?'
    ).all(...valores, f.tamanho, (f.pagina - 1) * f.tamanho);
    return { itens, total, pagina: f.pagina, tamanho: f.tamanho };
  }

  public vencidas(filtro: FiltroInadimplencia, hoje: string) {
    type Linha = MensalidadeVencida & { aluno_id: number; nome: string };
    const busca = filtro.busca ?? '';
    return this.conexao.preparar<[string, string, string, string, string, string], Linha>(
      `SELECT p.id, p.matricula_id, p.competencia, p.data_vencimento, p.valor_centavos,
        a.id AS aluno_id, a.nome, CAST(julianday(?) - julianday(p.data_vencimento) AS INTEGER) AS dias_atraso`
      + PagamentoRepository.origem +
      ` WHERE p.situacao='pendente' AND p.pago_em IS NULL AND p.valor_centavos > 0
        AND p.data_vencimento < ? AND p.data_vencimento BETWEEN ? AND ?
        AND (instr(lower(a.nome), lower(?)) > 0 OR CAST(a.id AS TEXT) = ?)
        ORDER BY p.data_vencimento, p.id`
    ).all(hoje, hoje, filtro.inicio ?? '0001-01-01', filtro.fim ?? '9999-12-31', busca, busca);
  }

  public quitar(dados: Recebimento): boolean {
    const agora = new Date().toISOString();
    // A data informada é civil. atualizado_em guarda o instante real do registro.
    return this.conexao.preparar<[string, string, string, number], never>(
      `UPDATE pagamentos SET situacao='pago', pago_em=?, forma_pagamento=?, atualizado_em=?
       WHERE id=? AND situacao='pendente' AND valor_centavos > 0`
    ).run(dados.data + 'T00:00:00.000Z', dados.forma_pagamento, agora, dados.id).changes === 1;
  }

  public atualizarPendente(id: number, atualizadoEm: string, alteracoes: AlteracoesPagamento): boolean {
    const colunas: string[] = [];
    const valores: (string | number)[] = [];
    for (const coluna of ['competencia', 'data_vencimento', 'valor_centavos'] as const) {
      const valor = alteracoes[coluna];
      if (valor !== undefined) { colunas.push(`${coluna}=?`); valores.push(valor); }
    }
    if (!colunas.length) return false;
    const agora = new Date().toISOString();
    try {
      return this.conexao.preparar<(string | number)[], never>(
        `UPDATE pagamentos SET ${colunas.join(', ')}, atualizado_em=?
         WHERE id=? AND situacao='pendente' AND atualizado_em=?`
      ).run(...valores, agora, id, atualizadoEm).changes === 1;
    } catch (erro: unknown) {
      const codigo: unknown = erro instanceof Error ? Object.getOwnPropertyDescriptor(erro, 'code')?.value : undefined;
      if (codigo === 'SQLITE_CONSTRAINT_UNIQUE') throw new ErroRepository('CONFLITO');
      throw erro;
    }
  }

  public cancelarPendente(id: number, atualizadoEm: string, motivo: string, responsavel: number): boolean {
    const agora = new Date().toISOString();
    return this.conexao.preparar<[string, string, number, string, number, string], never>(
      `UPDATE pagamentos SET situacao='cancelado',cancelado_em=?,motivo_cancelamento=?,
       cancelado_por=?,atualizado_em=?
       WHERE id=? AND situacao='pendente' AND atualizado_em=?`
    ).run(agora, motivo, responsavel, agora, id, atualizadoEm).changes === 1;
  }
}
