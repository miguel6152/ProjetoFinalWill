import type { Conexao } from '../database/Conexao';
import type { Avaliacao } from '../models/Avaliacao';
import type { FiltroAvaliacoes, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';

export class AvaliacaoRepository extends BaseRepository<Avaliacao> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'avaliacoes_fisicas', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      aluno_id:{tipo:'INTEGER',anulavel:false,atualizavel:true},
      instrutor_id:{tipo:'INTEGER',anulavel:false,atualizavel:true},
      realizada_em:{tipo:'TEXT',anulavel:false,atualizavel:true},
      peso_kg:{tipo:'REAL',anulavel:false,atualizavel:true},
      altura_cm:{tipo:'REAL',anulavel:false,atualizavel:true},
      cintura_cm:{tipo:'REAL',anulavel:true,atualizavel:true},
      quadril_cm:{tipo:'REAL',anulavel:true,atualizavel:true},
      braco_cm:{tipo:'REAL',anulavel:true,atualizavel:true},
      coxa_cm:{tipo:'REAL',anulavel:true,atualizavel:true},
      observacoes:{tipo:'TEXT',anulavel:true,atualizavel:true},
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



  private readonly escopo = `EXISTS (SELECT 1 FROM inscricoes_aula s JOIN aulas a ON a.id=s.aula_id JOIN instrutores i ON i.id=a.instrutor_id WHERE s.aluno_id=al.id AND i.usuario_id=@usuario)
    OR EXISTS (SELECT 1 FROM avaliacoes_fisicas av JOIN instrutores i ON i.id=av.instrutor_id WHERE av.aluno_id=al.id AND i.usuario_id=@usuario)`;

  public alunoPermitido(id:number,usuario:number|null):boolean {
    return !!this.conexao.preparar<[{id:number;usuario:number|null}],{id:number}>(
      'SELECT al.id FROM alunos al WHERE al.id=@id AND (@usuario IS NULL OR '+this.escopo+')').get({id,usuario});
  }
  public instrutorUsuario(usuario:number):number|undefined {
    return this.conexao.preparar<[number],{id:number}>('SELECT id FROM instrutores WHERE usuario_id=? AND ativo=1').get(usuario)?.id;
  }
  public instrutorExiste(id:number):boolean {
    return !!this.conexao.preparar<[number],{id:number}>('SELECT id FROM instrutores WHERE id=?').get(id);
  }
  public listar(filtro:FiltroAvaliacoes,usuario:number|null):Pagina<Avaliacao> {
    const params={usuario,aluno:filtro.aluno_id??null,inicio:filtro.inicio??null,fim:filtro.fim??null};
    const sql=` FROM avaliacoes_fisicas av JOIN alunos al ON al.id=av.aluno_id
      WHERE (@aluno IS NULL OR al.id=@aluno) AND (@inicio IS NULL OR av.realizada_em>=@inicio)
      AND (@fim IS NULL OR av.realizada_em<=@fim) AND (@usuario IS NULL OR `+this.escopo+')';
    const total=this.conexao.preparar<[typeof params],{total:number}>('SELECT COUNT(*) total'+sql).get(params)!.total;
    const pagina={...params,limite:filtro.tamanho,offset:(filtro.pagina-1)*filtro.tamanho};
    const itens=this.conexao.preparar<[typeof pagina],Avaliacao>('SELECT av.*'+sql+' ORDER BY av.realizada_em,av.id LIMIT @limite OFFSET @offset').all(pagina);
    return {itens,total,pagina:filtro.pagina,tamanho:filtro.tamanho};
  }
}
