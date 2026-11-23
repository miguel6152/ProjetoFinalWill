import type { Conexao } from '../database/Conexao';
import type { Aluno } from '../models/Aluno';
import type { NovoAluno, AlunoResumoDto } from '../shared/tipos/Aluno';
import type { EntradaLista, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';
import { ErroRepository } from './ErroRepository';

export class AlunoRepository extends BaseRepository<Aluno, keyof NovoAluno> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'alunos', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      cpf: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      data_nascimento: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      email: { tipo: 'TEXT', anulavel: true, atualizavel: true },
      telefone: { tipo: 'TEXT', anulavel: true, atualizavel: true },
      cep: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      logradouro: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      numero: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      complemento: { tipo: 'TEXT', anulavel: true, atualizavel: true },
      bairro: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      cidade: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      uf: { tipo: 'TEXT', anulavel: false, atualizavel: true },
      ativo: { tipo: 'INTEGER', anulavel: false, atualizavel: true },
      telegram_chat_id: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      autorizado_notificar_em: { tipo: 'TEXT', anulavel: true, atualizavel: false },
      criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
      atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
    } });
  }

  public atomico<T>(operacao: () => T extends PromiseLike<unknown> ? never : T): T { return this.conexao.transacao(operacao); }

  /** Confere o ator na mesma transação da operação, inclusive identidade e credencial. */
  public atorAtual(id: number): IdentidadeAutenticada | undefined {
    const linha = this.conexao.preparar<[number], { id: number; nome: string; perfil: IdentidadeAutenticada['perfil']; ativo: number; identidade_conta: string; versao_credencial: number }>(
      'SELECT id,nome,perfil,ativo,identidade_conta,versao_credencial FROM usuarios WHERE id = ?').get(id);
    return linha === undefined ? undefined : { id: linha.id, nome: linha.nome, perfil: linha.perfil, ativo: linha.ativo === 1,
      identidadeConta: linha.identidade_conta, versaoCredencial: linha.versao_credencial };
  }

  private static readonly escopo = `EXISTS (SELECT 1 FROM instrutores i WHERE i.usuario_id = ? AND i.ativo = 1 AND (
    EXISTS (SELECT 1 FROM inscricoes_aula ia JOIN aulas a ON a.id = ia.aula_id WHERE ia.aluno_id = alunos.id AND a.instrutor_id = i.id)
    OR EXISTS (SELECT 1 FROM avaliacoes_fisicas af WHERE af.aluno_id = alunos.id AND af.instrutor_id = i.id)))`;

  public instrutorPodeConsultar(usuarioId: number, alunoId: number): boolean {
    return this.conexao.preparar<[number, number], { id: number }>(
      'SELECT id FROM alunos WHERE id = ? AND ' + AlunoRepository.escopo).get(alunoId, usuarioId) !== undefined;
  }

  /** A busca do instrutor usa somente nome, evitando inferir CPF/contato pela contagem. */
  public listar(entrada: EntradaLista, usuarioInstrutor?: number): Pagina<AlunoResumoDto> {
    const busca = entrada.busca ?? '';
    const administrativo = usuarioInstrutor === undefined;
    const filtro = administrativo
      ? ' WHERE (instr(lower(nome),lower(?)) > 0 OR instr(cpf,?) > 0 OR instr(lower(coalesce(email,\'\')),lower(?)) > 0 OR instr(coalesce(telefone,\'\'),?) > 0)'
      : ' WHERE instr(lower(nome),lower(?)) > 0 AND ' + AlunoRepository.escopo;
    const parametros: (string | number)[] = administrativo ? [busca, busca, busca, busca] : [busca, usuarioInstrutor];
    const total = this.conexao.preparar<(string | number)[], { total: number }>('SELECT COUNT(*) AS total FROM alunos' + filtro).get(...parametros)?.total;
    if (total === undefined) throw new ErroRepository('INTERNO');
    const projecao = administrativo ? "id,nome,ativo,'***.***.' || substr(cpf,7,3) || '-**' AS cpf_mascarado" : 'id,nome,ativo';
    const itens = this.conexao.preparar<(string | number)[], AlunoResumoDto>(
      'SELECT ' + projecao + ' FROM alunos' + filtro + ' ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(...parametros, entrada.tamanho, (entrada.pagina - 1) * entrada.tamanho);
    return { itens, total, pagina: entrada.pagina, tamanho: entrada.tamanho };
  }
}
