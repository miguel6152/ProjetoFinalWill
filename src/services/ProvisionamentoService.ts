import type { ContratoHashSenha, ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { LimitadorLogin } from '../main/seguranca/LimitadorLogin';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { ValidacaoUsuario } from './ValidacaoUsuario';
import { ErroUsuario } from './ErroUsuario';

/** Inicialização local, uma única vez: nunca recupera contas por ausência de admin. */
export class ProvisionamentoService {
  public constructor(private readonly repository: UsuarioRepository, private readonly hash: ContratoHashSenha,
    private readonly limitador: LimitadorLogin = new LimitadorLogin()) {}

  public estado(): { necessario: boolean } {
    return { necessario: this.repository.totalUsuarios() === 0 };
  }

  public async criarAdministrador(entrada: unknown, conferir: () => void, contexto: ContextoSessao): Promise<{ criado: true }> {
    conferir();
    ValidacaoUsuario.objeto(entrada);
    const validada = ValidacaoUsuario.provisionar.safeParse(entrada);
    if (!validada.success) throw new ErroUsuario('VALIDACAO');
    if (!this.estado().necessario) throw new ErroUsuario('CONFLITO');
    const liberar = this.limitador.admitir(contexto);
    try {
      const senhaHash = await this.hash.gerar(validada.data.senha);
      return this.repository.atomico<{ criado: true }>(() => {
      conferir();
      // Duas janelas/conexões podem aguardar hash: somente uma cria o primeiro usuário.
      if (this.repository.totalUsuarios() !== 0) throw new ErroUsuario('CONFLITO');
      this.repository.create({ nome: validada.data.nome, email: validada.data.email,
        senha_hash: senhaHash, perfil: 'admin', ativo: 1 });
      return { criado: true };
      });
    } finally { liberar(); }
  }
}
