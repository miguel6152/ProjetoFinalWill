import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NovaAvaliacao } from '../shared/tipos/Avaliacao';
import type { Avaliacao } from '../models/Avaliacao';
import type { ContratoIpc, AvaliacaoDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { AvaliacaoRepository } from '../repositories/AvaliacaoRepository';
import { ErroAvaliacao } from './ErroAvaliacao';
import { ValidacaoAvaliacao } from './ValidacaoAvaliacao';

export type CanalAvaliacao = Extract<keyof ContratoIpc, `avaliacoes:${string}`>;
type Saida = ContratoIpc[CanalAvaliacao]['saida'];

export class AvaliacaoService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: AvaliacaoRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalAvaliacao, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = ['admin','instrutor'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoAvaliacao.objeto(entrada);
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroAvaliacao('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroAvaliacao('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroAvaliacao('SEM_PERMISSAO');
      if (canal === 'avaliacoes:criar') {
        const dados = this.validar(ValidacaoAvaliacao.criar, entrada);
        const completos=this.completar(dados,ator.perfil,ator.id);
        return this.dto(this.repository.create(completos));
      }
      if (canal === 'avaliacoes:listar') {
        const lista = this.validar(ValidacaoAvaliacao.lista, entrada);
        if (lista.inicio && lista.fim && lista.inicio>lista.fim) throw new ErroAvaliacao('VALIDACAO');
        const pagina = this.repository.listar(lista, ator.perfil === 'instrutor' ? ator.id : null);
        return { ...pagina, itens: pagina.itens.map(aula => this.dto(aula)) };
      }
      const alvo = canal === 'avaliacoes:atualizar' ? this.validar(ValidacaoAvaliacao.atualizar, entrada)
        : canal === 'avaliacoes:excluir' ? this.validar(ValidacaoAvaliacao.alvo, entrada) : this.validar(ValidacaoAvaliacao.id, entrada);
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined || (ator.perfil === 'instrutor' && !this.repository.alunoPermitido(atual.aluno_id,ator.id))) throw new ErroAvaliacao('NAO_ENCONTRADO');
      if (canal === 'avaliacoes:obter') return this.dto(atual);
      if (ator.perfil === 'instrutor' && atual.instrutor_id !== this.repository.instrutorUsuario(ator.id)) throw new ErroAvaliacao('SEM_PERMISSAO');
      const referencia = this.validar(ValidacaoAvaliacao.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia,'hex'),Buffer.from(this.referencia(atual),'hex'))) throw new ErroAvaliacao('CONFLITO');
      if (canal === 'avaliacoes:excluir') {
        if (!this.repository.delete(alvo.id)) throw new ErroAvaliacao('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoAvaliacao.atualizar, entrada).alteracoes;
      const { id, criado_em, atualizado_em, ...dados } = atual;
      const completos=this.completar(this.validar(ValidacaoAvaliacao.criar,{...dados,...patch}),ator.perfil,ator.id);
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroAvaliacao('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) (campos[problema.path.join('.') || 'dados'] ??= []).push(problema.message);
    throw new ErroAvaliacao('VALIDACAO',campos);
  }

  private completar(dados:NovaAvaliacao,perfil:Perfil,usuario:number):Omit<Avaliacao,'id'|'criado_em'|'atualizado_em'> {
    if (!this.repository.alunoPermitido(dados.aluno_id,perfil === 'admin' ? null : usuario)) throw new ErroAvaliacao('SEM_PERMISSAO');
    const autor=perfil === 'instrutor' ? this.repository.instrutorUsuario(usuario) : dados.instrutor_id;
    if (!autor || !this.repository.instrutorExiste(autor)) throw new ErroAvaliacao('VALIDACAO');
    if (perfil === 'instrutor' && dados.instrutor_id !== undefined && dados.instrutor_id !== autor) throw new ErroAvaliacao('SEM_PERMISSAO');
    return {...dados,instrutor_id:autor,cintura_cm:dados.cintura_cm??null,quadril_cm:dados.quadril_cm??null,
      braco_cm:dados.braco_cm??null,coxa_cm:dados.coxa_cm??null,observacoes:dados.observacoes??null};
  }

  private dto(aula: Avaliacao): AvaliacaoDto {
    return { ...aula, referencia: this.referencia(aula) };
  }

  private referencia(aula: Avaliacao): string {
    const campos = Object.entries(aula).sort(([a],[b]) => a.localeCompare(b));
    return createHmac('sha256',this.chave).update(JSON.stringify(campos)).digest('hex');
  }
}
