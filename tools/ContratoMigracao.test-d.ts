import type { ContextoMigracao, Migracao } from '../src/database/Migracao';

type ExigirVerdade<T extends true> = T;
type Aplicar = Migracao['aplicar'];

// Estes testes são executados pelo compilador, sem código de runtime.
export type ContratosSincronos = [
  ExigirVerdade<((contexto: ContextoMigracao) => undefined) extends Aplicar ? true : false>,
  ExigirVerdade<((contexto: ContextoMigracao) => void) extends Aplicar ? false : true>,
  ExigirVerdade<((contexto: ContextoMigracao) => Promise<undefined>) extends Aplicar ? false : true>,
  ExigirVerdade<((contexto: ContextoMigracao) => PromiseLike<undefined>) extends Aplicar ? false : true>,
  ExigirVerdade<((contexto: ContextoMigracao) => undefined | Promise<undefined>) extends Aplicar ? false : true>,
  ExigirVerdade<'preparar' extends keyof ContextoMigracao ? false : true>,
  ExigirVerdade<'fechar' extends keyof ContextoMigracao ? false : true>
];
