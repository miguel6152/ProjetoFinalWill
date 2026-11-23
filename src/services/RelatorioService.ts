import { z } from 'zod';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import type { SessaoManager } from '../main/seguranca/SessaoManager';
import type { Autorizador } from '../main/seguranca/Autorizador';
import { ErroAutenticacao } from '../main/seguranca/ErroAutenticacao';
import type { RelatorioRepository } from '../repositories/RelatorioRepository';

export class RelatorioService {
  private static readonly id=z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().safe());
  private static readonly evolucao=z.object({
    aluno_id:this.id,inicio:z.iso.date(),fim:z.iso.date()
  }).strict();
  private static readonly frequencia=z.object({
    inicio:z.iso.datetime({offset:true}),fim:z.iso.datetime({offset:true}),
    aluno_id:this.id.optional(),aula_id:this.id.optional()
  }).strict();
  public constructor(private readonly dados:RelatorioRepository,private readonly autorizador:Autorizador,
    private readonly sessoes:SessaoManager) {}

  public async consultar(tipo:'evolucao'|'frequencia',entrada:unknown,contexto:ContextoSessao) {
    const sessao=this.sessoes.obter(contexto),versao=this.sessoes.versao(contexto);
    const identidade=await this.autorizador.exigirPerfil(contexto,tipo==='evolucao'?['admin','instrutor']:['admin','recepcao','instrutor']);
    const filtro=(tipo==='evolucao'?RelatorioService.evolucao:RelatorioService.frequencia).safeParse(entrada);
    if(!filtro.success) throw new ErroAutenticacao('VALIDACAO');
    const {inicio,fim}=filtro.data;
    const duracao=Date.parse(fim)-Date.parse(inicio);
    if(duracao<0 || duracao>366*86400000) throw new ErroAutenticacao('VALIDACAO');
    return this.dados.atomico(()=>{
      this.sessoes.conferir(contexto,versao);
      const atual=this.dados.atorAtual(identidade.id);
      if(!sessao || this.sessoes.obter(contexto)!==sessao || !atual?.ativo ||
        atual.identidadeConta!==identidade.identidadeConta || atual.versaoCredencial!==identidade.versaoCredencial)
        throw new ErroAutenticacao('NAO_AUTENTICADO');
      if(atual.perfil!==identidade.perfil) throw new ErroAutenticacao('SEM_PERMISSAO');
      const usuario=atual.perfil==='instrutor'?atual.id:null;
      if(tipo==='evolucao'){
        const aluno=filtro.data.aluno_id!;
        if(!this.dados.alunoPermitido(aluno,usuario)) throw new ErroAutenticacao('SEM_PERMISSAO');
        const pagina=this.dados.listar({pagina:1,tamanho:1000,aluno_id:aluno,inicio,fim},usuario);
        if(pagina.total>1000) throw new ErroAutenticacao('VALIDACAO');
        return {aluno_id:aluno,inicio,fim,pontos:pagina.itens.map(avaliacao=>({
          id:avaliacao.id,realizada_em:avaliacao.realizada_em,instrutor_id:avaliacao.instrutor_id,
          peso_kg:avaliacao.peso_kg,altura_cm:avaliacao.altura_cm,cintura_cm:avaliacao.cintura_cm,
          quadril_cm:avaliacao.quadril_cm,braco_cm:avaliacao.braco_cm,coxa_cm:avaliacao.coxa_cm
        }))};
      }
      const frequencia=RelatorioService.frequencia.parse(entrada);
      const linhas=this.dados.frequencia(inicio,fim,frequencia.aluno_id??null,frequencia.aula_id??null,usuario);
      if(linhas.length>1000) throw new ErroAutenticacao('VALIDACAO');
      return {inicio,fim,itens:linhas.map(linha=>({...linha,percentual_presenca:
        linha.presentes+linha.ausentes===0?null:100*linha.presentes/(linha.presentes+linha.ausentes)}))};
    });
  }
}
