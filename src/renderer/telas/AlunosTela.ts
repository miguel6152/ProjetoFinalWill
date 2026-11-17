import type { PonteAcademia, AlunoDto, AlunoInstrutorDto, NovoAluno, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';
import { ConsultaCepFormulario } from '../componentes/ConsultaCepFormulario.js';

export class AlunosTela {
  private pagina = 1;
  private busca = '';
  private ativa = true;
  private ocupada = false;
  private consulta = 0;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['alunos']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void,
    private readonly endereco?: PonteAcademia['endereco']) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Alunos';
    const ferramentas = document.createElement('form'); ferramentas.id = 'busca-alunos'; ferramentas.className = 'ferramentas';
    ferramentas.innerHTML = '<label>Buscar<input name="busca" maxlength="100"></label><button type="submit">Buscar</button>';
    ferramentas.querySelector('input')!.placeholder = this.perfil === 'instrutor' ? 'Nome do aluno' : 'Nome, CPF sem pontuação, e-mail ou telefone';
    ferramentas.addEventListener('submit', e => {
      e.preventDefault(); void this.proteger(async () => {
        this.busca = ferramentas.querySelector('input')!.value; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil !== 'instrutor') {
      const novo = this.botao('Novo aluno', () => { if (!this.ocupada) this.formulario(); });
      novo.id = 'novo-aluno'; ferramentas.append(novo);
    }
    this.mensagem.id = 'mensagem-alunos'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role', 'status');
    const tabela = document.createElement('table'); tabela.id = 'alunos';
    tabela.innerHTML = this.perfil === 'instrutor'
      ? '<thead><tr><th>Nome</th><th>Situação</th><th>Ações</th></tr></thead>'
      : '<thead><tr><th>Nome</th><th>CPF</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas);
    this.edicao.id = 'edicao-aluno'; this.edicao.setAttribute('aria-live', 'polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo, ferramentas, this.mensagem, tabela, this.paginacao, this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.consulta++; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const consulta = ++this.consulta;
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, busca: this.busca }));
    if (!this.ativa || consulta !== this.consulta) return;
    this.linhas.replaceChildren();
    for (const aluno of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(aluno.id);
      const textos = this.perfil === 'instrutor' ? [aluno.nome] : [aluno.nome, aluno.cpf_mascarado ?? ''];
      textos.push(aluno.ativo === 1 ? 'Ativo' : 'Inativo');
      for (const texto of textos) { const td = document.createElement('td'); td.textContent = texto; linha.append(td); }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: aluno.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil !== 'instrutor') {
        acoes.append(this.botao('Editar', () => this.proteger(async () => {
          const atual = this.exigir(await this.ponte.obter({ id: aluno.id }));
          if (this.ativa && 'cpf' in atual) this.formulario(atual);
        }), 'editar'));
      }
      if (this.perfil === 'admin') {
        acoes.append(this.botao('Excluir', () => this.proteger(async () => {
          const atual = this.exigir(await this.ponte.obter({ id: aluno.id }));
          if (this.ativa && 'cpf' in atual) this.confirmarExclusao(atual);
        }), 'excluir'));
      }
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = this.perfil === 'instrutor' ? 3 : 4;
      td.textContent = 'Nenhum aluno encontrado.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1, Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} aluno(s)`;
    const anterior = this.botao('Anterior', () => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima', () => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior, texto, proxima);
  }

  private formulario(aluno?: AlunoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = aluno === undefined ? 'Novo aluno' : 'Editar aluno';
    const form = document.createElement('form'); form.id = 'form-aluno'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>Nome completo<input name="nome" minlength="3" maxlength="120" required></label>
      <label>CPF<input name="cpf" inputmode="numeric" maxlength="14" required></label>
      <label>Data de nascimento<input name="data_nascimento" type="date" required></label>
      <label>E-mail (opcional)<input name="email" type="email" maxlength="254"></label>
      <label>Telefone com DDD (opcional)<input name="telefone" type="tel" maxlength="24"></label>
      <label>CEP<input name="cep" inputmode="numeric" maxlength="9" required></label>
      <div><button type="button" id="consultar-cep">Consultar CEP</button><p id="mensagem-cep" class="mensagem" role="status"></p></div>
      <label>Logradouro<input name="logradouro" maxlength="120" required></label>
      <label>Número (ou s/n)<input name="numero" maxlength="20" required></label>
      <label>Complemento (opcional)<input name="complemento" maxlength="120"></label>
      <label>Bairro<input name="bairro" maxlength="120" required></label>
      <label>Cidade<input name="cidade" maxlength="120" required></label>
      <label>UF<select name="uf" required><option value="">Selecione</option></select></label>
      <label class="linha-checkbox"><input name="ativo" type="checkbox" checked>Aluno ativo</label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-aluno">Cancelar</button></div>`;
    const uf = form.querySelector<HTMLSelectElement>('[name=uf]')!;
    for (const estado of ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) {
      const opcao = document.createElement('option'); opcao.value = estado; opcao.textContent = estado; uf.append(opcao);
    }
    if (aluno !== undefined) {
      for (const campo of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name],select[name]')) {
        const valor = aluno[campo.name as keyof AlunoDto];
        if (campo instanceof HTMLInputElement && campo.type === 'checkbox') campo.checked = valor === 1;
        else campo.value = valor === null || valor === undefined ? '' : String(valor);
      }
    }
    form.querySelector('#cancelar-aluno')!.addEventListener('click', () => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      void this.proteger(async () => {
        const valor = (nome: string): string => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${nome}]`)!.value;
        const opcional = (nome: string): string | null => valor(nome).trim() === '' ? null : valor(nome);
        const dados: NovoAluno = { nome: valor('nome'), cpf: valor('cpf'), data_nascimento: valor('data_nascimento'),
          email: opcional('email'), telefone: opcional('telefone'), cep: valor('cep'), logradouro: valor('logradouro'),
          numero: valor('numero'), complemento: opcional('complemento'), bairro: valor('bairro'), cidade: valor('cidade'),
          uf: valor('uf'), ativo: form.querySelector<HTMLInputElement>('[name=ativo]')!.checked ? 1 : 0 };
        if (aluno === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: aluno.id, referencia: aluno.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Aluno salvo.'; await this.carregar();
      });
    });
    new ConsultaCepFormulario(form, this.endereco, this.sessaoInvalida);
    this.edicao.replaceChildren(titulo, form); form.querySelector('input')!.focus();
  }

  private detalhes(aluno: AlunoDto | AlunoInstrutorDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes do aluno';
    const lista = document.createElement('dl'); lista.id = 'detalhes-aluno'; lista.className = 'cartao';
    const campos: [string, string][] = [['Nome', aluno.nome], ['Situação', aluno.ativo === 1 ? 'Ativo' : 'Inativo']];
    if ('cpf' in aluno) campos.push(['CPF', aluno.cpf], ['Nascimento', aluno.data_nascimento], ['E-mail', aluno.email ?? 'Não informado'],
      ['Telefone', aluno.telefone ?? 'Não informado'], ['CEP', aluno.cep], ['Logradouro', aluno.logradouro], ['Número', aluno.numero],
      ['Complemento', aluno.complemento ?? 'Não informado'], ['Bairro', aluno.bairro], ['Cidade', aluno.cidade], ['UF', aluno.uf],
      ['Cadastrado em', new Date(aluno.criado_em).toLocaleString('pt-BR')], ['Atualizado em', new Date(aluno.atualizado_em).toLocaleString('pt-BR')]);
    for (const [rotulo, valor] of campos) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo; dd.textContent = valor; lista.append(dt, dd);
    }
    this.edicao.replaceChildren(titulo, lista, this.botao('Fechar', () => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(aluno: AlunoDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir ${aluno.nome}? Se houver matrículas, inscrições ou avaliações, a exclusão será recusada. Você pode desativar o aluno em Editar.`;
    const confirmar = this.botao('Confirmar exclusão', () => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: aluno.id, referencia: aluno.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Aluno excluído.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-aluno';
    this.edicao.replaceChildren(texto, confirmar, this.botao('Cancelar', () => { if (!this.ocupada) this.edicao.replaceChildren(); }));
  }

  private botao(texto: string, acao: () => void | Promise<void>, nome?: string): HTMLButtonElement {
    const botao = document.createElement('button'); botao.type = 'button'; botao.textContent = texto;
    if (nome !== undefined) botao.dataset.acao = nome;
    botao.addEventListener('click', () => { if (!this.ocupada) void acao(); }); return botao;
  }

  private exigir<T>(resultado: Resultado<T>): T {
    if (resultado.sucesso) return resultado.dados;
    if (this.ativa) {
      this.mensagem.textContent = [resultado.erro.mensagem, ...Object.entries(resultado.erro.campos ?? {}).map(([campo, erros]) => `${campo}: ${erros.join(' ')}`)].join(' ');
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
