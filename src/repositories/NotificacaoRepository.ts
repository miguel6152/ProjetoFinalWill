import type { Conexao } from '../database/Conexao';
import type { Notificacao } from '../models/Notificacao';
import type { AvisoDto, EventoVencimento, FiltroAvisos } from '../shared/tipos/Aviso';
import { BaseRepository } from './BaseRepository';

export class NotificacaoRepository extends BaseRepository<Notificacao, never> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'notificacoes', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      matricula_id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      tipo: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      canal: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      chave_deduplicacao: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      agendada_para: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      enviada_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      situacao: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      tentativas: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      proxima_tentativa_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      mensagem_id_externo: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      erro_codigo: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      data_alvo: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      antecedencia_dias: { tipo: 'INTEGER', anulavel: true, atualizavel: false },
      lido_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      invalidado_em: { tipo: 'TEXT', anulavel: true, atualizavel: false }
    } });
  }

  public transacao<T>(acao: () => T extends PromiseLike<unknown> ? never : T): T {
    return this.conexao.transacao(acao);
  }

  public vigencias(hoje: string, limite: number) {
    return this.conexao.preparar<[string, string, string, number], { id: number; data_fim: string; dias: number }>(
      `SELECT id, data_fim, CAST(julianday(data_fim)-julianday(?) AS INTEGER) AS dias
       FROM matriculas WHERE situacao='ativa' AND data_fim BETWEEN ? AND date(?, '+' || ? || ' days')`
    ).all(hoje, hoje, hoje, limite);
  }

  public expirar(hoje: string, instante: string): void {
    this.conexao.preparar<[string, string, string], never>(
      `UPDATE notificacoes SET invalidado_em=?, atualizado_em=? WHERE canal='interno'
       AND data_alvo < ? AND invalidado_em IS NULL`
    ).run(instante, instante, hoje);
  }

  public registrar(evento: EventoVencimento, instante: string): number {
    const { matricula_id, tipo, data_alvo, antecedencia_dias } = evento;
    this.conexao.preparar<[string, string, number, string, number], never>(
      `UPDATE notificacoes SET invalidado_em=?, atualizado_em=? WHERE matricula_id=? AND data_alvo=?
       AND canal='interno' AND invalidado_em IS NULL AND antecedencia_dias > ?`
    ).run(instante, instante, matricula_id, data_alvo, antecedencia_dias);
    const chave = [tipo, matricula_id, data_alvo, antecedencia_dias].join(':');
    return this.conexao.preparar<[number, string, string, string, number, string, string, string], never>(
      `INSERT INTO notificacoes (matricula_id,tipo,chave_deduplicacao,data_alvo,antecedencia_dias,
       agendada_para,criado_em,atualizado_em,canal,situacao,tentativas)
       VALUES (?,?,?,?,?,?,?,?,'interno','pendente',0)
       ON CONFLICT(chave_deduplicacao) DO NOTHING`
    ).run(matricula_id, tipo, 'interno:' + chave, data_alvo, antecedencia_dias, instante, instante, instante).changes;
  }

  public listar({ busca, estado }: FiltroAvisos): AvisoDto[] {
    const condicoes = {
      ativos: 'n.invalidado_em IS NULL', nao_lidos: 'n.invalidado_em IS NULL AND n.lido_em IS NULL',
      lidos: 'n.lido_em IS NOT NULL', invalidados: 'n.invalidado_em IS NOT NULL', todos: '1=1'
    };
    return this.conexao.preparar<[string], AvisoDto>(
      `SELECT n.id, n.matricula_id, a.nome AS aluno_nome, n.tipo, n.data_alvo, n.antecedencia_dias,
       n.criado_em, n.lido_em, n.invalidado_em FROM notificacoes n JOIN matriculas m ON m.id=n.matricula_id
       JOIN alunos a ON a.id=m.aluno_id WHERE n.canal='interno' AND n.data_alvo IS NOT NULL
       AND instr(lower(a.nome),lower(?))>0 AND ` + condicoes[estado] + ' ORDER BY n.criado_em DESC,n.id DESC'
    ).all(busca);
  }

  public ler(id: number, instante: string): boolean {
    return this.conexao.preparar<[string, string, number], never>(
      `UPDATE notificacoes SET lido_em=COALESCE(lido_em,?), atualizado_em=CASE WHEN lido_em IS NULL THEN ? ELSE atualizado_em END
       WHERE id=? AND canal='interno' AND data_alvo IS NOT NULL AND invalidado_em IS NULL`
    ).run(instante, instante, id).changes === 1;
  }
}
