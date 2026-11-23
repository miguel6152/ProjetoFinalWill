import type { PonteAcademia, InscricaoDto, NovaInscricao, Perfil, Resultado } from '../../shared/ipc/ContratoIpc.js';

export class InscricoesTela {
  private pagina = 1;
  private busca = '';
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly edicao = document.createElement('section');
  private readonly paginacao = document.createElement('div');

  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['inscricoes']>,
    private readonly perfil: Perfil, private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Inscrições e chamada';
    const busca = document.createElement('form'); busca.id = 'busca-inscricoes'; busca.className = 'ferramentas';
    busca.innerHTML = '<label>ID da aula<input name="busca" maxlength="100"></label><button type="submit">Buscar</button>';
    busca.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        this.busca = busca.querySelector('input')!.value; this.pagina = 1; await this.carregar();
      });
    });
    if (this.perfil !== undefined) {
      const novo = this.botao('Nova inscrição', () => this.formulario()); novo.id = 'novo-inscricao'; busca.append(novo);
    }
    this.mensagem.id = 'mensagem-inscricoes'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role','status');
    const tabela = document.createElement('table'); tabela.id = 'inscricoes';
    tabela.innerHTML = '<thead><tr><th>ID da aula</th><th>ID do aluno</th><th>Presença</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.edicao.id = 'edicao-inscricao'; this.edicao.setAttribute('aria-live','polite');
    this.paginacao.className = 'paginacao';
    this.destino.replaceChildren(titulo,busca,this.mensagem,tabela,this.paginacao,this.edicao);
    void this.proteger(() => this.carregar());
  }

  public encerrar(): void { this.ativa = false; this.edicao.replaceChildren(); }

  private async carregar(): Promise<void> {
    const pagina = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, ...(this.busca ? {aula_id:Number(this.busca)} : {}) }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    for (const inscricao of pagina.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(inscricao.id);
      for (const texto of [String(inscricao.aula_id), String(inscricao.aluno_id), inscricao.presenca, inscricao.situacao]) {
        const td = document.createElement('td'); td.textContent = texto; linha.append(td);
      }
      const acoes = document.createElement('td'); acoes.className = 'acoes';
      acoes.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: inscricao.id })); if (this.ativa) this.detalhes(atual);
      }), 'detalhes'));
      if (this.perfil !== undefined) acoes.append(this.botao('Editar', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: inscricao.id })); if (this.ativa) this.formulario(atual);
      }), 'editar'),this.botao('Excluir', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: inscricao.id })); if (this.ativa) this.confirmarExclusao(atual);
      }), 'excluir'));
      linha.append(acoes); this.linhas.append(linha);
    }
    if (pagina.itens.length === 0) {
      const linha = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
      td.textContent = 'Nenhuma inscrição encontrada.'; linha.append(td); this.linhas.append(linha);
    }
    const total = Math.max(1,Math.ceil(pagina.total / 10)), texto = document.createElement('span');
    texto.textContent = `Página ${pagina.pagina} de ${total} · ${pagina.total} inscricao(s)`;
    const anterior = this.botao('Anterior',() => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima',() => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior,texto,proxima);
  }

  private formulario(inscricao?: InscricaoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = inscricao === undefined ? 'Nova inscrição' : 'Editar inscrição';
    const form = document.createElement('form'); form.id = 'form-inscricao'; form.className = 'cartao grade-formulario';
    form.innerHTML = `<label>ID da aula<input name="aula_id" type="number" min="1" required></label>
      <label>ID do aluno<input name="aluno_id" type="number" min="1" required></label>
      <label>Situação<select name="situacao"><option>ativa</option><option>cancelada</option></select></label>
      <label>Presença<select name="presenca"><option value="nao_registrada">Não registrada</option><option value="presente">Presente</option><option value="ausente">Ausente</option></select></label>
      <div class="acoes"><button type="submit">Salvar</button><button type="button" id="cancelar-inscricao">Cancelar</button></div>`;
    const campo = (nome: string) => form.querySelector<HTMLInputElement>('[name=' + nome + ']')!;
    if (inscricao) {
      for (const chave of ['aula_id','aluno_id','situacao','presenca'] as const) campo(chave).value = String(inscricao[chave]);
    }
    form.querySelector('#cancelar-inscricao')!.addEventListener('click',() => { if (!this.ocupada) this.edicao.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault(); void this.proteger(async () => {
        const dados: NovaInscricao = { aula_id:Number(campo('aula_id').value), aluno_id:Number(campo('aluno_id').value),
          situacao:campo('situacao').value as NovaInscricao['situacao'], presenca:campo('presenca').value as NovaInscricao['presenca'] };
        if (inscricao?.situacao === 'ativa' && dados.situacao === 'cancelada' &&
            !window.confirm('Cancelar esta inscrição e liberar a vaga?')) return;
        if (inscricao === undefined) this.exigir(await this.ponte.criar(dados));
        else this.exigir(await this.ponte.atualizar({ id: inscricao.id, referencia: inscricao.referencia, alteracoes: dados }));
        if (!this.ativa) return;
        this.edicao.replaceChildren(); this.mensagem.textContent = 'Inscrição salva.'; await this.carregar();
      });
    });
    this.edicao.replaceChildren(titulo,form); campo('aula_id').focus();
  }

  private detalhes(inscricao: InscricaoDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes da inscrição';
    const lista = document.createElement('dl'); lista.id = 'detalhes-inscricao'; lista.className = 'cartao';
    for (const [rotulo,valor] of [['ID',String(inscricao.id)], ['ID da aula',String(inscricao.aula_id)], ['ID do aluno',String(inscricao.aluno_id)], ['Situação',inscricao.situacao], ['Presença',inscricao.presenca]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo!; dd.textContent = valor!; lista.append(dt,dd);
    }
    this.edicao.replaceChildren(titulo,lista,this.botao('Fechar',() => this.edicao.replaceChildren()));
  }

  private confirmarExclusao(inscricao: InscricaoDto): void {
    const texto = document.createElement('p'); texto.textContent = `Excluir a inscrição ${inscricao.id}? Presenças lançadas e aulas concluídas impedem a exclusão.`;
    const confirmar = this.botao('Confirmar exclusão',() => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: inscricao.id, referencia: inscricao.referencia }));
      if (!this.ativa) return;
      this.edicao.replaceChildren(); this.mensagem.textContent = 'Inscrição excluída.'; this.pagina = 1; await this.carregar();
    })); confirmar.id = 'confirmar-exclusao-inscricao';
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
