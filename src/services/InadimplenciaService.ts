import type { PagamentoRepository } from '../repositories/PagamentoRepository';
import type { DividaAluno, FiltroInadimplencia, ResumoInadimplencia } from '../shared/tipos/Inadimplencia';

export class InadimplenciaService {
  private static readonly calendario = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  });

  public constructor(private readonly pagamentos: PagamentoRepository) {}

  public consultar(filtro: FiltroInadimplencia, instante = new Date()): ResumoInadimplencia {
    const hoje = InadimplenciaService.calendario.format(instante);
    const grupos = new Map<number, DividaAluno>();
    let total = 0;
    // O repository devolve uma linha por cobrança, da mais antiga para a mais recente.
    for (const { aluno_id, nome, ...mensalidade } of this.pagamentos.vencidas(filtro, hoje)) {
      let aluno = grupos.get(aluno_id);
      if (!aluno) {
        aluno = { aluno_id, nome, quantidade: 0, total_centavos: 0,
          vencimento_mais_antigo: mensalidade.data_vencimento, mensalidades: [] };
        grupos.set(aluno_id, aluno);
      }
      aluno.mensalidades.push(mensalidade);
      aluno.quantidade++;
      aluno.total_centavos += mensalidade.valor_centavos;
      total += mensalidade.valor_centavos;
      if (!Number.isSafeInteger(total)) throw new RangeError('Total excede a precisão em centavos.');
    }
    const alunos = Array.from(grupos.values());
    alunos.sort((a, b) => {
      const ordem = filtro.ordem === 'valor' ? b.total_centavos - a.total_centavos
        : a.vencimento_mais_antigo.localeCompare(b.vencimento_mais_antigo);
      return ordem || a.aluno_id - b.aluno_id;
    });
    return { data_referencia: hoje, quantidade_alunos: alunos.length, total_centavos: total, alunos };
  }
}
