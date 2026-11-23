import type { ContratoIpc, UsuarioDto } from '../src/shared/ipc/ContratoIpc';
type Exigir<T extends true> = T;
export type FronteirasUsuarios = [
  Exigir<'senha' extends keyof ContratoIpc['usuarios:atualizar']['entrada']['alteracoes'] ? false : true>,
  Exigir<'senha_hash' extends keyof UsuarioDto ? false : true>,
  Exigir<'senha' extends keyof UsuarioDto ? false : true>,
  Exigir<'identidadeConta' extends keyof UsuarioDto ? false : true>,
  Exigir<'versaoCredencial' extends keyof UsuarioDto ? false : true>
];
// @ts-expect-error Senha pertence ao canal próprio.
const patch: ContratoIpc['usuarios:atualizar']['entrada'] = { id: 1, alteracoes: { senha: 'sintética' } };
// @ts-expect-error Hash nunca é aceito no canal de alteração de senha.
const senha: ContratoIpc['usuarios:alterar-senha']['entrada'] = { id: 1, senha_hash: 'não aceito' };
