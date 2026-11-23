import type { Conexao } from '../database/Conexao';
import type { Instrutor } from '../models/Instrutor';
import type { EntradaLista, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';
import { ErroRepository } from './ErroRepository';

export class InstrutorRepository extends BaseRepository<Instrutor> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'instrutores', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      usuario_id: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      email: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      telefone: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      especialidade: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      ativo: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
    } });
  }

  public atomico<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T { return this.conexao.transacao(operacao); }

  public atorAtual(id: number): IdentidadeAutenticada | undefined {
    const linha = this.conexao.preparar<[number], { id: number; nome: string; perfil: IdentidadeAutenticada['perfil']; ativo: number; identidade_conta: string; versao_credencial: number }>(
      'SELECT id,nome,perfil,ativo,identidade_conta,versao_credencial FROM usuarios WHERE id = ?').get(id);
    return linha === undefined ? undefined : { id: linha.id, nome: linha.nome, perfil: linha.perfil, ativo: linha.ativo === 1,
      identidadeConta: linha.identidade_conta, versaoCredencial: linha.versao_credencial };
  }

  public listar(entrada: EntradaLista, usuarioId: number | null): Pagina<Instrutor> {
    const busca = entrada.busca ?? '';
    const total = this.conexao.preparar<[string, number | null, number | null], { total: number }>(
      'SELECT COUNT(*) AS total FROM instrutores WHERE instr(lower(nome),lower(?)) > 0 AND (? IS NULL OR usuario_id = ?)').get(busca, usuarioId, usuarioId)?.total;
    if (total === undefined) throw new ErroRepository('INTERNO');
    const itens = this.conexao.preparar<[string, number | null, number | null, number, number], Instrutor>(
      'SELECT id,nome,usuario_id,email,telefone,especialidade,ativo,criado_em,atualizado_em FROM instrutores WHERE instr(lower(nome),lower(?)) > 0 AND (? IS NULL OR usuario_id = ?) ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(busca, usuarioId, usuarioId, entrada.tamanho, (entrada.pagina - 1) * entrada.tamanho);
    return { itens, total, pagina: entrada.pagina, tamanho: entrada.tamanho };
  }
}
