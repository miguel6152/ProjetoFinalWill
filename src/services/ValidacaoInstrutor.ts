import { z } from 'zod';
import { types } from 'node:util';
import { ErroInstrutor } from './ErroInstrutor';

export class ValidacaoInstrutor {
  public static readonly criar = z.object({
    nome: z.string().trim().min(1, 'Informe o nome do instrutor.').max(120),
    usuario_id: z.number().int().positive().safe(),
    email: z.email().max(254),
    telefone: z.string().trim().min(1).max(30),
    especialidade: z.string().trim().min(1).max(120),
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
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroInstrutor('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroInstrutor('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroInstrutor('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroInstrutor('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
