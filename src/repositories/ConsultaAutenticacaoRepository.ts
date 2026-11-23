import type { Conexao } from '../database/Conexao';
import type { ContratoDadosAutenticacao, DadosAutenticacao, IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import type { RegistroUsuarioAutenticacao } from '../models/RegistroUsuarioAutenticacao';
import { BaseRepository } from './BaseRepository';
import { ErroRepository } from './ErroRepository';

/** Adaptador somente de consulta; não oferece CRUD de usuários nesta etapa. */
export class ConsultaAutenticacaoRepository extends BaseRepository<RegistroUsuarioAutenticacao>
  implements ContratoDadosAutenticacao {
  public constructor(conexao: Conexao) {
    super(conexao, {
      tabela: 'usuarios',
      colunas: {
        id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
        nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        email: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        senha_hash: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        perfil: { tipo: 'TEXT', anulavel: false, atualizavel: true },
        ativo: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
        criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
        atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
      }
    });
  }

  public async buscarPorEmail(emailNormalizado: string): Promise<DadosAutenticacao | undefined> {
    try {
      const linha = this.conexao.preparar<[string], Pick<RegistroUsuarioAutenticacao, 'id' | 'nome' | 'perfil' | 'ativo' | 'senha_hash'> & { identidade_conta: string; versao_credencial: number }>(
        'SELECT id, nome, perfil, ativo, senha_hash, identidade_conta, versao_credencial FROM usuarios WHERE email = ?'
      ).get(emailNormalizado);
      if (linha === undefined) return undefined;
      return { id: linha.id, nome: linha.nome, perfil: linha.perfil, ativo: linha.ativo === 1,
        senhaHash: linha.senha_hash, identidadeConta: linha.identidade_conta, versaoCredencial: linha.versao_credencial };
    } catch {
      throw new ErroRepository('INTERNO');
    }
  }

  public async buscarIdentidadePorId(usuarioId: number): Promise<IdentidadeAutenticada | undefined> {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) throw new ErroRepository('ENTRADA_INVALIDA');
    try {
      const linha = this.conexao.preparar<[number], Pick<RegistroUsuarioAutenticacao, 'id' | 'nome' | 'perfil' | 'ativo'> & { identidade_conta: string; versao_credencial: number }>(
        'SELECT id, nome, perfil, ativo, identidade_conta, versao_credencial FROM usuarios WHERE id = ?'
      ).get(usuarioId);
      if (linha === undefined) return undefined;
      return { id: linha.id, nome: linha.nome, perfil: linha.perfil, ativo: linha.ativo === 1,
        identidadeConta: linha.identidade_conta, versaoCredencial: linha.versao_credencial };
    } catch {
      throw new ErroRepository('INTERNO');
    }
  }

  // Evita habilitar por herança mutações ou leituras genéricas com hash.
  public override create(): never { throw new ErroRepository('CONFIGURACAO_INVALIDA'); }
  public override update(): never { throw new ErroRepository('CONFIGURACAO_INVALIDA'); }
  public override delete(): never { throw new ErroRepository('CONFIGURACAO_INVALIDA'); }
  public override findById(): never { throw new ErroRepository('CONFIGURACAO_INVALIDA'); }
  public override findAll(): never { throw new ErroRepository('CONFIGURACAO_INVALIDA'); }
}
