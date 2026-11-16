import type { PonteAcademia, UsuarioDto, Resultado, Perfil } from '../../shared/ipc/ContratoIpc.js';

export class UsuariosTela {
  private pagina = 1;
  private busca = '';
  private consulta = 0;
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['usuarios']>,
    private readonly sessaoInvalida: () => void, private readonly usuarioAtualId: number) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Usuários';
    const ferramentas = document.createElement('form'); ferramentas.id = 'busca-usuarios'; ferramentas.className = 'ferramentas';
    ferramentas.innerHTML = '<label>Buscar por nome ou e-mail<input name="busca" maxlength="100"></label><button type="submit">Buscar</button><button type="button" id="novo-usuario">Novo usuário</button>';
    ferramentas.addEventListener('submit', e => {
      e.preventDefault(); this.busca = ferramentas.querySelector<HTMLInputElement>('input')!.value; this.pagina = 1;
      void this.proteger(() => this.carregar());
    });
    ferramentas.querySelector('#novo-usuario')!.addEventListener('click', () => this.formulario());
    this.mensagem.id = 'mensagem-usuarios'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role', 'status');
    const tabela = document.createElement('table'); tabela.id = 'usuarios';
    tabela.innerHTML = '<thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas);
    this.edicao.id = 'edicao-usuario'; this.edicao.setAttribute('aria-live', 'polite');
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
    for (const usuario of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(usuario.id);
      for (const texto of [usuario.nome, usuario.email, usuario.perfil, usuario.ativo === 1 ? 'Ativo' : 'Inativo']) {
        const celula = document.createElement('td'); celula.textContent = texto; linha.append(celula);
      }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: usuario.id }));
        if (this.ativa) this.formulario(atual);
      }), 'editar'), this.botao('Redefinir senha', () => this.redefinir(usuario), 'senha'),
      this.botao('Excluir', () => this.excluir(usuario), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), celula = document.createElement('td'); celula.colSpan = 5;
      celula.textContent = 'Nenhum usuário encontrado.'; linha.append(celula); this.linhas.append(linha);
    }
    const total = Math.max(1, Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} usuário(s)`;
    const anterior = this.botao('Anterior', () => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima', () => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior, texto, proxima);
  }

  private formulario(usuario?: UsuarioDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = usuario === undefined ? 'Novo usuário' : 'Editar usuário';
    const form = document.createElement('form'); form.id = 'form-usuario'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>Nome<input name="nome" maxlength="120" required></label><label>E-mail<input name="email" type="email" maxlength="254" required></label>
      <label>Perfil<select name="perfil"><option value="recepcao">Recepção</option><option value="instrutor">Instrutor</option><option value="admin">Administrador</option></select></label>
      <label class="linha-checkbox"><input name="ativo" type="checkbox" checked>Usuário ativo</label>
      <label id="senha-novo">Senha inicial<input name="senha" type="password" autocomplete="new-password" maxlength="1024"></label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-edicao">Cancelar</button></div>`;
    const nome = form.querySelector<HTMLInputElement>('[name=nome]')!, email = form.querySelector<HTMLInputElement>('[name=email]')!;
    const perfil = form.querySelector<HTMLSelectElement>('[name=perfil]')!, ativo = form.querySelector<HTMLInputElement>('[name=ativo]')!;
    const senha = form.querySelector<HTMLInputElement>('[name=senha]')!;
    senha.minLength = 15; senha.placeholder = 'Pelo menos 15 caracteres';
    senha.required = usuario === undefined; form.querySelector<HTMLElement>('#senha-novo')!.hidden = usuario !== undefined;
    if (usuario !== undefined) { nome.value = usuario.nome; email.value = usuario.email; perfil.value = usuario.perfil; ativo.checked = usuario.ativo === 1; }
    form.querySelector('#cancelar-edicao')!.addEventListener('click', () => this.edicao.replaceChildren());
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      void this.proteger(async () => {
        const dados = { nome: nome.value, email: email.value, perfil: perfil.value as Perfil, ativo: ativo.checked ? 1 : 0 };
        try {
          if (usuario === undefined) this.exigir(await this.ponte.criar({ ...dados, senha: senha.value }));
          else this.exigir(await this.ponte.atualizar({ id: usuario.id, referencia: usuario.referencia!, alteracoes: dados }));
          if (!this.ativa) return;
          this.edicao.replaceChildren(); this.mensagem.textContent = 'Usuário salvo.'; await this.carregar();
        } finally { senha.value = ''; }
      });
    });
    this.edicao.replaceChildren(titulo, form); nome.focus();
  }

  private redefinir(usuario: UsuarioDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = `Redefinir a senha de ${usuario.nome}`;
    const form = document.createElement('form'); form.id = 'form-senha'; form.className = 'cartao';
    form.innerHTML = '<label>Nova senha (pelo menos 15 caracteres)<input name="senha" type="password" autocomplete="new-password" minlength="15" maxlength="1024" required></label><button type="submit">Redefinir senha</button>';
    const senha = form.querySelector<HTMLInputElement>('input')!;
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      void this.proteger(async () => {
        try {
          this.exigir(await this.ponte.alterarSenha({ id: usuario.id, referencia: usuario.referencia!, senha: senha.value }));
          if (!this.ativa) return;
          if (usuario.id === this.usuarioAtualId) { this.sessaoInvalida(); return; }
          this.edicao.replaceChildren(); this.mensagem.textContent = 'Senha redefinida. As sessões anteriores foram encerradas.';
        } finally { senha.value = ''; }
      });
    });
    this.edicao.replaceChildren(titulo, form, this.botao('Cancelar', () => this.edicao.replaceChildren())); senha.focus();
  }

  private excluir(usuario: UsuarioDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir o usuário ${usuario.nome} (${usuario.email})?`;
    const confirmar = this.botao('Confirmar exclusão', () => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: usuario.id, referencia: usuario.referencia! }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Usuário excluído.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao';
    this.edicao.replaceChildren(texto, confirmar, this.botao('Cancelar', () => this.edicao.replaceChildren()));
  }

  private botao(texto: string, acao: () => void | Promise<void>, nome?: string): HTMLButtonElement {
    const botao = document.createElement('button'); botao.type = 'button'; botao.textContent = texto;
    if (nome !== undefined) botao.dataset.acao = nome;
    botao.addEventListener('click', () => { void acao(); }); return botao;
  }

  private exigir<T>(resultado: Resultado<T>): T {
    if (resultado.sucesso) return resultado.dados;
    if (this.ativa) {
      this.mensagem.textContent = resultado.erro.mensagem;
      if (resultado.erro.codigo === 'NAO_AUTENTICADO') this.sessaoInvalida();
    }
    throw new Error('Operação recusada.');
  }

  private async proteger(acao: () => Promise<void>): Promise<void> {
    if (!this.ativa || this.ocupada) return;
    this.ocupada = true;
    const botoes = [...this.destino.querySelectorAll<HTMLButtonElement>('button[type=submit]')];
    for (const botao of botoes) botao.disabled = true;
    this.mensagem.textContent = '';
    try { await acao(); }
    catch { if (this.ativa && this.mensagem.textContent === '') this.mensagem.textContent = 'Não foi possível concluir a operação. Tente novamente.'; }
    finally { this.ocupada = false; for (const botao of botoes) botao.disabled = false; }
  }
}
