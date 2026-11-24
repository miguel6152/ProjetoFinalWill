import { z } from 'zod';
import { types } from 'node:util';
import { ErroAluno } from './ErroAluno';

export class ValidacaoAluno {
  public static readonly id = z.object({ id: z.number().int().positive().safe() }).strict();
  public static readonly alvo = this.id.extend({ referencia: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
  private static readonly texto = z.string().trim().min(1, 'Campo obrigatório.').max(120);
  public static readonly criar = z.object({
    nome: this.texto.min(3, 'Informe o nome completo.'),
    cpf: z.string().trim().regex(/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/, 'CPF inválido.')
      .transform(v => v.replace(/\D/g, '')).refine(v => this.cpfValido(v), 'CPF inválido.'),
    data_nascimento: z.string().refine(v => this.dataValida(v), 'Data de nascimento inválida ou futura.'),
    email: z.string().trim().toLowerCase().max(254).email('E-mail inválido.').nullable(),
    telefone: z.string().trim().regex(/^[\d\s()+-]+$/, 'Telefone inválido.').transform(v => v.replace(/\D/g, ''))
      .refine(v => v.length >= 10 && v.length <= 13, 'Informe telefone com DDD.').nullable(),
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP deve ter oito dígitos.').transform(v => v.replace('-', '')),
    logradouro: this.texto, numero: z.string().trim().min(1).max(20),
    complemento: z.string().trim().min(1).max(120).nullable(), bairro: this.texto, cidade: this.texto,
    uf: z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']),
    ativo: z.union([z.literal(0), z.literal(1)])
  }).strict();
  public static readonly atualizar = this.alvo.extend({
    alteracoes: this.criar.partial().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')
  }).strict();
  public static readonly lista = z.object({
    pagina: z.number().int().positive().safe(), tamanho: z.number().int().min(1).max(100),
    busca: z.string().trim().max(100).optional()
  }).strict().refine(v => Number.isSafeInteger((v.pagina - 1) * v.tamanho));

  /** Não executa getters; rejeita undefined explícito e patches recursivos. */
  public static objeto(valor: unknown, profundidade: number = 0): void {
    if (valor === null || typeof valor !== 'object' || types.isProxy(valor) || Array.isArray(valor)) throw new ErroAluno('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) throw new ErroAluno('VALIDACAO');
    for (const chave of Reflect.ownKeys(valor)) {
      const d = Object.getOwnPropertyDescriptor(valor, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroAluno('VALIDACAO');
      if (chave === 'alteracoes') {
        if (profundidade !== 0) throw new ErroAluno('VALIDACAO');
        this.objeto(d.value, 1);
      }
    }
  }

  private static cpfValido(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const tamanho of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
      const digito = (soma * 10) % 11;
      if ((digito === 10 ? 0 : digito) !== Number(cpf[tamanho])) return false;
    }
    return true;
  }

  private static dataValida(valor: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < '0001-01-01') return false;
    const data = new Date(`${valor}T12:00:00Z`), hoje = new Date();
    const dataLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor && valor <= dataLocal;
  }
}
