import { z } from 'zod';
import { types } from 'node:util';
import { ErroPlano } from './ErroPlano';

export class ValidacaoPlano {
  public static readonly criar = z.object({
    nome: z.string().trim().min(1, 'Informe o nome do plano.').max(120),
    duracao_meses: z.union([z.literal(1), z.literal(3), z.literal(12)]),
    valor_centavos: z.number().int().min(0, 'O valor não pode ser negativo.').safe(),
    ativo: z.union([z.literal(0), z.literal(1)])
  }).strict();
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
  public static readonly atualizar = this.alvo.extend({
    alteracoes: this.criar.partial().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')
  }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    busca: z.string().trim().max(100).optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroPlano('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroPlano('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroPlano('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroPlano('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
