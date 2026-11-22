import type { Conexao } from '../database/Conexao';
import type { Aula } from '../models/Aula';
import type { FiltroAgenda, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';

export class AulaRepository extends BaseRepository<Aula> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'aulas', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      instrutor_id: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      modalidade: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      inicio_em: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      fim_em: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      capacidade: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      situacao: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      local: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      ao_ar_livre: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      latitude: { tipo: 'REAL', anulavel: true, atualizavel: true },
      longitude: { tipo: 'REAL', anulavel: true, atualizavel: true },
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

  public instrutor(id: number) {
    return this.conexao.preparar<[number], { usuario_id: number; ativo: number }>(
      'SELECT usuario_id, ativo FROM instrutores WHERE id = ?').get(id);
  }

  public ocupacao(id: number): number {
    return this.conexao.preparar<[number], { total: number }>(
      "SELECT COUNT(*) AS total FROM inscricoes_aula WHERE aula_id = ? AND situacao = 'ativa'").get(id)!.total;
  }

  public listar(filtro: FiltroAgenda, usuarioId: number | null): Pagina<Aula> {
    const condicao = ` FROM aulas a JOIN instrutores i ON i.id = a.instrutor_id
      WHERE (@usuario IS NULL OR i.usuario_id = @usuario)
        AND (@instrutor IS NULL OR a.instrutor_id = @instrutor)
        AND (@inicio IS NULL OR julianday(a.fim_em) > julianday(@inicio))
        AND (@fim IS NULL OR julianday(a.inicio_em) < julianday(@fim))`;
    const params = { usuario: usuarioId, instrutor: filtro.instrutor_id ?? null,
      inicio: filtro.inicio ?? null, fim: filtro.fim ?? null };
    const total = this.conexao.preparar<[typeof params], {total:number}>('SELECT COUNT(*) AS total' + condicao).get(params)!.total;
    const pagina = { ...params, limite: filtro.tamanho, deslocamento: (filtro.pagina - 1) * filtro.tamanho };
    const itens = this.conexao.preparar<[typeof pagina], Aula>('SELECT a.*' + condicao +
      ' ORDER BY julianday(a.inicio_em), a.id LIMIT @limite OFFSET @deslocamento').all(pagina);
    return { itens, total, pagina: filtro.pagina, tamanho: filtro.tamanho };
  }
}
