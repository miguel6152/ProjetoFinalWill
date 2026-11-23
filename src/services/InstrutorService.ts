import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Instrutor } from '../models/Instrutor';
import type { ContratoIpc, InstrutorDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { InstrutorRepository } from '../repositories/InstrutorRepository';
import { ErroInstrutor } from './ErroInstrutor';
import { ValidacaoInstrutor } from './ValidacaoInstrutor';

export type CanalInstrutor = Extract<keyof ContratoIpc, `instrutores:${string}`>;
type Saida = ContratoIpc[CanalInstrutor]['saida'];

export class InstrutorService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: InstrutorRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalInstrutor, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos: readonly Perfil[] = canal === 'instrutores:listar' || canal === 'instrutores:obter' ? ['admin','recepcao','instrutor'] : ['admin'];
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoInstrutor.objeto(entrada);
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroInstrutor('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroInstrutor('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroInstrutor('SEM_PERMISSAO');
      if (canal === 'instrutores:criar') {
        const dados = this.validar(ValidacaoInstrutor.criar, entrada);
        this.validarConta(dados.usuario_id);
        return this.dto(this.repository.create(dados));
      }
      if (canal === 'instrutores:listar') {
        const lista = this.validar(ValidacaoInstrutor.lista, entrada);
        const pagina = this.repository.listar({ pagina: lista.pagina, tamanho: lista.tamanho,
          ...(lista.busca === undefined ? {} : { busca: lista.busca }) }, ator.perfil === 'instrutor' ? ator.id : null);
        return { ...pagina, itens: pagina.itens.map(instrutor => this.dto(instrutor)) };
      }
      const alvo = canal === 'instrutores:atualizar' ? this.validar(ValidacaoInstrutor.atualizar, entrada)
        : canal === 'instrutores:excluir' ? this.validar(ValidacaoInstrutor.alvo, entrada) : this.validar(ValidacaoInstrutor.id, entrada);
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined || (ator.perfil === 'instrutor' && atual.usuario_id !== ator.id)) throw new ErroInstrutor('NAO_ENCONTRADO');
      if (canal === 'instrutores:obter') return this.dto(atual);
      const referencia = this.validar(ValidacaoInstrutor.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia,'hex'),Buffer.from(this.referencia(atual),'hex'))) throw new ErroInstrutor('CONFLITO');
      if (canal === 'instrutores:excluir') {
        if (!this.repository.delete(alvo.id)) throw new ErroInstrutor('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoInstrutor.atualizar, entrada).alteracoes;
      const completos = this.validar(ValidacaoInstrutor.criar, { nome: atual.nome, usuario_id: atual.usuario_id, email: atual.email,
        telefone: atual.telefone, especialidade: atual.especialidade, ativo: atual.ativo, ...patch });
      this.validarConta(completos.usuario_id);
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroInstrutor('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) (campos[problema.path.join('.') || 'dados'] ??= []).push(problema.message);
    throw new ErroInstrutor('VALIDACAO',campos);
  }

  private validarConta(id: number): void {
    const conta = this.repository.atorAtual(id);
    if (!conta?.ativo || conta.perfil !== 'instrutor') throw new ErroInstrutor('VALIDACAO', { usuario_id: ['Escolha uma conta ativa com perfil instrutor.'] });
  }

  private dto(instrutor: Instrutor): InstrutorDto {
    return { ...instrutor, referencia: this.referencia(instrutor) };
  }

  private referencia(instrutor: Instrutor): string {
    const { id, usuario_id, nome, email, telefone, especialidade, ativo, criado_em, atualizado_em } = instrutor;
    return createHmac('sha256',this.chave).update(JSON.stringify([
      id, usuario_id, nome, email, telefone, especialidade, ativo, criado_em, atualizado_em
    ])).digest('hex');
  }
}
