import type { ContratoAutenticacaoService, DependenciasAutenticacao, ContratoHashSenha } from '../src/main/seguranca/ContratosAutenticacao';
import type { AutenticacaoService } from '../src/services/AutenticacaoService';
import type { HashSenhaArgon2 } from '../src/services/HashSenhaArgon2';

type Exigir<T extends true> = T;
type Igual<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
export type LimitesAutenticacao42 = [
  Exigir<AutenticacaoService extends Pick<ContratoAutenticacaoService, 'entrar'> ? true : false>,
  Exigir<HashSenhaArgon2 extends ContratoHashSenha ? true : false>,
  Exigir<Igual<keyof AutenticacaoService, 'entrar'>>,
  Exigir<Igual<keyof ConstructorParameters<typeof import('../src/services/AutenticacaoService').AutenticacaoService>[0], 'dados' | 'hash'>>,
  Exigir<Igual<Pick<DependenciasAutenticacao, 'dados' | 'hash'>['hash'], ContratoHashSenha>>
];
// @ts-expect-error A 4.2 não implementa consulta de sessão.
type SessaoNaoImplementada = AutenticacaoService['obterSessao'];
// @ts-expect-error A 4.2 não implementa logout.
type LogoutNaoImplementado = AutenticacaoService['sair'];
