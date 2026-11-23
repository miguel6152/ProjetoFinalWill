import type { PonteAcademia, InstrutorDto, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';

export class InstrutoresTela {
  private pagina = 1;
  private busca = '';
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['instrutores']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Instrutores';
    const busca = document.createElement('form'); busca.id = 'busca-instrutores'; busca.className = 'ferramentas';
    busca.innerHTML = '<label>Buscar instrutor por nome<input name="busca" maxlength="100"></label><button type="submit">Buscar</button>';
    busca.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        this.busca = busca.querySelector('input')!.value; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil === 'admin') {
      const novo = this.botao('Novo instrutor', () => this.formulario()); novo.id = 'novo-instrutor'; busca.append(novo);
    }
    this.mensagem.id = 'mensagem-instrutores'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role','status');
    const tabela = document.createElement('table'); tabela.id = 'instrutores';
    tabela.innerHTML = '<thead><tr><th>Nome</th><th>ID do usuário</th><th>Especialidade</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.edicao.id = 'edicao-instrutor'; this.edicao.setAttribute('aria-live','polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo,busca,this.mensagem,tabela,this.paginacao,this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, busca: this.busca }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    for (const instrutor of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(instrutor.id);
      for (const texto of [instrutor.nome, String(instrutor.usuario_id), instrutor.especialidade, instrutor.ativo === 1 ? 'Ativo' : 'Inativo']) {
        const td = document.createElement('td'); td.textContent = texto; linha.append(td);
      }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: instrutor.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil === 'admin') acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: instrutor.id })); if (this.ativa) this.formulario(atual);
      }), 'editar'),this.botao('Excluir', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: instrutor.id })); if (this.ativa) this.confirmarExclusao(atual);
      }), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
      td.textContent = 'Nenhum instrutor encontrado.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1,Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} instrutor(s)`;
    const anterior = this.botao('Anterior',() => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima',() => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior,texto,proxima);
  }

  private formulario(instrutor?: InstrutorDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = instrutor === undefined ? 'Novo instrutor' : 'Editar instrutor';
    const form = document.createElement('form'); form.id = 'form-instrutor'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>Nome<input name="nome" maxlength="120" required></label>
      <label>ID do usuário (conta de login)<input name="usuario_id" type="number" min="1" required></label>
      <label>E-mail<input name="email" type="email" required></label>
      <label>Telefone<input name="telefone" required></label>
      <label>Especialidade<input name="especialidade" required></label>
      <label class="linha-checkbox"><input name="ativo" type="checkbox" checked>Instrutor ativo</label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-instrutor">Cancelar</button></div>`;
    const campo = (nome: string) => form.querySelector<HTMLInputElement>('[name=' + nome + ']')!;
    if (instrutor) {
      for (const chave of ['nome','email','telefone','especialidade','usuario_id'] as const) campo(chave).value = String(instrutor[chave]);
      campo('ativo').checked = instrutor.ativo === 1;
    }
    form.querySelector('#cancelar-instrutor')!.addEventListener('click',() => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const dados = { nome: campo('nome').value, usuario_id: Number(campo('usuario_id').value),
          email: campo('email').value, telefone: campo('telefone').value, especialidade: campo('especialidade').value, ativo: campo('ativo').checked ? 1 : 0 };
        if (instrutor === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: instrutor.id, referencia: instrutor.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Instrutor salvo.'; await this.carregar();
      });
    });
    this.edicao.replaceChildren(titulo,form); campo('nome').focus();
  }

  private detalhes(instrutor: InstrutorDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes do instrutor';
    const lista = document.createElement('dl'); lista.id = 'detalhes-instrutor'; lista.className = 'cartao';
    for (const [rotulo,valor] of [['ID do instrutor',String(instrutor.id)], ['ID do usuário',String(instrutor.usuario_id)], ['Nome',instrutor.nome], ['E-mail',instrutor.email], ['Telefone',instrutor.telefone], ['Especialidade',instrutor.especialidade],
      ['Situação',instrutor.ativo === 1 ? 'Ativo' : 'Inativo'], ['Cadastrado em',new Date(instrutor.criado_em).toLocaleString('pt-BR')], ['Atualizado em',new Date(instrutor.atualizado_em).toLocaleString('pt-BR')]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo!; dd.textContent = valor!; lista.append(dt,dd);
    }
    this.edicao.replaceChildren(titulo,lista,this.botao('Fechar',() => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(instrutor: InstrutorDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir ${instrutor.nome}? Se houver aulas ou avaliações, a exclusão será recusada. Você pode desativar o instrutor em Editar para preservar os vínculos.`;
    const confirmar = this.botao('Confirmar exclusão',() => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: instrutor.id, referencia: instrutor.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Instrutor excluído.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-instrutor';
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
