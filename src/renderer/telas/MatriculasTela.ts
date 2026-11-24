import type { ListaMatriculas, MatriculaDto, PonteAcademia, Resultado, Perfil } from '../../shared/ipc/ContratoIpc.js';
import { ValorMonetario } from '../componentes/ValorMonetario.js';

export class MatriculasTela {
  private ativa = true;
  private ocupada = false;
  private pagina = 1;
  private filtros: Omit<ListaMatriculas, 'pagina' | 'tamanho'> = {};
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly paginacao = document.createElement('div');
  private readonly detalhesArea = document.createElement('section');
  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['matriculas']>, private readonly sessaoInvalida: () => void, private readonly perfil: Perfil) {}
  public mostrar(): void {
    const titulo = document.createElement('h2'); titulo.textContent = 'Matrículas';
    const filtros = document.createElement('form'); filtros.id = 'filtros-matriculas'; filtros.className = 'ferramentas';
    filtros.innerHTML = '<label>ID do aluno<input name="aluno_id" type="number" min="1" step="1"></label><label>ID do plano<input name="plano_id" type="number" min="1" step="1"></label><label>Situação<select name="situacao"><option value="">Todas</option><option value="ativa">Ativa</option><option value="cancelada">Cancelada</option><option value="encerrada">Encerrada</option></select></label><button type="submit">Filtrar</button>';
    filtros.addEventListener('submit', evento => {
      evento.preventDefault();
      const aluno = filtros.querySelector<HTMLInputElement>('[name=aluno_id]')!.value;
      const plano = filtros.querySelector<HTMLInputElement>('[name=plano_id]')!.value;
      const situacao = filtros.querySelector<HTMLSelectElement>('[name=situacao]')!.value as ListaMatriculas['situacao'] | '';
      this.filtros = { ...(aluno ? { aluno_id: Number(aluno) } : {}), ...(plano ? { plano_id: Number(plano) } : {}), ...(situacao ? { situacao } : {}) };
      this.pagina = 1; this.detalhesArea.replaceChildren(); void this.proteger(() => this.carregar());
    });
    const novo = this.botao('Nova matrícula', () => this.formulario()); novo.id = 'nova-matricula'; filtros.append(novo);
    this.mensagem.id = 'mensagem-matriculas'; this.mensagem.className = 'mensagem'; this.mensagem.setAttribute('role', 'status');
    const tabela = document.createElement('table'); tabela.id = 'matriculas';
    tabela.innerHTML = '<thead><tr><th>ID</th><th>Aluno</th><th>Plano</th><th>Início</th><th>Fim</th><th>Situação</th><th>Ações</th></tr></thead>';
    tabela.append(this.linhas); this.paginacao.className = 'paginacao'; this.detalhesArea.setAttribute('aria-live', 'polite');
    this.destino.replaceChildren(titulo, filtros, this.mensagem, tabela, this.paginacao, this.detalhesArea);
    void this.proteger(() => this.carregar());
  }
  public encerrar(): void { this.ativa = false; }
  private formulario(): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Nova matrícula';
    const form = document.createElement('form'); form.id = 'form-matricula'; form.className = 'cartao grade-formulario';
    form.innerHTML = '<label>ID do aluno<input name="aluno_id" type="number" min="1" step="1" required></label><label>ID do plano ativo<input name="plano_id" type="number" min="1" step="1" required></label><label>Início<input name="data_inicio" type="date" required></label><label>Fim<input name="data_fim" type="date" required></label><label>Valor contratado (R$)<input name="valor" inputmode="decimal" required></label><div class="acoes"><button type="submit">Salvar matrícula</button><button type="button" id="fechar-form-matricula">Fechar</button></div>';
    form.querySelector('#fechar-form-matricula')!.addEventListener('click', () => { if (!this.ocupada) this.detalhesArea.replaceChildren(); });
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      void this.proteger(async () => {
        const valor = ValorMonetario.paraCentavos(form.querySelector<HTMLInputElement>('[name=valor]')!.value);
        if (valor === undefined) { this.mensagem.textContent = 'Informe um valor não negativo com até duas casas decimais.'; return; }
        const matricula = this.exigir(await this.ponte.criar({ aluno_id: Number(form.querySelector<HTMLInputElement>('[name=aluno_id]')!.value),
          plano_id: Number(form.querySelector<HTMLInputElement>('[name=plano_id]')!.value), data_inicio: form.querySelector<HTMLInputElement>('[name=data_inicio]')!.value,
          data_fim: form.querySelector<HTMLInputElement>('[name=data_fim]')!.value, valor_contratado_centavos: valor }));
        if (!this.ativa) return;
        this.pagina = 1; this.detalhesArea.replaceChildren(); this.mensagem.textContent = 'Matrícula cadastrada.';
        await this.carregar(); this.detalhes(matricula);
      });
    });
    this.detalhesArea.replaceChildren(titulo, form);
  }
  private async carregar(): Promise<void> {
    const resultado = this.exigir(await this.ponte.listar({ pagina: this.pagina, tamanho: 10, ...this.filtros }));
    if (!this.ativa) return;
    this.linhas.replaceChildren();
    for (const m of resultado.itens) {
      const linha = document.createElement('tr'); linha.dataset.id = String(m.id);
      for (const valor of [String(m.id), `${m.aluno_nome} (ID ${m.aluno_id})`, `${m.plano_nome} (ID ${m.plano_id})`, m.data_inicio, m.data_fim, m.situacao]) {
        const celula = document.createElement('td'); celula.textContent = valor; linha.append(celula);
      }
      const celula = document.createElement('td');
      celula.append(this.botao('Detalhes', () => this.proteger(async () => {
        const atual = this.exigir(await this.ponte.obter({ id: m.id })); if (this.ativa) this.detalhes(atual);
      })));
      linha.append(celula); this.linhas.append(linha);
    }
    if (!resultado.itens.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 7; td.textContent = 'Nenhuma matrícula encontrada.'; tr.append(td); this.linhas.append(tr); }
    const total = Math.max(1, Math.ceil(resultado.total / resultado.tamanho));
    const texto = document.createElement('span'); texto.textContent = `Página ${resultado.pagina} de ${total} · ${resultado.total} matrícula(s)`;
    const anterior = this.botao('Anterior', () => this.proteger(async () => { this.pagina--; await this.carregar(); }));
    const proxima = this.botao('Próxima', () => this.proteger(async () => { this.pagina++; await this.carregar(); }));
    anterior.disabled = this.pagina <= 1; proxima.disabled = this.pagina >= total;
    this.paginacao.replaceChildren(anterior, texto, proxima);
  }
  private detalhes(m: MatriculaDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Detalhes da matrícula';
    const lista = document.createElement('dl'); lista.id = 'detalhes-matricula'; lista.className = 'cartao';
    const campos: [string, string][] = [['ID', String(m.id)], ['Aluno', `${m.aluno_nome} (ID ${m.aluno_id})`], ['Plano', `${m.plano_nome} (ID ${m.plano_id})`], ['Início', m.data_inicio], ['Fim', m.data_fim], ['Valor contratado', ValorMonetario.formatar(m.valor_contratado_centavos)], ['Situação', m.situacao], ['Cadastrada em', new Date(m.criado_em).toLocaleString('pt-BR')], ['Atualizada em', new Date(m.atualizado_em).toLocaleString('pt-BR')]];
    for (const [rotulo, valor] of campos) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = rotulo; dd.textContent = valor; lista.append(dt, dd); }
    this.detalhesArea.replaceChildren(titulo, lista, this.botao('Fechar', () => this.detalhesArea.replaceChildren()));
    if (m.situacao === 'ativa') {
      const editar = this.botao('Editar matrícula', () => this.editar(m)); editar.id = 'editar-matricula';
      this.detalhesArea.append(editar);
      const cancelar = this.botao('Cancelar matrícula', () => this.confirmarSituacao(m, 'cancelar')); cancelar.id = 'cancelar-matricula';
      const encerrar = this.botao('Encerrar matrícula', () => this.confirmarSituacao(m, 'encerrar')); encerrar.id = 'encerrar-matricula';
      this.detalhesArea.append(cancelar, encerrar);
    }
    if (this.perfil === 'admin' && m.referencia !== undefined) {
      const excluir = this.botao('Excluir matrícula', () => this.confirmarExclusao(m)); excluir.id = 'excluir-matricula'; this.detalhesArea.append(excluir);
    }
  }
  private editar(m: MatriculaDto): void {
    const titulo = document.createElement('h3'); titulo.textContent = 'Editar matrícula';
    const form = document.createElement('form'); form.id = 'form-editar-matricula'; form.className = 'cartao grade-formulario';
    form.innerHTML = '<label>ID do aluno<input name="aluno_id" type="number" min="1" step="1" required></label><label>ID do plano ativo<input name="plano_id" type="number" min="1" step="1" required></label><label>Início<input name="data_inicio" type="date" required></label><label>Fim<input name="data_fim" type="date" required></label><label>Valor contratado (R$)<input name="valor" inputmode="decimal" required></label><div class="acoes"><button type="submit">Salvar alterações</button><button type="button" id="fechar-edicao-matricula">Cancelar edição</button></div>';
    const campo = (nome: string): HTMLInputElement => form.querySelector<HTMLInputElement>(`[name=${nome}]`)!;
    campo('aluno_id').value = String(m.aluno_id);
    campo('plano_id').value = String(m.plano_id);
    campo('data_inicio').value = m.data_inicio;
    campo('data_fim').value = m.data_fim;
    campo('valor').value = ValorMonetario.paraEntrada(m.valor_contratado_centavos);
    form.querySelector<HTMLButtonElement>('#fechar-edicao-matricula')!.addEventListener('click', () => {
      if (!this.ocupada) this.detalhesArea.replaceChildren();
    });
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      void this.proteger(async () => {
        const valor = ValorMonetario.paraCentavos(campo('valor').value);
        if (valor === undefined) { this.mensagem.textContent = 'Informe um valor não negativo com até duas casas decimais.'; return; }
        const atualizada = this.exigir(await this.ponte.atualizar({ id: m.id, referencia: m.referencia!, alteracoes: {
          aluno_id: Number(campo('aluno_id').value), plano_id: Number(campo('plano_id').value),
          data_inicio: campo('data_inicio').value, data_fim: campo('data_fim').value, valor_contratado_centavos: valor
        } }));
        if (!this.ativa) return;
        await this.carregar();
        if (!this.ativa) return;
        this.detalhes(atualizada); this.mensagem.textContent = 'Matrícula atualizada.';
      });
    });
    this.detalhesArea.replaceChildren(titulo, form, this.botao('Voltar aos detalhes', () => this.detalhes(m)));
  }
  private confirmarExclusao(m: MatriculaDto): void {
    const referencia = m.referencia;
    if (referencia === undefined) return;
    const texto = document.createElement('p'); texto.textContent = `Excluir definitivamente a matrícula ${m.id} de ${m.aluno_nome}? Matrículas com pagamentos ou notificações vinculados não podem ser excluídas.`;
    const confirmar = this.botao('Confirmar exclusão', () => this.proteger(async () => {
      this.exigir(await this.ponte.excluir({ id: m.id, referencia }));
      if (!this.ativa) return;
      this.detalhesArea.replaceChildren(); await this.carregar();
      if (this.ativa) this.mensagem.textContent = 'Matrícula excluída.';
    })); confirmar.id = 'confirmar-exclusao-matricula';
    this.detalhesArea.replaceChildren(texto, confirmar, this.botao('Voltar', () => this.detalhes(m)));
  }
  private confirmarSituacao(m: MatriculaDto, acao: 'cancelar' | 'encerrar'): void {
    const texto = document.createElement('p'); texto.textContent = `Confirmar ${acao} da matrícula ${m.id} de ${m.aluno_nome}?`;
    const confirmar = this.botao('Confirmar', () => this.proteger(async () => {
      const resultado = this.exigir(await this.ponte[acao]({ id: m.id }));
      if (!this.ativa) return;
      await this.carregar();
      if (!this.ativa) return;
      this.detalhes(resultado); this.mensagem.textContent = acao === 'cancelar' ? 'Matrícula cancelada.' : 'Matrícula encerrada.';
    })); confirmar.id = 'confirmar-situacao-matricula';
    this.detalhesArea.replaceChildren(texto, confirmar, this.botao('Voltar', () => this.detalhes(m)));
  }
  private botao(texto: string, acao: () => void | Promise<void>): HTMLButtonElement {
    const botao = document.createElement('button'); botao.type = 'button'; botao.textContent = texto;
    botao.addEventListener('click', () => { if (!this.ocupada) void acao(); }); return botao;
  }
  private exigir<T>(resultado: Resultado<T>): T {
    if (resultado.sucesso) return resultado.dados;
    if (this.ativa) { this.mensagem.textContent = [resultado.erro.mensagem, ...Object.values(resultado.erro.campos ?? {}).flat()].join(' '); if (resultado.erro.codigo === 'NAO_AUTENTICADO') this.sessaoInvalida(); }
    throw new Error('Consulta recusada');
  }
  private async proteger(acao: () => Promise<void>): Promise<void> {
    if (!this.ativa || this.ocupada) return;
    this.ocupada = true; this.mensagem.textContent = '';
    try { await acao(); } catch { if (this.ativa && !this.mensagem.textContent) this.mensagem.textContent = 'Não foi possível consultar as matrículas.'; }
    finally { this.ocupada = false; }
  }
}
