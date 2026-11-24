export interface Notificacao {
  id: number;
  matricula_id: number;
  tipo: string;
  canal: string;
  chave_deduplicacao: string;
  agendada_para: string;
  enviada_em: string | null;
  situacao: string;
  tentativas: number;
  proxima_tentativa_em: string | null;
  mensagem_id_externo: string | null;
  erro_codigo: string | null;
  criado_em: string;
  atualizado_em: string;
  data_alvo: string | null;
  antecedencia_dias: number | null;
  lido_em: string | null;
  invalidado_em: string | null;
}
