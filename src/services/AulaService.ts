import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NovaAula } from '../shared/tipos/Aula';
import type { Aula } from '../models/Aula';
import type { ContratoIpc, AulaDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { AulaRepository } from '../repositories/AulaRepository';
import { ErroAula } from './ErroAula';
import { ValidacaoAula } from './ValidacaoAula';

export type CanalAula = Extract<keyof ContratoIpc, `aulas:${string}`>;
type Saida = ContratoIpc[CanalAula]['saida'];

export class AulaService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: AulaRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalAula, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = canal === 'aulas:listar' || canal === 'aulas:obter' ? ['admin','recepcao','instrutor'] : ['admin','instrutor'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoAula.objeto(entrada);
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroAula('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroAula('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroAula('SEM_PERMISSAO');
      if (canal === 'aulas:criar') {
        const dados = this.validar(ValidacaoAula.criar, entrada);
        this.validarAula(dados, ator.perfil, ator.id, true);
        return this.dto(this.repository.create(dados));
      }
      if (canal === 'aulas:listar') {
        const lista = this.validar(ValidacaoAula.lista, entrada);
        if (lista.inicio && lista.fim && Date.parse(lista.inicio) >= Date.parse(lista.fim)) throw new ErroAula('VALIDACAO');
        const pagina = this.repository.listar(lista, ator.perfil === 'instrutor' ? ator.id : null);
        return { ...pagina, itens: pagina.itens.map(aula => this.dto(aula)) };
      }
      const alvo = canal === 'aulas:atualizar' ? this.validar(ValidacaoAula.atualizar, entrada)
        : canal === 'aulas:excluir' ? this.validar(ValidacaoAula.alvo, entrada) : this.validar(ValidacaoAula.id, entrada);
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined || (ator.perfil === 'instrutor' && this.repository.instrutor(atual.instrutor_id)?.usuario_id !== ator.id)) throw new ErroAula('NAO_ENCONTRADO');
      if (canal === 'aulas:obter') return this.dto(atual);
      const referencia = this.validar(ValidacaoAula.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia,'hex'),Buffer.from(this.referencia(atual),'hex'))) throw new ErroAula('CONFLITO');
      if (canal === 'aulas:excluir') {
        if (!this.repository.delete(alvo.id)) throw new ErroAula('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoAula.atualizar, entrada).alteracoes;
      const { id, criado_em, atualizado_em, ...dados } = atual;
      const completos = this.validar(ValidacaoAula.criar, { ...dados, ...patch });
      const agendamento = completos.situacao === 'agendada' || completos.instrutor_id !== atual.instrutor_id;
      this.validarAula(completos, ator.perfil, ator.id, agendamento);
      if (completos.capacidade < this.repository.ocupacao(id)) throw new ErroAula('CONFLITO');
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroAula('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) (campos[problema.path.join('.') || 'dados'] ??= []).push(problema.message);
    throw new ErroAula('VALIDACAO',campos);
  }

  private validarAula(aula: NovaAula, perfil: Perfil, usuarioId: number, exigirAtivo: boolean): void {
    const instrutor = this.repository.instrutor(aula.instrutor_id);
    if (!instrutor || (exigirAtivo && !instrutor.ativo)) throw new ErroAula('VALIDACAO', {instrutor_id:['Escolha um instrutor ativo.']});
    if (perfil === 'instrutor' && instrutor.usuario_id !== usuarioId) throw new ErroAula('SEM_PERMISSAO');
    if (Date.parse(aula.fim_em) <= Date.parse(aula.inicio_em)) throw new ErroAula('VALIDACAO', {fim_em:['O fim deve ser posterior ao início.']});
    if (aula.ao_ar_livre && (aula.latitude === null || aula.longitude === null)) throw new ErroAula('VALIDACAO', {local:['Informe as coordenadas da aula externa.']});
  }

  private dto(aula: Aula): AulaDto {
    return { ...aula, referencia: this.referencia(aula) };
  }

  private referencia(aula: Aula): string {
    const campos = Object.entries(aula).sort(([a],[b]) => a.localeCompare(b));
    return createHmac('sha256',this.chave).update(JSON.stringify(campos)).digest('hex');
  }
}
