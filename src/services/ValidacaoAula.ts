import { z } from 'zod';
import { types } from 'node:util';
import { ErroAula } from './ErroAula';

export class ValidacaoAula {
  public static readonly criar = z.object({
    instrutor_id: z.number().int().positive().safe(),
    modalidade: z.enum(['musculacao','funcional','danca']),
    inicio_em: z.iso.datetime(), fim_em: z.iso.datetime(),
    capacidade: z.number().int().positive().safe(),
    situacao: z.enum(['agendada','cancelada','concluida']),
    local: z.string().trim().min(1).max(200),
    ao_ar_livre: z.union([z.literal(0), z.literal(1)]),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable()
  }).strict();
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
  public static readonly atualizar = this.alvo.extend({
    alteracoes: this.criar.partial().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')
  }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    inicio: z.iso.datetime().optional(), fim: z.iso.datetime().optional(), instrutor_id: z.number().int().positive().safe().optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroAula('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroAula('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroAula('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroAula('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
