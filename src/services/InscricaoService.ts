import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NovaInscricao } from '../shared/tipos/Inscricao';
import type { Inscricao } from '../models/Inscricao';
import type { ContratoIpc, InscricaoDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { InscricaoRepository } from '../repositories/InscricaoRepository';
import { ErroInscricao } from './ErroInscricao';
import { ValidacaoInscricao } from './ValidacaoInscricao';

export type CanalInscricao = Extract<keyof ContratoIpc, `inscricoes:${string}`>;
type Saida = ContratoIpc[CanalInscricao]['saida'];

export class InscricaoService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: InscricaoRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalInscricao, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = ['admin','recepcao','instrutor'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoInscricao.objeto(entrada);
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroInscricao('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroInscricao('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroInscricao('SEM_PERMISSAO');
      if (canal === 'inscricoes:criar') {
        const dados = this.validar(ValidacaoInscricao.criar, entrada);
        this.escopo(dados.aula_id,ator.perfil,ator.id);
        const anterior=this.repository.existente(dados.aula_id,dados.aluno_id);
        if (anterior?.situacao === 'ativa' || dados.situacao !== 'ativa' || dados.presenca !== 'nao_registrada') throw new ErroInscricao('CONFLITO');
        if (!this.repository.validarVaga(dados.aula_id,dados.aluno_id,anterior?.id??0)) throw new ErroInscricao('CONFLITO');
        if (anterior) return this.dto(this.repository.update(anterior.id,dados)!);
        return this.dto(this.repository.create(dados));
      }
      if (canal === 'inscricoes:listar') {
        const lista = this.validar(ValidacaoInscricao.lista, entrada);
        const pagina = this.repository.listar(lista, ator.perfil === 'instrutor' ? ator.id : null);
        return { ...pagina, itens: pagina.itens.map(aula => this.dto(aula)) };
      }
      const alvo = canal === 'inscricoes:atualizar' ? this.validar(ValidacaoInscricao.atualizar, entrada)
        : canal === 'inscricoes:excluir' ? this.validar(ValidacaoInscricao.alvo, entrada) : this.validar(ValidacaoInscricao.id, entrada);
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined || (ator.perfil === 'instrutor' && this.repository.aula(atual.aula_id)?.usuario_id !== ator.id)) throw new ErroInscricao('NAO_ENCONTRADO');
      if (canal === 'inscricoes:obter') return this.dto(atual);
      const referencia = this.validar(ValidacaoInscricao.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia,'hex'),Buffer.from(this.referencia(atual),'hex'))) throw new ErroInscricao('CONFLITO');
      if (canal === 'inscricoes:excluir') {
        if (atual.presenca !== 'nao_registrada' || this.repository.aula(atual.aula_id)?.situacao === 'concluida') throw new ErroInscricao('CONFLITO');
        if (!this.repository.delete(alvo.id)) throw new ErroInscricao('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoInscricao.atualizar, entrada).alteracoes;
      const { id, criado_em, atualizado_em, ...dados } = atual;
      const completos = this.validar(ValidacaoInscricao.criar, { ...dados, ...patch });
      this.escopo(completos.aula_id,ator.perfil,ator.id);
      const mudouVinculo=completos.aula_id !== atual.aula_id || completos.aluno_id !== atual.aluno_id;
      const aula=this.repository.aula(atual.aula_id)!;
      if (atual.presenca !== 'nao_registrada' && completos.presenca === 'nao_registrada') throw new ErroInscricao('CONFLITO');
      if ((atual.presenca !== 'nao_registrada' || aula.situacao === 'concluida') &&
          (mudouVinculo || completos.situacao !== atual.situacao)) throw new ErroInscricao('CONFLITO');
      if (completos.situacao === 'ativa' && (mudouVinculo || atual.situacao === 'cancelada')) {
        if (!this.repository.validarVaga(completos.aula_id,completos.aluno_id,id)) throw new ErroInscricao('CONFLITO');
        completos.presenca='nao_registrada';
      }
      if (completos.presenca !== atual.presenca && completos.presenca !== 'nao_registrada' &&
          (completos.situacao !== 'ativa' || aula.situacao === 'cancelada' || Date.parse(aula.inicio_em)>Date.now())) throw new ErroInscricao('CONFLITO');
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroInscricao('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) (campos[problema.path.join('.') || 'dados'] ??= []).push(problema.message);
    throw new ErroInscricao('VALIDACAO',campos);
  }

  private escopo(id:number,perfil:Perfil,usuarioId:number):void {
    const aula=this.repository.aula(id);
    if (!aula) throw new ErroInscricao('NAO_ENCONTRADO');
    if (perfil === 'instrutor' && aula.usuario_id !== usuarioId) throw new ErroInscricao('SEM_PERMISSAO');
  }

  private dto(aula: Inscricao): InscricaoDto {
    return { ...aula, referencia: this.referencia(aula) };
  }

  private referencia(aula: Inscricao): string {
    const campos = Object.entries(aula).sort(([a],[b]) => a.localeCompare(b));
    return createHmac('sha256',this.chave).update(JSON.stringify(campos)).digest('hex');
  }
}
