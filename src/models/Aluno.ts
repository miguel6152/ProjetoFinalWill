import type { NovoAluno } from '../shared/tipos/Aluno';

/** Linha interna; dados de notificação são preservados, sem edição neste módulo. */
export interface Aluno extends NovoAluno {
  id: number;
  telegram_chat_id: string | null;
  autorizado_notificar_em: string | null;
  criado_em: string;
  atualizado_em: string;
}
