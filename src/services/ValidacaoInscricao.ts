import { z } from 'zod';
import { types } from 'node:util';
import { ErroInscricao } from './ErroInscricao';

export class ValidacaoInscricao {
  public static readonly criar = z.object({
    aula_id:z.number().int().positive().safe(), aluno_id:z.number().int().positive().safe(),
    situacao:z.enum(['ativa','cancelada']), presenca:z.enum(['nao_registrada','presente','ausente'])
  }).strict();
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
  public static readonly atualizar = this.alvo.extend({
    alteracoes: this.criar.partial().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')
  }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    aula_id:z.number().int().positive().safe().optional(), aluno_id:z.number().int().positive().safe().optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroInscricao('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroInscricao('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroInscricao('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroInscricao('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
