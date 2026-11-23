import type { PonteAcademia, PlanoDto, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';
import { ValorMonetario } from '../componentes/ValorMonetario.js';

export class PlanosTela {
  private pagina = 1;
  private busca = '';
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['planos']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Planos';
    const busca = document.createElement('form'); busca.id = 'busca-planos'; busca.className = 'ferramentas';
    busca.innerHTML = '<label>Buscar plano por nome<input name="busca" maxlength="100"></label><button type="submit">Buscar</button>';
    busca.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        this.busca = busca.querySelector('input')!.value; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil === 'admin') {
      const novo = this.botao('Novo plano', () => this.formulario()); novo.id = 'novo-plano'; busca.append(novo);
    }
    this.mensagem.id = 'mensagem-planos'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role','status');
    const tabela = document.createElement('table'); tabela.id = 'planos';
    tabela.innerHTML = '<thead><tr><th>Nome</th><th>Duração</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.edicao.id = 'edicao-plano'; this.edicao.setAttribute('aria-live','polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo,busca,this.mensagem,tabela,this.paginacao,this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, busca: this.busca }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    for (const plano of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(plano.id);
      for (const texto of [plano.nome, `${plano.duracao_meses} mês(es)`, ValorMonetario.formatar(plano.valor_centavos), plano.ativo === 1 ? 'Ativo' : 'Inativo']) {
        const td = document.createElement('td'); td.textContent = texto; linha.append(td);
      }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: plano.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil === 'admin') acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: plano.id })); if (this.ativa) this.formulario(atual);
      }), 'editar'),this.botao('Excluir', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: plano.id })); if (this.ativa) this.confirmarExclusao(atual);
      }), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
      td.textContent = 'Nenhum plano encontrado.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1,Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} plano(s)`;
    const anterior = this.botao('Anterior',() => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima',() => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior,texto,proxima);
  }

  private formulario(plano?: PlanoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = plano === undefined ? 'Novo plano' : 'Editar plano';
    const form = document.createElement('form'); form.id = 'form-plano'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>Nome<input name="nome" maxlength="120" required></label>
      <label>Duração<select name="duracao_meses"><option value="1">Mensal — 1 mês</option><option value="3">Trimestral — 3 meses</option><option value="12">Anual — 12 meses</option></select></label>
      <label>Valor do plano (R$)<input name="valor" inputmode="decimal" maxlength="17" placeholder="0,00" required></label>
      <label class="linha-checkbox"><input name="ativo" type="checkbox" checked>Plano ativo</label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-plano">Cancelar</button></div>`;
    const nome = form.querySelector<HTMLInputElement>('[name=nome]')!, valor = form.querySelector<HTMLInputElement>('[name=valor]')!;
    const duracao = form.querySelector<HTMLSelectElement>('[name=duracao_meses]')!, ativo = form.querySelector<HTMLInputElement>('[name=ativo]')!;
    if (plano !== undefined) { nome.value = plano.nome; valor.value = ValorMonetario.paraEntrada(plano.valor_centavos); duracao.value = String(plano.duracao_meses); ativo.checked = plano.ativo === 1; }
    form.querySelector('#cancelar-plano')!.addEventListener('click',() => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const centavos = ValorMonetario.paraCentavos(valor.value);
        if (centavos === undefined) { this.mensagem.textContent = 'Informe um valor não negativo, sem separador de milhar e com até duas casas decimais.'; return; }
        const dados = { nome: nome.value, duracao_meses: Number(duracao.value), valor_centavos: centavos, ativo: ativo.checked ? 1 : 0 };
        if (plano === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: plano.id, referencia: plano.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Plano salvo.'; await this.carregar();
      });
    });
    this.edicao.replaceChildren(titulo,form); nome.focus();
  }

  private detalhes(plano: PlanoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes do plano';
    const lista = document.createElement('dl'); lista.id = 'detalhes-plano'; lista.className = 'cartao';
    for (const [rotulo,valor] of [['ID',String(plano.id)], ['Nome',plano.nome], ['Duração',`${plano.duracao_meses} mês(es)`], ['Valor',ValorMonetario.formatar(plano.valor_centavos)],
      ['Situação',plano.ativo === 1 ? 'Ativo' : 'Inativo'], ['Cadastrado em',new Date(plano.criado_em).toLocaleString('pt-BR')], ['Atualizado em',new Date(plano.atualizado_em).toLocaleString('pt-BR')]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo!; dd.textContent = valor!; lista.append(dt,dd);
    }
    this.edicao.replaceChildren(titulo,lista,this.botao('Fechar',() => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(plano: PlanoDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir ${plano.nome}? Se houver matrículas, a exclusão será recusada. Você pode desativar o plano em Editar para preservar os vínculos.`;
    const confirmar = this.botao('Confirmar exclusão',() => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: plano.id, referencia: plano.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Plano excluído.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-plano';
    this.edicao.replaceChildren(texto,confirmar,this.botao('Cancelar',() => this.edicao.replaceChildren()));
  }

  private botao(texto: string, acao: () => void | Promise<void>, nome?: string): HTMLButtonElement {
    const botao = document.createElement('button'); botao.type = 'button'; botao.textContent = texto;
    if (nome !== undefined) botao.dataset.acao = nome;
    botao.addEventListener('click',() => { if (!this.ocupada) void acao(); }); return botao;
  }

  private exigir<T>(resultado: Resultado<T>): T {
    if (resultado.sucesso) return resultado.dados;
    if (this.ativa) {
      this.mensagem.textContent = [resultado.erro.mensagem,...Object.entries(resultado.erro.campos ?? {}).map(([campo,erros]) => `${campo}: ${erros.join(' ')}`)].join(' ');
      if (resultado.erro.codigo === 'NAO_AUTENTICADO') this.sessaoInvalida();
    }
    throw new Error('Operação recusada.');
  }

  private async proteger(acao: () => Promise<void>): Promise<void> {
    if (!this.ativa || this.ocupada) return;
    this.ocupada = true; this.mensagem.textContent = '';
    const botoes = [...this.destino.querySelectorAll<HTMLButtonElement>('button[type=submit]')];
    for (const botao of botoes) botao.disabled = true;
    try { await acao(); }
    catch { if (this.ativa && this.mensagem.textContent === '') this.mensagem.textContent = 'Não foi possível concluir a operação. Tente novamente.'; }
    finally { this.ocupada = false; for (const botao of botoes) botao.disabled = false; }
  }
}
