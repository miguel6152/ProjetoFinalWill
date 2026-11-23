import * as argon2 from 'argon2';
import { z } from 'zod';
import type { ContratoHashSenha } from '../main/seguranca/ContratosAutenticacao';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';
import { ValidacaoAutenticacao } from './ValidacaoAutenticacao';

export class HashSenhaArgon2 implements ContratoHashSenha {
  private static concorrentes = 0;
  private static readonly maximoConcorrentes = 4;
  public constructor(private readonly biblioteca: Pick<typeof argon2, 'hash' | 'verify' | 'needsRehash'> = argon2) {}

  private readonly opcoes = Object.freeze({
    type: argon2.argon2id, version: 0x13, memoryCost: 19456,
    timeCost: 2, parallelism: 1, hashLength: 32
  });

  public async gerar(senha: unknown): Promise<string> {
    const entrada = ValidacaoAutenticacao.senha.safeParse(senha);
    if (!entrada.success) throw new ErroAutenticacao('VALIDACAO');
    try {
      // node-argon2 gera salt criptográfico aleatório de 16 bytes por chamada.
      return await this.executar(() => this.biblioteca.hash(entrada.data, this.opcoes));
    } catch (erro: unknown) {
      if (erro instanceof ErroAutenticacao && erro.codigo === 'SEM_PERMISSAO') throw erro;
      throw new ErroAutenticacao('INTERNO');
    }
  }

  public async verificar(senha: unknown, hashCodificado: unknown): Promise<boolean> {
    const entrada = ValidacaoAutenticacao.senha.safeParse(senha);
    if (!entrada.success) throw new ErroAutenticacao('VALIDACAO');
    if (!this.hashAceitavel(hashCodificado)) return false;
    try {
      // A biblioteca verifica o hash e usa comparação resistente a diferenças de tempo.
      return await this.executar(() => this.biblioteca.verify(hashCodificado, entrada.data));
    } catch (erro: unknown) {
      if (erro instanceof ErroAutenticacao && erro.codigo === 'SEM_PERMISSAO') throw erro;
      // Um PHC estruturalmente aceito que falha na biblioteca é erro interno.
      throw new ErroAutenticacao('INTERNO');
    }
  }

  public necessitaAtualizacao(hashCodificado: unknown): boolean {
    if (!this.hashAceitavel(hashCodificado)) return true;
    try {
      const partes = hashCodificado.split('$');
      return this.biblioteca.needsRehash(hashCodificado, this.opcoes)
        || Buffer.from(partes[4] ?? '', 'base64').length !== 16
        || Buffer.from(partes[5] ?? '', 'base64').length !== 32;
    } catch {
      throw new ErroAutenticacao('INTERNO');
    }
  }

  private async executar<T>(operacao: () => Promise<T>): Promise<T> {
    if (HashSenhaArgon2.concorrentes >= HashSenhaArgon2.maximoConcorrentes) throw new ErroAutenticacao('SEM_PERMISSAO');
    HashSenhaArgon2.concorrentes++;
    try { return await operacao(); }
    finally { HashSenhaArgon2.concorrentes--; }
  }

  /** Limita recursos antes de entregar parâmetros PHC à biblioteca nativa.
   * Não implementa criptografia nem compara senhas/hash manualmente.
   */
  private hashAceitavel(valor: unknown): valor is string {
    const entrada = z.string().max(512).safeParse(valor);
    if (!entrada.success) return false;
    const partes = /^\$argon2id\$v=19\$m=([1-9][0-9]{0,5}),t=([1-4]),p=([1-4])\$([A-Za-z0-9+/]{22,43})\$([A-Za-z0-9+/]{43,86})$/.exec(entrada.data);
    if (partes === null) return false;
    const memoria = Number(partes[1]);
    const paralelismo = Number(partes[3]);
    if (memoria < 8 * paralelismo || memoria > 65536) return false;
    for (const indice of [4, 5]) {
      const texto = partes[indice] ?? '';
      const bytes = Buffer.from(texto, 'base64');
      if (bytes.toString('base64').replace(/=+$/, '') !== texto) return false;
      if (indice === 4 && (bytes.length < 16 || bytes.length > 32)) return false;
      if (indice === 5 && (bytes.length < 32 || bytes.length > 64)) return false;
    }
    return true;
  }
}
