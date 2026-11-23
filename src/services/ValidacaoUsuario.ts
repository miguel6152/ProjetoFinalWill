import { z } from 'zod';
import { types } from 'node:util';
import { ValidacaoAutenticacao } from './ValidacaoAutenticacao';
import { ErroUsuario } from './ErroUsuario';

export class ValidacaoUsuario {
  public static readonly novaSenha = ValidacaoAutenticacao.senha.refine(valor => Array.from(valor).length >= 15);
  private static readonly campos = z.object({
    nome: z.string().trim().min(1).max(120), email: ValidacaoAutenticacao.email,
    perfil: z.enum(['admin', 'recepcao', 'instrutor']), ativo: z.union([z.literal(0), z.literal(1)])
  }).strict();
  public static readonly criar = this.campos.extend({ senha: this.novaSenha }).strict();
  public static readonly provisionar = this.criar.pick({ nome: true, email: true, senha: true }).strict();
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/).optional() }).strict();
  public static readonly atualizar = this.alvo.extend({ alteracoes: this.campos.partial().refine(v => Object.keys(v).length > 0) }).strict();
  public static readonly senha = this.alvo.extend({ senha: this.novaSenha }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    busca: z.string().trim().max(100).optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  /** Inspeciona descritores sem executar getters nem coerções, inclusive no patch. */
  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroUsuario('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroUsuario('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable) throw new ErroUsuario('VALIDACAO');
      if (d.value === undefined) throw new ErroUsuario('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroUsuario('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }
}
