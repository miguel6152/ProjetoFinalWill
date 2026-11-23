import assert from 'node:assert/strict';
import { ErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';
import type { CodigoErroAutenticacao } from '../src/main/seguranca/ErroAutenticacao';

class VerificarContratosAutenticacao {
  public executar(): void {
    const mensagens: Record<CodigoErroAutenticacao, string> = {
      VALIDACAO: 'Dados de autenticação inválidos.',
      NAO_AUTENTICADO: 'Não foi possível autenticar a sessão.',
      SEM_PERMISSAO: 'Operação não permitida.',
      INTERNO: 'Não foi possível concluir a autenticação.'
    };
    for (const codigo of ['VALIDACAO', 'NAO_AUTENTICADO', 'SEM_PERMISSAO', 'INTERNO'] as const) {
      const erro = new ErroAutenticacao(codigo);
      assert.ok(erro instanceof Error);
      assert.equal(erro.name, 'ErroAutenticacao');
      assert.equal(Object.hasOwn(erro, 'cause'), false);
      assert.deepEqual(erro.paraPublico(), { codigo, mensagem: mensagens[codigo] });
      assert.deepEqual(Object.keys(erro.paraPublico()).sort(), ['codigo', 'mensagem']);
    }
    let chamadas = 0;
    const objeto = { toString: (): never => { chamadas++; throw new Error('não converter'); } };
    const acessor = Object.defineProperty({}, 'codigo', { get: (): never => { chamadas++; throw new Error('não ler'); } });
    const proxy = new Proxy({}, { get: (): never => { chamadas++; throw new Error('não acessar'); } });
    const revogado = Proxy.revocable({}, {});
    revogado.revoke();
    for (const invalido of [objeto, acessor, proxy, revogado.proxy, null, undefined, 1, false,
      [], ['NAO_AUTENTICADO'], new String('VALIDACAO'), Symbol('INTERNO'), 'USUARIO_INEXISTENTE', 'SELECT senha_hash']) {
      assert.deepEqual(new ErroAutenticacao(invalido).paraPublico(), {
        codigo: 'INTERNO', mensagem: mensagens.INTERNO
      });
    }
    assert.equal(chamadas, 0);
    console.log('OK: contratos de erros de autenticação; quatro códigos, fallback sem coerção e projeção sem stack/cause. Nenhum banco ou login executado.');
  }
}
new VerificarContratosAutenticacao().executar();
