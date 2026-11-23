import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import type { ContratoDadosAutenticacao, ContratoHashSenha, DadosAutenticacao, IdentidadeAutenticada } from '../src/main/seguranca/ContratosAutenticacao';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import { AutenticacaoService } from '../src/services/AutenticacaoService';
import { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

/** Dados exclusivamente sintéticos. Nunca imprimir credenciais, hashes ou erros brutos. */
export class VerificarAutenticacao {
  private readonly senha: string = 'Senha de teste 🔒 com espaços ';
  private readonly contexto = { webContentsId: 17 };
  private grupos: number = 0;

  public async executar(): Promise<void> {
    await this.verificarHash();
    await this.verificarServico();
    console.log(`OK: ${this.grupos} grupos de autenticação, sem sessão e sem banco persistente.`);
  }

  private async verificarHash(): Promise<void> {
    const hash = new HashSenhaArgon2();
    const primeiro = await hash.gerar(this.senha);
    const segundo = await hash.gerar(this.senha);
    assert.notEqual(primeiro, segundo);
    assert.notEqual(primeiro.split('$')[4], segundo.split('$')[4]);
    assert.match(primeiro, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(await hash.verificar(this.senha, primeiro), true);
    assert.equal(await hash.verificar('outra senha', primeiro), false);
    assert.equal(await hash.verificar(this.senha.trim(), primeiro), false);
    assert.equal(hash.necessitaAtualizacao(primeiro), false);
    const antigo = await argon2.hash(this.senha, { type: argon2.argon2id, memoryCost: 12288, timeCost: 3, parallelism: 1 });
    assert.equal(await hash.verificar(this.senha, antigo), true);
    assert.equal(hash.necessitaAtualizacao(antigo), true);
    this.ok('salt individual, PHC, senha correta/incorreta, sem trim e detecção de parâmetros antigos');

    const excessivo = primeiro.replace('m=19456', 'm=999999');
    for (const invalido of [null, undefined, {}, 1, '', 'senha em texto', '$2b$12$invalido', excessivo,
      primeiro.replace('argon2id', 'argon2i'), primeiro.replace('v=19', 'v=16'), `${primeiro}=`, primeiro.slice(0, -1)]) {
      assert.equal(await hash.verificar(this.senha, invalido), false);
      assert.equal(hash.necessitaAtualizacao(invalido), true);
    }
    for (const senha of [null, undefined, {}, 123, '', 'a'.repeat(1025), '🔒'.repeat(257), '\uD800', '\uDC00']) {
      await this.exigirErro(hash.gerar(senha), 'VALIDACAO');
      await this.exigirErro(hash.verificar(senha, primeiro), 'VALIDACAO');
    }
    const limite = '🔒'.repeat(256);
    assert.equal(await hash.verificar(limite, await hash.gerar(limite)), true);
    const unicode = await hash.gerar('é');
    assert.equal(await hash.verificar('e\u0301', unicode), false);
    this.ok('hashes inválidos/custos excessivos rejeitados, limite UTF-8 e ausência de normalização de senha');

    const falha = async (): Promise<never> => { throw new Error('SEGREDO_INTERNO'); };
    const motor = { hash: falha, verify: falha, needsRehash: (): never => { throw new Error('SEGREDO_INTERNO'); } };
    const quebrado = new HashSenhaArgon2(motor);
    await this.exigirErro(quebrado.gerar(this.senha), 'INTERNO');
    await this.exigirErro(quebrado.verificar(this.senha, primeiro), 'INTERNO');
    assert.throws((): void => { quebrado.necessitaAtualizacao(primeiro); }, (erro: unknown): boolean =>
      erro instanceof ErroAutenticacao && erro.codigo === 'INTERNO' && !erro.message.includes('SEGREDO'));
    this.ok('falhas criptográficas sanitizadas sem causa ou mensagem externa');
  }

  private async verificarServico(): Promise<void> {
    const hashReal = new HashSenhaArgon2();
    const codificado = await hashReal.gerar(this.senha);
    let usuario: DadosAutenticacao | undefined = { id: 1, nome: 'Pessoa Teste', perfil: 'admin', ativo: true, senhaHash: codificado, identidadeConta: 'a'.repeat(32), versaoCredencial: 1 };
    let atual: IdentidadeAutenticada | undefined = usuario;
    let consultas = 0;
    let verificacoes = 0;
    let geracoes = 0;
    let emailConsultado: string | undefined;
    const dados: ContratoDadosAutenticacao = {
      buscarPorEmail: async (email: string): Promise<DadosAutenticacao | undefined> => {
        consultas++; emailConsultado = email; return usuario;
      },
      buscarIdentidadePorId: async (): Promise<IdentidadeAutenticada | undefined> => atual
    };
    const hash: ContratoHashSenha = {
      gerar: async (senha: string): Promise<string> => { geracoes++; return hashReal.gerar(senha); },
      verificar: async (senha: string, digest: string): Promise<boolean> => {
        verificacoes++; return hashReal.verificar(senha, digest);
      },
      necessitaAtualizacao: (digest: string): boolean => hashReal.necessitaAtualizacao(digest)
    };
    const servico = new AutenticacaoService({ dados, hash });
    const credenciais = { email: '  PESSOA@EXAMPLE.INVALID ', senha: this.senha };
    const entradas = { ...credenciais };
    assert.deepEqual(await servico.entrar(credenciais, this.contexto), { id: 1, nome: 'Pessoa Teste', perfil: 'admin' });
    assert.equal(emailConsultado, 'pessoa@example.invalid');
    assert.deepEqual(credenciais, entradas);
    assert.equal('obterSessao' in servico, false);
    assert.equal('sair' in servico, false);
    assert.equal('sessoes' in servico, false);
    this.ok('normalização apenas de email, projeção explícita sem hash/credenciais e nenhuma sessão simulada');

    const anterior = verificacoes;
    const errado = await this.exigirErro(servico.entrar({ ...credenciais, senha: 'errada' }, this.contexto), 'NAO_AUTENTICADO');
    const original = usuario;
    usuario = undefined;
    const ausente = await this.exigirErro(servico.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    usuario = { ...original, ativo: false };
    const inativo = await this.exigirErro(servico.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    assert.deepEqual(errado.paraPublico(), ausente.paraPublico());
    assert.deepEqual(ausente.paraPublico(), inativo.paraPublico());
    assert.equal(verificacoes - anterior, 3);
    assert.equal(geracoes, 1);
    usuario = original;
    atual = { ...original, ativo: false };
    await this.exigirErro(servico.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    atual = undefined;
    await this.exigirErro(servico.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    atual = { ...original, perfil: 'recepcao' };
    assert.equal((await servico.entrar(credenciais, this.contexto)).perfil, 'recepcao');
    this.ok('ausente/inativo/senha incorreta indistinguíveis publicamente, hash fictício e releitura de atividade/perfil');

    const antes = consultas;
    let acessos = 0;
    const getter = Object.defineProperty({ senha: this.senha }, 'email', {
      enumerable: true, get: (): never => { acessos++; throw new Error('SEGREDO_INTERNO'); }
    });
    const proxy = new Proxy({}, { get: (): never => { acessos++; throw new Error('SEGREDO_INTERNO'); } });
    const revogado = Proxy.revocable({}, {}); revogado.revoke();
    for (const invalido of [null, undefined, [], 1, {}, { id: 1 }, getter, proxy, revogado.proxy,
      { ...credenciais, id: 1 }, { ...credenciais, perfil: 'admin' }, { ...credenciais, senha: '' },
      { ...credenciais, email: 'invalido' }, { ...credenciais, email: 'x'.repeat(255) },
      { ...credenciais, senha: 'x'.repeat(1025) }]) {
      await this.exigirErro(servico.entrar(invalido, this.contexto), 'VALIDACAO');
    }
    for (const contexto of [null, {}, { webContentsId: 0 }, { webContentsId: 1.5 },
      { webContentsId: Number.MAX_SAFE_INTEGER + 1 }, { webContentsId: 1, usuarioId: 1 }]) {
      await this.exigirErro(servico.entrar(credenciais, contexto), 'VALIDACAO');
    }
    assert.equal(acessos, 0);
    assert.equal(consultas, antes);
    this.ok('entradas/contextos inválidos rejeitados antes do banco, IDs/perfis extras, proxies e getters');

    const ausenteMesmoComHashVerdadeiro = new AutenticacaoService({
      dados: { ...dados, buscarPorEmail: async (): Promise<undefined> => undefined },
      hash: { ...hash, verificar: async (): Promise<boolean> => true }
    });
    await this.exigirErro(ausenteMesmoComHashVerdadeiro.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    let inicializacoes = 0;
    const concorrente = new AutenticacaoService({ dados, hash: {
      ...hash, gerar: async (senha: string): Promise<string> => { inicializacoes++; return hashReal.gerar(senha); }
    } });
    const resultados = await Promise.all([
      concorrente.entrar(credenciais, this.contexto), concorrente.entrar(credenciais, this.contexto)
    ]);
    assert.equal(inicializacoes, 1);
    assert.equal(resultados.length, 2);
    this.ok('conta ausente nunca autentica e chamadas concorrentes compartilham somente inicialização do hash fictício');

    const falha = async (): Promise<never> => { throw new Error('SEGREDO_INTERNO SQL senha_hash'); };
    const comFalha = new AutenticacaoService({ dados: { ...dados, buscarPorEmail: falha }, hash });
    await this.exigirErro(comFalha.entrar(credenciais, this.contexto), 'INTERNO');
    const hashFalha = new AutenticacaoService({ dados, hash: { ...hash, verificar: falha } });
    await this.exigirErro(hashFalha.entrar(credenciais, this.contexto), 'INTERNO');
    const inicializacaoFalha = new AutenticacaoService({ dados, hash: { ...hash, gerar: falha } });
    await this.exigirErro(inicializacaoFalha.entrar(credenciais, this.contexto), 'INTERNO');
    usuario = { ...original, senhaHash: 'hash corrompido' };
    await this.exigirErro(servico.entrar(credenciais, this.contexto), 'NAO_AUTENTICADO');
    this.ok('falhas de dados/hash/inicialização seguras e hash armazenado inválido sem autenticação');
  }

  private async exigirErro(operacao: Promise<unknown>, codigo: ErroAutenticacao['codigo']): Promise<ErroAutenticacao> {
    try { await operacao; } catch (erro: unknown) {
      assert.ok(erro instanceof ErroAutenticacao);
      assert.equal(erro.codigo, codigo);
      assert.deepEqual(Object.keys(erro.paraPublico()).sort(), ['codigo', 'mensagem']);
      assert.equal(Object.hasOwn(erro, 'cause'), false);
      assert.equal(JSON.stringify(erro.paraPublico()).includes(this.senha), false);
      assert.equal(JSON.stringify(erro.paraPublico()).includes('SEGREDO'), false);
      return erro;
    }
    throw new Error('A operação deveria rejeitar a entrada.');
  }

  private ok(descricao: string): void { this.grupos++; console.log(`OK: ${descricao}`); }
}

if (require.main === module) {
  void new VerificarAutenticacao().executar().catch((): void => {
    console.error('FALHA: verificações de autenticação. Detalhes sensíveis omitidos.');
    process.exitCode = 1;
  });
}
