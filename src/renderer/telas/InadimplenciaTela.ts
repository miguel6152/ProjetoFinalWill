import type { PonteAcademia } from '../../shared/ipc/ContratoIpc.js';
import type { FiltroInadimplencia, ResumoInadimplencia } from '../../shared/tipos/Inadimplencia.js';
import { ValorMonetario } from '../componentes/ValorMonetario.js';
import { PagamentosTela } from './PagamentosTela.js';

export class InadimplenciaTela {
  private readonly painel = document.createElement('section');
  private filtros: FiltroInadimplencia = { ordem: 'atraso' };

  public constructor(private readonly raiz: HTMLElement, private readonly api: NonNullable<PonteAcademia['pagamentos']>,
    private readonly sessaoEncerrada: () => void) {}

  public mostrar(): void {
    this.painel.id = 'inadimplencia';
    this.painel.className = 'cartao';
    this.painel.innerHTML = `<h2>Inadimplência</h2>
      <form class="ferramentas">
        <label>Nome ou ID do aluno<input name="busca" maxlength="120"></label>
        <label>Vencimento de<input name="inicio" type="date"></label>
        <label>Vencimento até<input name="fim" type="date"></label>
        <label>Ordenar por<select name="ordem"><option value="atraso">Maior atraso</option>
          <option value="valor">Maior valor devido</option></select></label>
        <button>Consultar</button>
      </form>
      <p role="status"></p><div class="resultado"></div>`;
    const form = this.painel.querySelector('form')!;
    form.onsubmit = evento => {
      evento.preventDefault();
      const dados = new FormData(form);
      const inicio = String(dados.get('inicio')), fim = String(dados.get('fim'));
      this.filtros = { busca: String(dados.get('busca')).trim(), ...(inicio && { inicio }),
        ...(fim && { fim }), ordem: dados.get('ordem') === 'valor' ? 'valor' : 'atraso' };
      void this.consultar();
    };
    this.raiz.replaceChildren(this.painel);
    void this.consultar();
  }

  private versao = 0;
  private async consultar(aviso = ''): Promise<void> {
    const versao = ++this.versao;
    const estado = this.painel.querySelector('[role=status]')!;
    const saida = this.painel.querySelector('.resultado')!;
    saida.replaceChildren();
    estado.textContent = 'Consultando mensalidades…';
    try {
      if (this.filtros.inicio && this.filtros.fim && this.filtros.fim < this.filtros.inicio) {
        throw new Error('O fim do período deve ser igual ou posterior ao início.');
      }
      const r = await this.api.inadimplentes(this.filtros);
      if (versao !== this.versao || !this.painel.isConnected) return;
      if (!r.sucesso) {
        if (r.erro.codigo === 'NAO_AUTENTICADO') this.sessaoEncerrada();
        throw new Error(r.erro.mensagem);
      }
      this.exibir(saida, r.dados);
      estado.textContent = aviso;
    } catch (erro) {
      if (versao === this.versao) estado.textContent = erro instanceof Error ? erro.message : 'Falha ao consultar inadimplência.';
    }
  }

  private data(iso: string): string { return iso.split('-').reverse().join('/'); }

  private exibir(saida: Element, dados: ResumoInadimplencia): void {
    const resumo = document.createElement('p');
    resumo.textContent = `Resumo dos filtros em ${this.data(dados.data_referencia)} · Alunos devedores: ${dados.quantidade_alunos} · Total vencido: ${ValorMonetario.formatar(dados.total_centavos)}`;
    saida.append(resumo);
    if (!dados.alunos.length) saida.append('Nenhuma mensalidade vencida para estes filtros.');
    for (const aluno of dados.alunos) {
      const grupo = document.createElement('details');
      const titulo = document.createElement('summary');
      titulo.textContent = `${aluno.nome} (#${aluno.aluno_id}) · Mensalidades: ${aluno.quantidade} · ${ValorMonetario.formatar(aluno.total_centavos)} · Vencimento mais antigo: ${this.data(aluno.vencimento_mais_antigo)}`;
      const tabela = document.createElement('table');
      tabela.innerHTML = '<thead><tr><th>Matrícula</th><th>Competência</th><th>Vencimento</th><th>Dias de atraso</th><th>Valor</th><th>Recebimento</th></tr></thead>';
      const corpo = tabela.createTBody();
      for (const item of aluno.mensalidades) {
        const linha = corpo.insertRow();
        for (const texto of [String(item.matricula_id), item.competencia, this.data(item.data_vencimento),
          String(item.dias_atraso), ValorMonetario.formatar(item.valor_centavos)]) linha.insertCell().textContent = texto;
        const receber = document.createElement('button');
        receber.textContent = 'Receber';
        receber.onclick = () => {
          new PagamentosTela(this.raiz, this.api, this.sessaoEncerrada).mostrarRecebimento(item.id, aviso => {
            this.raiz.replaceChildren(this.painel);
            void this.consultar(aviso);
          });
        };
        linha.insertCell().append(receber);
      }
      grupo.append(titulo, tabela);
      saida.append(grupo);
    }
  }
}
