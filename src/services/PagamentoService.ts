import { InadimplenciaService } from './InadimplenciaService';
import { z } from 'zod';
import type { ContratoIpc, Perfil } from '../shared/ipc/ContratoIpc';
import type { ContextoSessao } from '../main/seguranca/ContratosAutenticacao';
import type { Autorizador } from '../main/seguranca/Autorizador';
import type { SessaoManager } from '../main/seguranca/SessaoManager';
import type { PagamentoRepository } from '../repositories/PagamentoRepository';
import type { MatriculaRepository } from '../repositories/MatriculaRepository';
import { ValidacaoPlano } from './ValidacaoPlano';
import { ErroPagamento } from './ErroPagamento';

export type CanalPagamento = Extract<keyof ContratoIpc, `pagamentos:${string}`>;
const id = z.number().int().positive().safe();
const competencia = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
const data = z.iso.date().refine(d => !d.startsWith('0000'));
const inadimplentes = z.object({
  busca: z.string().trim().max(120).optional(), inicio: data.optional(), fim: data.optional(),
  ordem: z.enum(['atraso', 'valor'])
}).strict().refine(f => !f.inicio || !f.fim || f.inicio <= f.fim);
const criar = z.object({ matricula_id: id, competencia, data_vencimento: data, valor_centavos: id }).strict();
const receber = z.object({ id, data, forma_pagamento: z.enum(['pix','dinheiro','cartao','transferencia']) }).strict();
const listar = z.object({
  pagina: id, tamanho: id.max(100), aluno_id: id.optional(), competencia: competencia.optional(),
  situacao: z.enum(['pendente','pago','cancelado']).optional()
}).strict().refine(f => Number.isSafeInteger((f.pagina - 1) * f.tamanho));

export class PagamentoService {
  public constructor(private readonly pagamentos: PagamentoRepository, private readonly matriculas: MatriculaRepository,
    private readonly autorizador: Autorizador, private readonly sessoes: SessaoManager) {}

  public async executar(canal: CanalPagamento, entrada: unknown, contexto: ContextoSessao, conferirOrigem: () => void) {
    const versao = this.sessoes.versao(contexto);
    const perfis: readonly Perfil[] = ['admin', 'recepcao'];
    const identidade = await this.autorizador.exigirPerfil(contexto, perfis);
    try { ValidacaoPlano.objeto(entrada); } catch { throw new ErroPagamento('VALIDACAO'); }

    const operacao = () => {
      conferirOrigem();
      this.sessoes.conferir(contexto, versao);
      const ator = this.matriculas.atorAtual(identidade.id);
      if (!ator?.ativo || ator.identidadeConta !== identidade.identidadeConta || ator.versaoCredencial !== identidade.versaoCredencial) {
        throw new ErroPagamento('NAO_AUTENTICADO');
      }
      if (!perfis.includes(ator.perfil)) throw new ErroPagamento('SEM_PERMISSAO');
      switch (canal) {
        case 'pagamentos:inadimplentes':
          return new InadimplenciaService(this.pagamentos).consultar(inadimplentes.parse(entrada));
        case 'pagamentos:criar': {
          const dados = criar.parse(entrada);
          if (!this.matriculas.detalhes(dados.matricula_id)) throw new ErroPagamento('VALIDACAO', 'Matrícula não encontrada.');
          const registro = this.pagamentos.create({ ...dados, situacao: 'pendente', pago_em: null, forma_pagamento: null });
          return this.detalhes(registro.id);
        }
        case 'pagamentos:quitar': {
          const dados = receber.parse(entrada);
          this.detalhes(dados.id);
          if (!this.pagamentos.quitar(dados)) throw new ErroPagamento('CONFLITO', 'A quitação exige uma mensalidade pendente com valor positivo.');
          return this.detalhes(dados.id);
        }
        case 'pagamentos:obter': return this.detalhes(ValidacaoPlano.id.parse(entrada).id);
        case 'pagamentos:listar': {
          const f = listar.parse(entrada);
          return this.pagamentos.listar({ pagina: f.pagina, tamanho: f.tamanho,
            ...(f.aluno_id === undefined ? {} : { aluno_id: f.aluno_id }),
            ...(f.situacao === undefined ? {} : { situacao: f.situacao }),
            ...(f.competencia === undefined ? {} : { competencia: f.competencia }) });
        }
      }
    };
    return canal === 'pagamentos:criar' || canal === 'pagamentos:quitar'
      ? this.matriculas.escritaAtomica(operacao) : this.matriculas.atomico(operacao);
  }

  private detalhes(id: number) {
    const item = this.pagamentos.detalhes(id);
    if (!item) throw new ErroPagamento('NAO_ENCONTRADO');
    return item;
  }
}
