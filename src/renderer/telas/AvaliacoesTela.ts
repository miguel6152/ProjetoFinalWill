import type { PonteAcademia, AvaliacaoDto, NovaAvaliacao, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';

export class AvaliacoesTela {
  private pagina = 1;
  private busca = '';
  private inicio = '';
  private fim = '';
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['avaliacoes']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Avaliações físicas';
    const busca = document.createElement('form'); busca.id = 'busca-avaliacoes'; busca.className = 'ferramentas';
    busca.innerHTML = '<label>ID do aluno<input name="busca" type="number" min="1"></label><label>De<input name="inicio" type="date"></label><label>Até<input name="fim" type="date"></label><button type="submit">Buscar</button>';
    busca.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        this.busca = busca.querySelector<HTMLInputElement>('[name=busca]')!.value;
        this.inicio=busca.querySelector<HTMLInputElement>('[name=inicio]')!.value;
        this.fim=busca.querySelector<HTMLInputElement>('[name=fim]')!.value; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil !== undefined) {
      const novo = this.botao('Nova avaliação', () => this.formulario()); novo.id = 'novo-avaliacao'; busca.append(novo);
    }
    this.mensagem.id = 'mensagem-avaliacoes'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role','status');
    const tabela = document.createElement('table'); tabela.id = 'avaliacoes';
    tabela.innerHTML = '<thead><tr><th>Aluno</th><th>Data</th><th>Peso (kg)</th><th>Altura (cm)</th><th>Variação desde a avaliação anterior nesta página</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.edicao.id = 'edicao-avaliacao'; this.edicao.setAttribute('aria-live','polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo,busca,this.mensagem,tabela,this.paginacao,this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, ...(this.inicio && {inicio:this.inicio}), ...(this.fim && {fim:this.fim}), ...(this.busca ? {aluno_id:Number(this.busca)} : {}) }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    const anteriores = new Map<number,AvaliacaoDto>();
    for (const avaliacao of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(avaliacao.id);
      for (const texto of [String(avaliacao.aluno_id), avaliacao.realizada_em, String(avaliacao.peso_kg), String(avaliacao.altura_cm)]) {
        const td = document.createElement('td'); td.textContent = texto; linha.append(td);
      }
      const anterior=anteriores.get(avaliacao.aluno_id);
      const variacao=document.createElement('td');
      variacao.textContent=anterior
        ? `${(avaliacao.peso_kg-anterior.peso_kg).toFixed(2)} kg / ${(avaliacao.altura_cm-anterior.altura_cm).toFixed(2)} cm`
        : '—';
      linha.append(variacao);
      anteriores.set(avaliacao.aluno_id,avaliacao);
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: avaliacao.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil !== undefined) acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: avaliacao.id })); if (this.ativa) this.formulario(atual);
      }), 'editar'),this.botao('Excluir', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: avaliacao.id })); if (this.ativa) this.confirmarExclusao(atual);
      }), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 6;
      td.textContent = 'Nenhuma avaliação encontrada.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1,Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} avaliacao(s)`;
    const anterior = this.botao('Anterior',() => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima',() => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior,texto,proxima);
  }

  private formulario(avaliacao?: AvaliacaoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = avaliacao === undefined ? 'Nova avaliação' : 'Editar avaliação';
    const form = document.createElement('form'); form.id = 'form-avaliacao'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>ID do aluno<input name="aluno_id" type="number" required ></label>
<label>ID do instrutor (admin)<input name="instrutor_id" type="number"  ></label>
<label>Data<input name="realizada_em" type="date" required ></label>
<label>peso (kg)<input name="peso_kg" type="number" required step="any" min="0.001"></label>
<label>altura (cm)<input name="altura_cm" type="number" required step="any" min="0.001"></label>
<label>cintura (cm)<input name="cintura_cm" type="number"  step="any" min="0.001"></label>
<label>quadril (cm)<input name="quadril_cm" type="number"  step="any" min="0.001"></label>
<label>braco (cm)<input name="braco_cm" type="number"  step="any" min="0.001"></label>
<label>coxa (cm)<input name="coxa_cm" type="number"  step="any" min="0.001"></label>
<label>Observações<input name="observacoes" type="text"  ></label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-avaliacao">Cancelar</button></div>`;
    const campo = (nome: string) => form.querySelector<HTMLInputElement>('[name=' + nome + ']')!;
    if (avaliacao) {
      for (const chave of ["aluno_id","instrutor_id","realizada_em","peso_kg","altura_cm","cintura_cm","quadril_cm","braco_cm","coxa_cm","observacoes"] as const) campo(chave).value = String(avaliacao[chave] ?? '');
    }
    form.querySelector('#cancelar-avaliacao')!.addEventListener('click',() => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const medida=(nome:string)=>campo(nome).value === '' ? null : Number(campo(nome).value);
        const dados: NovaAvaliacao = {aluno_id:Number(campo('aluno_id').value),realizada_em:campo('realizada_em').value,
          peso_kg:Number(campo('peso_kg').value),altura_cm:Number(campo('altura_cm').value),
          cintura_cm:medida('cintura_cm'),quadril_cm:medida('quadril_cm'),braco_cm:medida('braco_cm'),coxa_cm:medida('coxa_cm'),
          observacoes:campo('observacoes').value || null,
          ...(this.perfil==='admin' ? {instrutor_id:Number(campo('instrutor_id').value)} : {})};
        if (avaliacao === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: avaliacao.id, referencia: avaliacao.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Avaliação salva.'; await this.carregar();
      });
    });
    campo('instrutor_id').closest('label')!.hidden=this.perfil !== 'admin';
    this.edicao.replaceChildren(titulo,form); campo('aluno_id').focus();
  }

  private detalhes(avaliacao: AvaliacaoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes da avaliação';
    const lista = document.createElement('dl'); lista.id = 'detalhes-avaliacao'; lista.className = 'cartao';
    for (const [rotulo,valor] of [['ID',String(avaliacao.id)],...["aluno_id","instrutor_id","realizada_em","peso_kg","altura_cm","cintura_cm","quadril_cm","braco_cm","coxa_cm","observacoes"].map(chave=>[chave.replace('_kg',' (kg)').replace('_cm',' (cm)'),String(avaliacao[chave as keyof AvaliacaoDto] ?? 'Não informada')])]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo!; dd.textContent = valor!; lista.append(dt,dd);
    }
    this.edicao.replaceChildren(titulo,lista,this.botao('Fechar',() => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(avaliacao: AvaliacaoDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir a avaliação ${avaliacao.id}? Confirme a remoção deste registro do histórico.`;
    const confirmar = this.botao('Confirmar exclusão',() => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: avaliacao.id, referencia: avaliacao.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Avaliação excluída.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-avaliacao';
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
