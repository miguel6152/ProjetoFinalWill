import type { Conexao } from '../database/Conexao';
import type { RegistroUsuarioAutenticacao } from '../models/RegistroUsuarioAutenticacao';
import type { UsuarioDto, EntradaLista, Pagina } from '../shared/ipc/ContratoIpc';
import { BaseRepository } from './BaseRepository';

/** Escritas internas recebem somente hash gerado no Main; leituras administrativas não selecionam hash. */
export class UsuarioRepository extends BaseRepository<RegistroUsuarioAutenticacao> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'usuarios', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      email: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      senha_hash: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      perfil: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      ativo: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
    } });
  }

  public atomico<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T { return this.conexao.transacao(operacao); }

  public obterPublico(id: number): UsuarioDto | undefined {
    return this.conexao.preparar<[number], UsuarioDto>(
      'SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios WHERE id = ?').get(id);
  }

  public identidadeConta(id: number): string | undefined {
    return this.conexao.preparar<[number], { identidade_conta: string }>('SELECT identidade_conta FROM usuarios WHERE id = ?').get(id)?.identidade_conta;
  }

  public totalUsuarios(): number {
    const total = this.conexao.preparar<[], { total: number }>('SELECT COUNT(*) AS total FROM usuarios').get()?.total;
    if (total === undefined) throw new Error('Contagem indisponível.');
    return total;
  }

  public versaoCredencial(id: number): number | undefined {
    return this.conexao.preparar<[number], { versao_credencial: number }>(
      'SELECT versao_credencial FROM usuarios WHERE id = ?').get(id)?.versao_credencial;
  }

  public listarPublico(entrada: EntradaLista): Pagina<UsuarioDto> {
    const busca = entrada.busca ?? '';
    const filtro = ' WHERE instr(lower(nome), lower(?)) > 0 OR instr(email, lower(?)) > 0';
    const total = this.conexao.preparar<[string, string], { total: number }>('SELECT COUNT(*) AS total FROM usuarios' + filtro).get(busca, busca)?.total;
    if (total === undefined) throw new Error('Contagem indisponível.');
    const itens = this.conexao.preparar<[string, string, number, number], UsuarioDto>(
      'SELECT id, nome, email, perfil, ativo, criado_em, atualizado_em FROM usuarios' + filtro + ' ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(busca, busca, entrada.tamanho, (entrada.pagina - 1) * entrada.tamanho);
    return { itens, total, pagina: entrada.pagina, tamanho: entrada.tamanho };
  }

  public contarAdministradores(): number {
    return this.conexao.preparar<[], { total: number }>("SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'admin' AND ativo = 1").get()?.total ?? 0;
  }

  public possuiInstrutor(id: number): boolean {
    return this.conexao.preparar<[number], { id: number }>('SELECT id FROM instrutores WHERE usuario_id = ?').get(id) !== undefined;
  }
}
