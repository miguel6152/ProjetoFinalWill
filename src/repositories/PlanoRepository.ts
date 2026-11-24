import type { Conexao } from '../database/Conexao';
import type { Plano } from '../models/Plano';
import type { EntradaLista, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';
import { ErroRepository } from './ErroRepository';

export class PlanoRepository extends BaseRepository<Plano> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'planos', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      duracao_meses: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      valor_centavos: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
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

  public listar(entrada: EntradaLista): Pagina<Plano> {
    const busca = entrada.busca ?? '';
    const total = this.conexao.preparar<[string], { total: number }>(
      'SELECT COUNT(*) AS total FROM planos WHERE instr(lower(nome),lower(?)) > 0').get(busca)?.total;
    if (total === undefined) throw new ErroRepository('INTERNO');
    const itens = this.conexao.preparar<[string, number, number], Plano>(
      'SELECT id,nome,duracao_meses,valor_centavos,ativo,criado_em,atualizado_em FROM planos WHERE instr(lower(nome),lower(?)) > 0 ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(busca, entrada.tamanho, (entrada.pagina - 1) * entrada.tamanho);
    return { itens, total, pagina: entrada.pagina, tamanho: entrada.tamanho };
  }
}
