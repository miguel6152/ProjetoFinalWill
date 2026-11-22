import { HorarioAula } from '../componentes/HorarioAula.js';
import type { PonteAcademia, AulaDto, NovaAula, FiltroAgenda, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';

export class AulasTela {
  private pagina = 1;
  private filtros: Omit<FiltroAgenda, 'pagina' | 'tamanho'> = {};
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['aulas']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Aulas';
    const busca = document.createElement('form'); busca.id = 'busca-aulas'; busca.className = 'ferramentas';
    busca.innerHTML = '<label>De (São Paulo)<input name="inicio" type="datetime-local"></label><label>Até (São Paulo)<input name="fim" type="datetime-local"></label><label>ID do instrutor<input name="instrutor" type="number" min="1"></label><button type="submit">Buscar</button>';
    busca.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const dados = new FormData(busca);
        const inicio = String(dados.get('inicio')), fim = String(dados.get('fim')), instrutor = dados.get('instrutor');
        this.filtros = { ...(inicio && { inicio: HorarioAula.instante(inicio) }), ...(fim && { fim: HorarioAula.instante(fim) }),
          ...(instrutor ? { instrutor_id: Number(instrutor) } : {}) }; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil !== 'recepcao') {
      const novo = this.botao('Nova aula', () => this.formulario()); novo.id = 'novo-aula'; busca.append(novo);
    }
    this.mensagem.id = 'mensagem-aulas'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role','status');
    const tabela = document.createElement('table'); tabela.id = 'aulas';
    tabela.innerHTML = '<thead><tr><th>Modalidade</th><th>Início (São Paulo)</th><th>Local</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.edicao.id = 'edicao-aula'; this.edicao.setAttribute('aria-live','polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo,busca,this.mensagem,tabela,this.paginacao,this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, ...this.filtros }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    for (const aula of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(aula.id);
      for (const texto of [aula.modalidade, HorarioAula.local(aula.inicio_em).replace("T"," "), aula.local, aula.situacao]) {
        const td = document.createElement('td'); td.textContent = texto; linha.append(td);
      }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: aula.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil !== 'recepcao') acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: aula.id })); if (this.ativa) this.formulario(atual);
      }), 'editar'),this.botao('Excluir', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: aula.id })); if (this.ativa) this.confirmarExclusao(atual);
      }), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
      td.textContent = 'Nenhuma aula encontrada.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1,Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} aula(s)`;
    const anterior = this.botao('Anterior',() => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima',() => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior,texto,proxima);
  }

  private formulario(aula?: AulaDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = aula === undefined ? 'Nova aula' : 'Editar aula';
    const form = document.createElement('form'); form.id = 'form-aula'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>ID do instrutor<input name="instrutor_id" type="number" min="1" required></label>
      <label>Modalidade<select name="modalidade"><option value="musculacao">Musculação</option><option value="funcional">Funcional</option><option value="danca">Dança</option></select></label>
      <label>Início (São Paulo)<input type="datetime-local" name="inicio_em" required></label>
      <label>Fim (São Paulo)<input type="datetime-local" name="fim_em" required></label>
      <label>Capacidade<input name="capacidade" type="number" min="1" required></label>
      <label>Local<input name="local" maxlength="200" required></label>
      <label><input type="checkbox" name="ao_ar_livre">Ao ar livre</label>
      <label>Latitude<input name="latitude" type="number" min="-90" max="90" step="any"></label>
      <label>Longitude<input name="longitude" type="number" min="-180" max="180" step="any"></label>
      <label>Situação<select name="situacao"><option>agendada</option><option>cancelada</option><option>concluida</option></select></label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-aula">Cancelar</button></div>`;
    const campo = (nome: string) => form.querySelector<HTMLInputElement>('[name=' + nome + ']')!;
    if (aula) {
      for (const chave of ['instrutor_id','modalidade','capacidade','local','latitude','longitude','situacao'] as const) campo(chave).value = String(aula[chave] ?? '');
      for (const chave of ['inicio_em','fim_em'] as const) campo(chave).value = HorarioAula.local(aula[chave]);
      campo('ao_ar_livre').checked = aula.ao_ar_livre === 1;
    }
    form.querySelector('#cancelar-aula')!.addEventListener('click',() => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const coordenada = (nome: string) => campo(nome).value === '' ? null : Number(campo(nome).value);
        const dados: NovaAula = { instrutor_id: Number(campo('instrutor_id').value), modalidade: campo('modalidade').value as NovaAula['modalidade'],
          inicio_em: HorarioAula.instante(campo('inicio_em').value), fim_em: HorarioAula.instante(campo('fim_em').value),
          capacidade: Number(campo('capacidade').value), situacao: campo('situacao').value as NovaAula['situacao'],
          local: campo('local').value, ao_ar_livre: Number(campo('ao_ar_livre').checked), latitude: coordenada('latitude'), longitude: coordenada('longitude') };
        if (aula === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: aula.id, referencia: aula.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Aula salva.'; await this.carregar();
      });
    });
    this.edicao.replaceChildren(titulo,form); campo('instrutor_id').focus();
  }

  private detalhes(aula: AulaDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes da aula';
    const lista = document.createElement('dl'); lista.id = 'detalhes-aula'; lista.className = 'cartao';
    for (const [rotulo,valor] of [['ID da aula', String(aula.id)], ['ID do instrutor', String(aula.instrutor_id)], ['Modalidade', aula.modalidade],
      ['Início (São Paulo)', HorarioAula.local(aula.inicio_em)], ['Fim (São Paulo)', HorarioAula.local(aula.fim_em)], ['Capacidade',String(aula.capacidade)],
      ['Local',aula.local], ['Ao ar livre',aula.ao_ar_livre ? 'Sim' : 'Não'], ['Latitude', String(aula.latitude ?? '—')], ['Longitude',String(aula.longitude ?? '—')], ['Situação',aula.situacao]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo!; dd.textContent = valor!; lista.append(dt,dd);
    }
    this.edicao.replaceChildren(titulo,lista,this.botao('Fechar',() => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(aula: AulaDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir a aula de ${aula.modalidade} em ${aula.local}? A exclusão exige uma aula sem inscrições.`;
    const confirmar = this.botao('Confirmar exclusão',() => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: aula.id, referencia: aula.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Aula excluída.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-aula';
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
