import { z } from 'zod';

export type RespostaEntrega =
  | { estado: 'enviado'; mensagem_id: string }
  | { estado: 'simulado' }
  | { estado: 'incerto'; motivo: string }
  | { estado: 'falhou'; motivo: string; espera_segundos?: number };

const sucesso = z.object({ ok: z.literal(true), result: z.object({
  message_id: z.number().int().positive(), chat: z.object({ id: z.number().int().positive(), type: z.literal('private') })
}) });
const recusa = z.object({ ok: z.literal(false), error_code: z.number().int(),
  parameters: z.object({ retry_after: z.number().int().nonnegative().max(2147483647).optional() }).optional()
});

export class TelegramCliente {
  public constructor(private readonly token: string | undefined, private readonly requisitar: typeof fetch = fetch,
    private readonly timeoutMs = 8000) {}

  public get configurado(): boolean { return !!this.token && /^\d+:[\w-]+$/.test(this.token); }

  public async enviar(chat: string, texto: string): Promise<RespostaEntrega> {
    if (!this.configurado) return { estado: 'falhou', motivo: 'Token do bot ausente ou inválido.' };
    try {
      const resposta = await this.requisitar(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs), body: JSON.stringify({ chat_id: chat, text: texto })
      });
      const json: unknown = await resposta.json();
      const mensagem = sucesso.safeParse(json);
      if (resposta.ok && mensagem.success && String(mensagem.data.result.chat.id) === chat) {
        return { estado: 'enviado', mensagem_id: String(mensagem.data.result.message_id) };
      }
      const erro = recusa.safeParse(json);
      if (!erro.success || resposta.status !== erro.data.error_code) return { estado: 'incerto', motivo: 'Resposta sem confirmação válida.' };
      const codigo = erro.data.error_code;
      if (codigo === 429) return { estado: 'falhou', motivo: 'Limite de requisições.', espera_segundos: erro.data.parameters?.retry_after ?? 60 };
      if (codigo >= 500) return { estado: 'falhou', motivo: 'Serviço temporariamente indisponível.', espera_segundos: 60 };
      if (codigo === 403) return { estado: 'falhou', motivo: 'Bot bloqueado ou acesso recusado.' };
      if (codigo === 401) return { estado: 'falhou', motivo: 'Token recusado pelo Telegram.' };
      return { estado: 'falhou', motivo: 'Pedido recusado. Confira o vínculo com o chat privado.' };
    } catch {
      return { estado: 'incerto', motivo: 'A conexão terminou sem confirmação do Telegram.' };
    }
  }
}
