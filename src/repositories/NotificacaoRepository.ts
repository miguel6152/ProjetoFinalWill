import type { AlterarPreferencia, ModoEntrega, PreferenciaDto, TentativaDto } from '../shared/tipos/Entrega';
import type { RespostaEntrega } from '../services/TelegramCliente';
import type { Conexao } from '../database/Conexao';
import type { Notificacao } from '../models/Notificacao';
import type { AvisoDto, EventoVencimento, FiltroAvisos } from '../shared/tipos/Aviso';
import { BaseRepository } from './BaseRepository';

export interface DestinoEntrega {
  id: number; data_alvo: string; antecedencia_dias: number; dias: number; vigente: number;
  chat: string | null; consentimento: string | null; situacao: string;
}

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

  public destino(id: number, hoje: string): DestinoEntrega | undefined {
    return this.conexao.preparar<[string, number], DestinoEntrega>(
      `SELECT n.id,n.data_alvo,n.antecedencia_dias,n.situacao,
       CAST(julianday(n.data_alvo)-julianday(?) AS INTEGER) AS dias,
       (n.invalidado_em IS NULL AND m.situacao='ativa' AND m.data_fim=n.data_alvo AND a.ativo=1) AS vigente,
       a.telegram_chat_id AS chat,a.autorizado_notificar_em AS consentimento
       FROM notificacoes n JOIN matriculas m ON m.id=n.matricula_id JOIN alunos a ON a.id=m.aluno_id
       WHERE n.id=? AND n.canal='interno' AND n.data_alvo IS NOT NULL`
    ).get(hoje, id);
  }

  public candidatos(agora: string, hoje: string): number[] {
    return this.conexao.preparar<[string, string], {id: number}>(
      `SELECT n.id FROM notificacoes n JOIN matriculas m ON m.id=n.matricula_id JOIN alunos a ON a.id=m.aluno_id
       WHERE n.canal='interno' AND n.invalidado_em IS NULL AND n.data_alvo>=? AND m.situacao='ativa'
       AND a.ativo=1 AND a.telegram_chat_id IS NOT NULL AND a.autorizado_notificar_em IS NOT NULL
       AND (n.situacao='pendente' OR (n.situacao='falhou' AND n.proxima_tentativa_em<=?))
       AND n.tentativas < 3
       AND NOT EXISTS (SELECT 1 FROM entrega_tentativas t WHERE t.aviso_id=n.id AND t.estado IN ('simulado','incerto','enviado','processando'))
       ORDER BY n.id`
    ).all(hoje,agora).map(r => r.id);
  }

  public historico(id: number): TentativaDto[] {
    return this.conexao.preparar<[number], TentativaDto>(
      'SELECT numero,modo,estado,inicio,fim,motivo,proxima,mensagem_id FROM entrega_tentativas WHERE aviso_id=? ORDER BY numero DESC'
    ).all(id);
  }

  public limitadoAte(agora: string): string | null {
    return this.conexao.preparar<[string], { ate: string | null }>(
      "SELECT MAX(proxima) AS ate FROM entrega_tentativas WHERE motivo='Limite de requisições.' AND proxima>?"
    ).get(agora)!.ate;
  }

  public iniciarTentativa(id: number, numero: number, modo: ModoEntrega, agora: string): void {
    this.conexao.preparar<[number,number,string,string],never>(
      "INSERT INTO entrega_tentativas(aviso_id,numero,modo,estado,inicio) VALUES (?,?,?,'processando',?)"
    ).run(id,numero,modo,agora);
    this.conexao.preparar<[string,number],never>(
      "UPDATE notificacoes SET situacao='processando',tentativas=tentativas+1,atualizado_em=?,proxima_tentativa_em=NULL WHERE id=?"
    ).run(agora,id);
  }

  public concluir(id: number, numero: number, r: RespostaEntrega, agora: string, proxima: string | null): void {
    const motivo = 'motivo' in r ? r.motivo : null;
    const mensagem = r.estado === 'enviado' ? r.mensagem_id : null;
    const alterou = this.conexao.preparar<[string,string,string|null,string|null,string|null,number,number],never>(
      "UPDATE entrega_tentativas SET estado=?,fim=?,motivo=?,proxima=?,mensagem_id=? WHERE aviso_id=? AND numero=? AND estado='processando'"
    ).run(r.estado,agora,motivo,proxima,mensagem,id,numero).changes;
    if (!alterou) return;
    const situacao = r.estado === 'enviado' ? 'enviada' : r.estado === 'simulado' ? 'pendente' : 'falhou';
    this.conexao.preparar<[string,string,string|null,string|null,string|null,string|null,string,number],never>(
      `UPDATE notificacoes SET situacao=CASE WHEN invalidado_em IS NOT NULL AND ?<>'enviada' THEN 'cancelada' ELSE ? END,
       enviada_em=?,mensagem_id_externo=?,proxima_tentativa_em=?,erro_codigo=?,atualizado_em=? WHERE id=?`
    ).run(situacao,situacao,r.estado==='enviado' ? agora : null,mensagem,proxima,motivo,agora,id);
  }

  public recuperar(agora: Date): void {
    const limite = new Date(agora.getTime()-120000).toISOString();
    this.transacao(() => {
      const antigas = this.conexao.preparar<[string], {aviso_id: number; numero: number}>(
        "SELECT aviso_id,numero FROM entrega_tentativas WHERE estado='processando' AND inicio<=?"
      ).all(limite);
      for (const t of antigas) this.concluir(t.aviso_id,t.numero,{estado:'incerto',motivo:'Processamento interrompido sem confirmação.'},agora.toISOString(),null);
    });
  }

  public preferencia(id: number): PreferenciaDto | undefined {
    const aluno = this.conexao.preparar<[number], {id: number; nome: string; vinculado: number; autorizado: number}>(
      'SELECT id,nome,telegram_chat_id IS NOT NULL AS vinculado,autorizado_notificar_em IS NOT NULL AS autorizado FROM alunos WHERE id=?'
    ).get(id);
    return aluno && { ...aluno, vinculado: !!aluno.vinculado, autorizado: !!aluno.autorizado };
  }

  public alterarPreferencia(dados: AlterarPreferencia, instante: string): boolean {
    const anterior = this.preferencia(dados.id);
    const alterou = this.conexao.preparar<[string|null,string|null,string,number],never>(
      'UPDATE alunos SET telegram_chat_id=?,autorizado_notificar_em=?,atualizado_em=? WHERE id=?'
    ).run(dados.chat,dados.autorizar ? instante : null,instante,dados.id).changes;
    if (anterior?.autorizado && !dados.autorizar) this.conexao.preparar<[string,number],never>(
      `UPDATE notificacoes SET situacao='cancelada',erro_codigo='Preferência revogada.',atualizado_em=?
       WHERE canal='interno' AND situacao IN ('pendente','falhou') AND matricula_id IN (SELECT id FROM matriculas WHERE aluno_id=?)`
    ).run(instante,dados.id);
    return alterou===1;
  }

  public ler(id: number, instante: string): boolean {
    return this.conexao.preparar<[string, string, number], never>(
      `UPDATE notificacoes SET lido_em=COALESCE(lido_em,?), atualizado_em=CASE WHEN lido_em IS NULL THEN ? ELSE atualizado_em END
       WHERE id=? AND canal='interno' AND data_alvo IS NOT NULL AND invalidado_em IS NULL`
    ).run(instante, instante, id).changes === 1;
  }
}
