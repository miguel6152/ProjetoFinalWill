import { z } from 'zod';
import { types } from 'node:util';
import { ErroAvaliacao } from './ErroAvaliacao';

export class ValidacaoAvaliacao {
  public static readonly criar = z.object({
    aluno_id:z.number().int().positive().safe(), instrutor_id:z.number().int().positive().safe().optional(),
    realizada_em:z.iso.date(), peso_kg:z.number().positive(), altura_cm:z.number().positive(),
    cintura_cm:z.number().positive().nullable().optional(), quadril_cm:z.number().positive().nullable().optional(),
    braco_cm:z.number().positive().nullable().optional(), coxa_cm:z.number().positive().nullable().optional(),
    observacoes:z.string().trim().max(2000).nullable().optional()
  }).strict();
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
  public static readonly atualizar = this.alvo.extend({
    alteracoes: this.criar.partial().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')
  }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    aluno_id:z.number().int().positive().safe().optional(), inicio:z.iso.date().optional(), fim:z.iso.date().optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroAvaliacao('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroAvaliacao('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroAvaliacao('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroAvaliacao('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
