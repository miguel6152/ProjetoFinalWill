import { AvaliacaoRepository } from './AvaliacaoRepository';

export class RelatorioRepository extends AvaliacaoRepository {
  public frequencia(inicio:string,fim:string,aluno:number|null,aula:number|null,usuario:number|null) {
    const parametros={inicio,fim,aluno,aula,usuario};
    return this.conexao.preparar<[typeof parametros],{
      aluno_id:number; nome:string; presentes:number; ausentes:number; nao_registradas:number;
    }>(`SELECT al.id aluno_id,al.nome,
      SUM(s.presenca='presente') presentes, SUM(s.presenca='ausente') ausentes,
      SUM(s.presenca='nao_registrada') nao_registradas
      FROM inscricoes_aula s JOIN aulas a ON a.id=s.aula_id
      JOIN alunos al ON al.id=s.aluno_id JOIN instrutores i ON i.id=a.instrutor_id
      WHERE s.situacao='ativa' AND a.situacao='concluida'
      AND julianday(a.inicio_em)>=julianday(@inicio) AND julianday(a.inicio_em)<=julianday(@fim)
      AND (@aluno IS NULL OR al.id=@aluno) AND (@aula IS NULL OR a.id=@aula)
      AND (@usuario IS NULL OR i.usuario_id=@usuario)
      GROUP BY al.id,al.nome ORDER BY al.id LIMIT 1001`).all(parametros);
  }
}
