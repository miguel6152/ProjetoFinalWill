import type { PonteAcademia, Resultado } from '../../shared/ipc/ContratoIpc.js';
import type { FiltroPagamentos, FormaPagamento, PagamentoDto } from '../../shared/tipos/Pagamento.js';
import { ValorMonetario } from '../componentes/ValorMonetario.js';

export class PagamentosTela {
  private readonly painel = document.createElement('section');
  private filtros: FiltroPagamentos = { pagina: 1, tamanho: 10 };
  private ocupado = false;

  public constructor(private readonly raiz: HTMLElement, private readonly api: NonNullable<PonteAcademia['pagamentos']>,
    private readonly sessaoEncerrada: () => void) {}

  public mostrar(): void {
    this.painel.id = 'mensalidades';
    this.painel.className = 'cartao';
    this.painel.innerHTML = `<h2>Mensalidades</h2>
      <p role="status" aria-live="polite"></p>
      <fieldset><legend>Lançamentos e recebimentos</legend>
        <details><summary>Lançar mensalidade</summary>
          <form id="lancamento" class="grade-formulario">
            <label>ID da matrícula<input name="matricula" type="number" min="1" required></label>
            <label>Competência<input name="competencia" type="month" required></label>
            <label>Vencimento<input name="vencimento" type="date" required></label>
            <label>Valor devido (R$)<input name="valor" inputmode="decimal" placeholder="100,00" required></label>
            <button>Lançar mensalidade</button>
          </form>
        </details>
        <h3>Consultar mensalidades</h3>
        <form id="filtro-financeiro" class="ferramentas">
          <label>ID do aluno<input name="aluno" type="number" min="1"></label>
          <label>Competência<input name="competencia" type="month"></label>
          <label>Situação<select name="situacao"><option value="">Todas</option>
            <option value="pendente">Pendente</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select></label>
          <button>Filtrar</button>
        </form>
        <table><thead><tr><th>Aluno</th><th>Competência</th><th>Vencimento</th><th>Valor devido</th><th>Situação</th><th>Consulta</th></tr></thead><tbody></tbody></table>
        <nav class="paginacao" aria-label="Páginas das mensalidades"><button id="anterior">Anterior</button><span></span><button id="proxima">Próxima</button></nav>
        <section id="detalhe-financeiro"></section>
      </fieldset>`;
    this.raiz.replaceChildren(this.painel);
    this.formulario('lancamento', async dados => {
      const valor = ValorMonetario.paraCentavos(dados.get('valor') as string);
      if (!valor) throw new Error('Informe um valor positivo com até duas casas decimais.');
      const item = this.resultado(await this.api.criar({ matricula_id: Number(dados.get('matricula')),
        competencia: String(dados.get('competencia')), data_vencimento: String(dados.get('vencimento')), valor_centavos: valor }));
      this.painel.querySelector<HTMLFormElement>('#lancamento')!.reset();
      await this.listar();
      this.detalhes(item);
      return 'Mensalidade lançada.';
    });
    this.formulario('filtro-financeiro', async dados => {
      const aluno = Number(dados.get('aluno')), competencia = String(dados.get('competencia'));
      const situacao = dados.get('situacao') as PagamentoDto['situacao'] | '';
      this.filtros = { pagina: 1, tamanho: 10, ...(aluno && { aluno_id: aluno }),
        ...(competencia && { competencia }), ...(situacao && { situacao }) };
      await this.listar();
    });
    for (const [id, passo] of [['anterior', -1], ['proxima', 1]] as const) {
      this.painel.querySelector<HTMLButtonElement>('#' + id)!.onclick = () => this.executar(async () => {
        this.filtros.pagina += passo;
        try { await this.listar(); } catch (erro) { this.filtros.pagina -= passo; throw erro; }
      });
    }
    void this.executar(() => this.listar());
  }

  public mostrarRecebimento(id: number, voltar: (aviso?: string) => void): void {
    this.painel.className = 'cartao';
    this.painel.innerHTML = `<h2>Receber mensalidade</h2><p role="status"></p>
      <fieldset><legend>Recebimento integral</legend><div id="detalhe-financeiro"></div>
      <button type="button" class="voltar">Voltar à inadimplência</button></fieldset>`;
    this.raiz.replaceChildren(this.painel);
    this.painel.querySelector<HTMLButtonElement>('.voltar')!.onclick = () => voltar();
    void this.executar(async () => {
      const item = this.resultado(await this.api.obter({ id }));
      this.detalhes(item, voltar);
    });
  }

  private formulario(id: string, acao: (dados: FormData) => Promise<string | void>): void {
    const form = this.painel.querySelector<HTMLFormElement>('#' + id)!;
    form.onsubmit = evento => {
      evento.preventDefault();
      const dados = new FormData(form);
      void this.executar(() => acao(dados));
    };
  }

  private async executar(acao: () => Promise<string | void>): Promise<void> {
    if (this.ocupado || !this.painel.isConnected) return;
    this.ocupado = true;
    const grupo = this.painel.querySelector('fieldset')!, estado = this.painel.querySelector('[role=status]')!;
    grupo.disabled = true;
    estado.textContent = 'Carregando…';
    try { estado.textContent = await acao() || ''; }
    catch (erro) { estado.textContent = erro instanceof Error ? erro.message : 'Falha ao consultar mensalidades.'; }
    finally { grupo.disabled = false; this.ocupado = false; }
  }

  private resultado<T>(r: Resultado<T>): T {
    if (r.sucesso) return r.dados;
    if (r.erro.codigo === 'NAO_AUTENTICADO' && this.painel.isConnected) this.sessaoEncerrada();
    throw new Error(r.erro.mensagem);
  }

  private async listar(): Promise<void> {
    const pagina = this.resultado(await this.api.listar(this.filtros));
    const corpo = this.painel.querySelector('tbody')!;
    corpo.replaceChildren();
    this.painel.querySelector('#detalhe-financeiro')!.replaceChildren();
    for (const item of pagina.itens) {
      const linha = corpo.insertRow();
      for (const texto of [item.aluno_nome, item.competencia, this.data(item.data_vencimento), ValorMonetario.formatar(item.valor_centavos), item.situacao]) {
        linha.insertCell().textContent = texto;
      }
      const abrir = document.createElement('button');
      abrir.textContent = 'Detalhes';
      abrir.onclick = () => this.executar(async () => this.detalhes(this.resultado(await this.api.obter({ id: item.id }))));
      linha.insertCell().append(abrir);
    }
    if (!pagina.total) {
      const celula = corpo.insertRow().insertCell();
      celula.colSpan = 6;
      celula.textContent = 'Nenhuma mensalidade encontrada.';
    }
    this.painel.querySelector('nav span')!.textContent = 'Página ' + pagina.pagina + ' de ' + Math.max(1, Math.ceil(pagina.total / pagina.tamanho));
    this.painel.querySelector<HTMLButtonElement>('#anterior')!.disabled = pagina.pagina <= 1;
    this.painel.querySelector<HTMLButtonElement>('#proxima')!.disabled = pagina.pagina * pagina.tamanho >= pagina.total;
  }

  private data(iso: string): string { return iso.slice(0, 10).split('-').reverse().join('/'); }

  private detalhes(item: PagamentoDto, voltar?: (aviso: string) => void): void {
    const detalhe = this.painel.querySelector('#detalhe-financeiro')!;
    detalhe.innerHTML = '<h3>Detalhes da mensalidade</h3><p></p>';
    const valor = ValorMonetario.formatar(item.valor_centavos);
    const resumo = detalhe.querySelector('p')!;
    resumo.textContent = `${item.aluno_nome} · Matrícula ${item.matricula_id} · ${item.competencia} · Vencimento ${this.data(item.data_vencimento)} · ${valor} · ${item.situacao}`;
    if (item.pago_em) resumo.append(` · Recebido em ${this.data(item.pago_em)} por ${item.forma_pagamento}.`);
    if (item.cancelado_em) resumo.append(` · Cancelado em ${this.data(item.cancelado_em)} por ${item.cancelado_por_nome ?? `usuário #${item.cancelado_por}`}. Motivo: ${item.motivo_cancelamento ?? 'não informado'}.`);
    if (item.situacao !== 'pendente') return;
    if (!voltar) {
      const editar = document.createElement('button'); editar.type = 'button'; editar.id = 'editar-pagamento';
      editar.textContent = 'Editar mensalidade'; editar.onclick = () => this.editar(item);
      const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.id = 'cancelar-pagamento';
      cancelar.textContent = 'Cancelar mensalidade'; cancelar.onclick = () => this.confirmarCancelamento(item);
      detalhe.append(editar, cancelar);
    }
    const form = document.createElement('form');
    form.id = 'recebimento';
    form.innerHTML = `<label>Data do recebimento<input name="data" type="date" required></label>
      <label>Meio de pagamento<select name="forma" required><option value="">Selecione</option>
        <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option>
        <option value="transferencia">Transferência</option></select></label><button></button>`;
    form.querySelector('button')!.textContent = 'Confirmar recebimento de ' + valor;
    detalhe.append(form);
    this.formulario('recebimento', async dados => {
      const pago = this.resultado(await this.api.quitar({ id: item.id, data: String(dados.get('data')),
        forma_pagamento: dados.get('forma') as FormaPagamento }));
      if (voltar) {
        if (this.painel.isConnected) voltar('Recebimento integral registrado.');
        return;
      }
      await this.listar();
      this.detalhes(pago);
      return 'Recebimento integral registrado.';
    });
  }

  private editar(item: PagamentoDto): void {
    const detalhe = this.painel.querySelector('#detalhe-financeiro')!;
    detalhe.replaceChildren();
    const titulo = document.createElement('h3'); titulo.textContent = 'Editar mensalidade pendente';
    const form = document.createElement('form'); form.id = 'editar-form-pagamento';
    form.innerHTML = `<label>Competência<input name="competencia" type="month" required></label>
      <label>Vencimento<input name="vencimento" type="date" required></label>
      <label>Valor devido (R$)<input name="valor" inputmode="decimal" required></label>
      <button type="submit">Salvar alterações</button><button type="button" class="voltar-edicao">Voltar</button>`;
    (form.elements.namedItem('competencia') as HTMLInputElement).value = item.competencia;
    (form.elements.namedItem('vencimento') as HTMLInputElement).value = item.data_vencimento;
    (form.elements.namedItem('valor') as HTMLInputElement).value = ValorMonetario.paraEntrada(item.valor_centavos);
    form.querySelector<HTMLButtonElement>('.voltar-edicao')!.onclick = () => this.detalhes(item);
    form.onsubmit = evento => {
      evento.preventDefault();
      void this.executar(async () => {
        const valor = ValorMonetario.paraCentavos((form.elements.namedItem('valor') as HTMLInputElement).value);
        if (!valor) throw new Error('Informe um valor positivo com até duas casas decimais.');
        const atualizado = this.resultado(await this.api.atualizar({ id: item.id, referencia: item.referencia!, alteracoes: {
          competencia: (form.elements.namedItem('competencia') as HTMLInputElement).value,
          data_vencimento: (form.elements.namedItem('vencimento') as HTMLInputElement).value, valor_centavos: valor
        } }));
        await this.listar(); this.detalhes(atualizado); return 'Mensalidade atualizada.';
      });
    };
    detalhe.append(titulo, form);
  }

  private confirmarCancelamento(item: PagamentoDto): void {
    const detalhe = this.painel.querySelector('#detalhe-financeiro')!;
    const titulo = document.createElement('h3'); titulo.textContent = 'Confirmar cancelamento';
    const aviso = document.createElement('p'); aviso.textContent = `A mensalidade ${item.competencia} de ${item.aluno_nome}, no valor de ${ValorMonetario.formatar(item.valor_centavos)}, será cancelada. O registro e o motivo ficarão no histórico.`;
    const form = document.createElement('form'); form.id = 'cancelar-form-pagamento';
    form.innerHTML = '<label>Motivo do cancelamento (5 a 500 caracteres)<textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><button type="submit">Confirmar cancelamento</button><button type="button" class="voltar-cancelamento">Voltar</button>';
    form.querySelector<HTMLButtonElement>('.voltar-cancelamento')!.onclick = () => this.detalhes(item);
    form.onsubmit = evento => {
      evento.preventDefault();
      void this.executar(async () => {
        const cancelado = this.resultado(await this.api.cancelar({ id: item.id, referencia: item.referencia!,
          motivo: (form.elements.namedItem('motivo') as HTMLTextAreaElement).value }));
        await this.listar(); this.detalhes(cancelado); return 'Mensalidade cancelada e registrada no histórico.';
      });
    };
    detalhe.replaceChildren(titulo, aviso, form);
  }
}
