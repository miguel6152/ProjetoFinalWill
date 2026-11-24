import { z } from 'zod';
import { types } from 'node:util';
import type { EnderecoDto } from '../shared/tipos/Endereco';
import { ErroEndereco } from './ErroEndereco';

export class ViaCepService {
  private static readonly entrada = z.object({
    cep: z.string().trim().regex(/^(\d{8}|\d{5}-\d{3})$/).transform(v => v.replace('-', ''))
  }).strict();
  private static readonly resposta = z.object({
    cep: z.string().regex(/^(\d{8}|\d{5}-\d{3})$/).transform(v => v.replace('-', '')),
    logradouro: z.string().trim().max(120).optional().default(''),
    bairro: z.string().trim().max(120).optional().default(''),
    localidade: z.string().trim().max(120).optional().default(''),
    uf: z.union([z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']), z.literal('')]).optional().default(''),
    erro: z.literal(false).optional()
  }).refine(v => [v.logradouro, v.bairro, v.localidade, v.uf].some(campo => campo !== ''));

  /** Transporte e prazo são injetáveis exclusivamente pelo Main/testes, nunca pelo IPC. */
  public constructor(private readonly requisitar: typeof fetch = fetch, private readonly limiteMs: number = 8000) {
    if (!Number.isSafeInteger(limiteMs) || limiteMs < 1 || limiteMs > 30000) throw new Error('Prazo de consulta inválido.');
  }

  public async consultar(entrada: unknown): Promise<EnderecoDto> {
    this.validarObjeto(entrada);
    const dados = ViaCepService.entrada.safeParse(entrada);
    if (!dados.success) throw new ErroEndereco('VALIDACAO');
    const controle = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<never>((_resolver, rejeitar) => {
      temporizador = setTimeout(() => {
        rejeitar(new ErroEndereco('TIMEOUT')); controle.abort();
      }, this.limiteMs);
    });
    try {
      return await Promise.race([this.obter(dados.data.cep, controle.signal), prazo]);
    } catch (erro: unknown) {
      if (erro instanceof ErroEndereco) throw erro;
      throw new ErroEndereco('REDE');
    } finally {
      if (temporizador !== undefined) clearTimeout(temporizador);
      controle.abort();
    }
  }

  private async obter(cep: string, signal: AbortSignal): Promise<EnderecoDto> {
    const resposta = await this.requisitar(`https://viacep.com.br/ws/${cep}/json/`, {
      signal, redirect: 'error', headers: { Accept: 'application/json' }
    });
    if (!resposta.ok) { await resposta.body?.cancel(); throw new ErroEndereco('INDISPONIVEL'); }
    let json: unknown;
    try { json = await resposta.json(); }
    catch { throw new ErroEndereco('RESPOSTA_INVALIDA'); }
    if (z.object({ erro: z.union([z.literal(true), z.literal('true')]) }).safeParse(json).success) throw new ErroEndereco('NAO_ENCONTRADO');
    const validada = ViaCepService.resposta.safeParse(json);
    if (!validada.success || validada.data.cep !== cep) throw new ErroEndereco('RESPOSTA_INVALIDA');
    return { cep, logradouro: validada.data.logradouro, bairro: validada.data.bairro,
      cidade: validada.data.localidade, uf: validada.data.uf };
  }

  private validarObjeto(entrada: unknown): void {
    if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada) || types.isProxy(entrada)) throw new ErroEndereco('VALIDACAO');
    const proto: unknown = Object.getPrototypeOf(entrada);
    if (proto !== Object.prototype && proto !== null) throw new ErroEndereco('VALIDACAO');
    for (const chave of Reflect.ownKeys(entrada)) {
      const d = Object.getOwnPropertyDescriptor(entrada, chave);
      if (typeof chave !== 'string' || d === undefined || !Object.hasOwn(d, 'value') || !d.enumerable || d.value === undefined) throw new ErroEndereco('VALIDACAO');
    }
  }
}
