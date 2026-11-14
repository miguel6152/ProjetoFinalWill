import { types } from 'node:util';
import { z } from 'zod';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';

/** Entradas locais também podem chegar de código JS, não somente de IPC. */
export class ValidacaoAutenticacao {
  public static readonly senha = z.string().min(1).max(1024).refine(
    (valor: string): boolean => Buffer.byteLength(valor, 'utf8') <= 1024
      && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(valor)
  );
  public static readonly email = z.string().max(254).trim().toLowerCase().email();
  public static readonly credenciais = z.object({
    email: ValidacaoAutenticacao.email,
    senha: ValidacaoAutenticacao.senha
  }).strict();
  public static readonly contexto = z.object({ webContentsId: z.number().int().positive().safe() }).strict();
  public static readonly identidade = z.object({
    id: z.number().int().positive().safe(),
    nome: z.string().min(1),
    perfil: z.enum(['admin', 'recepcao', 'instrutor']),
    ativo: z.boolean()
  });
  public static readonly dados = ValidacaoAutenticacao.identidade.extend({ senhaHash: z.string().max(512) });

  /** Não executar getters, proxies ou coerções antes da validação zod. */
  public static exigirObjetoPlano(valor: unknown, chaves: readonly string[]): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) {
      throw new ErroAutenticacao('VALIDACAO');
    }
    const prototipo: unknown = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) throw new ErroAutenticacao('VALIDACAO');
    const descritores = Object.getOwnPropertyDescriptors(valor);
    const presentes = Reflect.ownKeys(descritores);
    if (presentes.length !== chaves.length) throw new ErroAutenticacao('VALIDACAO');
    for (const chave of presentes) {
      const descritor = typeof chave === 'string' ? descritores[chave] : undefined;
      if (typeof chave !== 'string' || !chaves.includes(chave) || descritor === undefined
          || !Object.hasOwn(descritor, 'value') || !descritor.enumerable) {
        throw new ErroAutenticacao('VALIDACAO');
      }
    }
  }
}
