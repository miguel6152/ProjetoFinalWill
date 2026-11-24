import { DataAcademia } from '../services/DataAcademia';
import type { Conexao } from '../database/Conexao';
import type { Inscricao } from '../models/Inscricao';
import type { FiltroInscricoes, Pagina } from '../shared/ipc/ContratoIpc';
import type { IdentidadeAutenticada } from '../main/seguranca/ContratosAutenticacao';
import { BaseRepository } from './BaseRepository';

export class InscricaoRepository extends BaseRepository<Inscricao> {
  public constructor(conexao: Conexao) {
    super(conexao, { tabela: 'inscricoes_aula', colunas: {
      id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
      aula_id:{tipo:'INTEGER',anulavel:false,atualizavel:true},
      aluno_id:{tipo:'INTEGER',anulavel:false,atualizavel:true},
      situacao:{tipo:'TEXT',anulavel:false,atualizavel:true},
      presenca:{tipo:'TEXT',anulavel:false,atualizavel:true},
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


  public aula(id:number) {
    return this.conexao.preparar<[number], {id:number; usuario_id:number; inicio_em:string; situacao:string; capacidade:number}>(
      'SELECT a.id,i.usuario_id,a.inicio_em,a.situacao,a.capacidade FROM aulas a JOIN instrutores i ON i.id=a.instrutor_id WHERE a.id=?').get(id);
  }
  public validarVaga(aulaId:number, alunoId:number, excluirId:number):boolean {
    const aula=this.aula(aulaId);
    if (!aula || aula.situacao !== 'agendada') return false;
    const dia=DataAcademia.civil(new Date(aula.inicio_em));
    const elegivel=this.conexao.preparar<[number,string,string],{id:number}>(`SELECT a.id FROM alunos a WHERE a.id=? AND a.ativo=1 AND EXISTS
      (SELECT 1 FROM matriculas m WHERE m.aluno_id=a.id AND m.situacao='ativa' AND m.data_inicio<=? AND m.data_fim>=?)`).get(alunoId,dia,dia);
    const total=this.conexao.preparar<[number,number],{total:number}>("SELECT COUNT(*) total FROM inscricoes_aula WHERE aula_id=? AND situacao='ativa' AND id<>?").get(aulaId,excluirId)!.total;
    return !!elegivel && total<aula.capacidade;
  }
  public existente(aulaId:number,alunoId:number):Inscricao|undefined {
    return this.conexao.preparar<[number,number],Inscricao>('SELECT * FROM inscricoes_aula WHERE aula_id=? AND aluno_id=?').get(aulaId,alunoId);
  }
  public listar(filtro:FiltroInscricoes, usuario:number|null):Pagina<Inscricao> {
    const params={usuario,aula:filtro.aula_id??null,aluno:filtro.aluno_id??null};
    const sql=` FROM inscricoes_aula s JOIN aulas a ON a.id=s.aula_id JOIN instrutores i ON i.id=a.instrutor_id
      WHERE (@usuario IS NULL OR i.usuario_id=@usuario) AND (@aula IS NULL OR s.aula_id=@aula) AND (@aluno IS NULL OR s.aluno_id=@aluno)`;
    const total=this.conexao.preparar<[typeof params],{total:number}>('SELECT COUNT(*) total'+sql).get(params)!.total;
    const pagina={...params,limite:filtro.tamanho,offset:(filtro.pagina-1)*filtro.tamanho};
    const itens=this.conexao.preparar<[typeof pagina],Inscricao>('SELECT s.*'+sql+' ORDER BY s.id LIMIT @limite OFFSET @offset').all(pagina);
    return {itens,total,pagina:filtro.pagina,tamanho:filtro.tamanho};
  }
}
