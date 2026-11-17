import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Aluno } from '../models/Aluno';
import type { ContratoIpc, AlunoDto, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import { Autorizador } from '../main/seguranca/Autorizador';
import { SessaoManager } from '../main/seguranca/SessaoManager';
import { AlunoRepository } from '../repositories/AlunoRepository';
import { ErroAluno } from './ErroAluno';
import { ValidacaoAluno } from './ValidacaoAluno';

export type CanalAluno = Extract<keyof ContratoIpc, `alunos:${string}`>;
type Saida = ContratoIpc[CanalAluno]['saida'];

export class AlunoService {
  private readonly chave = randomBytes(32);
  public constructor(private readonly repository: AlunoRepository, private readonly autorizador: Autorizador,
    private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalAluno, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void): Promise<Saida> {
    conferirOrigem();
    const versao = this.sessoes.versao(contexto), sessao = this.sessoes.obter(contexto);
    const permitidos = this.perfis(canal);
    const identidade = await this.autorizador.exigirPerfil(contexto, permitidos);
    ValidacaoAluno.objeto(entrada);
    // Sem awaits após autorização: ator, escopo, dados e escrita sob IMMEDIATE.
    return this.repository.atomico<Saida>(() => {
      conferirOrigem(); this.sessoes.conferir(contexto, versao);
      if (sessao === undefined || this.sessoes.obter(contexto) !== sessao) throw new ErroAluno('NAO_AUTENTICADO');
      const ator = this.repository.atorAtual(identidade.id);
      if (ator === undefined || !ator.ativo || ator.identidadeConta !== identidade.identidadeConta
        || ator.versaoCredencial !== identidade.versaoCredencial) throw new ErroAluno('NAO_AUTENTICADO');
      if (!permitidos.includes(ator.perfil)) throw new ErroAluno('SEM_PERMISSAO');
      if (canal === 'alunos:criar') {
        const dados = this.validar(ValidacaoAluno.criar, entrada);
        return this.dto(this.repository.create({ ...dados, telegram_chat_id: null, autorizado_notificar_em: null }));
      }
      if (canal === 'alunos:listar') {
        const lista = this.validar(ValidacaoAluno.lista, entrada);
        return this.repository.listar({ pagina: lista.pagina, tamanho: lista.tamanho,
          ...(lista.busca === undefined ? {} : { busca: lista.busca }) }, ator.perfil === 'instrutor' ? ator.id : undefined);
      }
      const alvo = canal === 'alunos:atualizar' ? this.validar(ValidacaoAluno.atualizar, entrada)
        : canal === 'alunos:excluir' ? this.validar(ValidacaoAluno.alvo, entrada) : this.validar(ValidacaoAluno.id, entrada);
      if (ator.perfil === 'instrutor' && !this.repository.instrutorPodeConsultar(ator.id, alvo.id)) throw new ErroAluno('NAO_ENCONTRADO');
      const atual = this.repository.findById(alvo.id);
      if (atual === undefined) throw new ErroAluno('NAO_ENCONTRADO');
      if (canal === 'alunos:obter') return ator.perfil === 'instrutor'
        ? { id: atual.id, nome: atual.nome, ativo: atual.ativo } : this.dto(atual);
      const referencia = this.validar(ValidacaoAluno.alvo, { id: alvo.id,
        referencia: Object.getOwnPropertyDescriptor(entrada, 'referencia')?.value }).referencia;
      if (!timingSafeEqual(Buffer.from(referencia, 'hex'), Buffer.from(this.referencia(atual), 'hex'))) throw new ErroAluno('CONFLITO');
      if (canal === 'alunos:excluir') {
        if (!this.repository.delete(alvo.id)) throw new ErroAluno('NAO_ENCONTRADO');
        return { id: alvo.id, excluido: true };
      }
      const patch = this.validar(ValidacaoAluno.atualizar, entrada).alteracoes;
      // Revalida o registro completo e converte o patch em campos definidos.
      const completos = this.validar(ValidacaoAluno.criar, { ...this.editaveis(atual), ...patch });
      const atualizado = this.repository.update(alvo.id, completos);
      if (atualizado === undefined) throw new ErroAluno('NAO_ENCONTRADO');
      return this.dto(atualizado);
    });
  }

  private perfis(canal: CanalAluno): readonly Perfil[] {
    if (canal === 'alunos:excluir') return ['admin'];
    if (canal === 'alunos:listar' || canal === 'alunos:obter') return ['admin', 'recepcao', 'instrutor'];
    return ['admin', 'recepcao'];
  }

  private validar<S extends z.ZodType>(schema: S, entrada: unknown): z.output<S> {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) {
      const chave = problema.path.join('.') || 'dados';
      (campos[chave] ??= []).push(problema.message);
    }
    throw new ErroAluno('VALIDACAO', campos);
  }

  private editaveis(aluno: Aluno): ContratoIpc['alunos:criar']['entrada'] {
    return { nome: aluno.nome, cpf: aluno.cpf, data_nascimento: aluno.data_nascimento, email: aluno.email,
      telefone: aluno.telefone, cep: aluno.cep, logradouro: aluno.logradouro, numero: aluno.numero,
      complemento: aluno.complemento, bairro: aluno.bairro, cidade: aluno.cidade, uf: aluno.uf, ativo: aluno.ativo };
  }

  private dto(aluno: Aluno): AlunoDto {
    return { ...this.editaveis(aluno), id: aluno.id, criado_em: aluno.criado_em, atualizado_em: aluno.atualizado_em,
      referencia: this.referencia(aluno) };
  }

  private referencia(aluno: Aluno): string {
    // Ordem fixa da projeção, referência opaca vinculada ao conteúdo consultado.
    return createHmac('sha256', this.chave).update(JSON.stringify([aluno.id, this.editaveis(aluno),
      aluno.criado_em, aluno.atualizado_em, aluno.telegram_chat_id, aluno.autorizado_notificar_em])).digest('hex');
  }
}
