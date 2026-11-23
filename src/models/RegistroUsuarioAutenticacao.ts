import type { RegistroPersistido } from '../repositories/TiposRepository';
import type { Perfil } from '../shared/tipos/Autenticacao';

/** Linha SQLite interna; não é DTO nem contrato do CRUD futuro. */
export interface RegistroUsuarioAutenticacao extends RegistroPersistido {
  nome: string;
  email: string;
  senha_hash: string;
  perfil: Perfil;
  ativo: number;
}
