import type { PonteAcademia, Resultado } from '../../shared/ipc/ContratoIpc.js';
import type { AvisoDto, FiltroAvisos } from '../../shared/tipos/Aviso.js';

export class AvisosTela {
  private readonly painel = document.createElement('section');
  private readonly estado = document.createElement('p');
  private readonly tabela = document.createElement('table');
  private filtro: FiltroAvisos = { busca: '', estado: 'ativos' };
  private ocupado = false;

  public constructor(private readonly raiz: HTMLElement, private readonly api: NonNullable<PonteAcademia['avisos']>,
    private readonly sessaoEncerrada: () => void) {}

  public mostrar(): void {
    this.painel.id = 'avisos';
    this.painel.className = 'cartao';
    this.painel.innerHTML = `<h2>Central de avisos</h2><fieldset><legend>Avisos de término do plano</legend>
      <form class="ferramentas">
        <label>Aluno<input name="busca" maxlength="120"></label>
        <label>Status<select name="estado"><option value="ativos">Ativos</option><option value="nao_lidos">Não lidos ativos</option>
          <option value="lidos">Lidos</option><option value="invalidados">Invalidados</option><option value="todos">Todos</option></select></label>
        <button>Filtrar</button><button type="button" id="verificar-avisos">Verificar agora</button>
      </form></fieldset>`;
    this.estado.setAttribute('role', 'status');
    this.tabela.innerHTML = '<thead><tr><th>Aluno</th><th>Categoria</th><th>Término</th><th>Antecedência prevista</th><th>Status</th><th>Leitura</th></tr></thead><tbody></tbody>';
    this.painel.querySelector('fieldset')!.append(this.estado, this.tabela);
    this.raiz.replaceChildren(this.painel);
    const form = this.painel.querySelector('form')!;
    form.onsubmit = evento => {
      evento.preventDefault();
      const dados = new FormData(form);
      this.filtro = { busca: String(dados.get('busca')), estado: dados.get('estado') as FiltroAvisos['estado'] };
      void this.executar();
    };
    this.painel.querySelector<HTMLButtonElement>('#verificar-avisos')!.onclick = () => this.executar(async () => {
      const { criados } = this.dados(await this.api.verificar(undefined));
      return `Verificação concluída. Novos avisos: ${criados}.`;
    });
    void this.executar();
  }

  private dados<T>(r: Resultado<T>): T {
    if (r.sucesso) return r.dados;
    if (r.erro.codigo === 'NAO_AUTENTICADO' && this.painel.isConnected) this.sessaoEncerrada();
    throw new Error(r.erro.mensagem);
  }

  private async executar(acao?: () => Promise<string>): Promise<void> {
    if (this.ocupado || !this.painel.isConnected) return;
    this.ocupado = true;
    const grupo = this.painel.querySelector('fieldset')!;
    grupo.disabled = true;
    this.estado.textContent = 'Consultando avisos…';
    try {
      const mensagem = acao ? await acao() : '';
      this.exibir(this.dados(await this.api.listar(this.filtro)));
      this.estado.textContent = mensagem;
    } catch (erro) {
      this.tabela.tBodies[0]!.replaceChildren();
      this.estado.textContent = erro instanceof Error ? erro.message : 'Falha ao consultar os avisos.';
    } finally { this.ocupado = false; grupo.disabled = false; }
  }

  private exibir(avisos: AvisoDto[]): void {
    const corpo = this.tabela.tBodies[0]!;
    corpo.replaceChildren();
    if (!avisos.length) {
      const celula = corpo.insertRow().insertCell();
      celula.colSpan = 6;
      celula.textContent = 'Nenhum aviso para os filtros selecionados.';
    }
    for (const aviso of avisos) {
      const linha = corpo.insertRow();
      const leitura = aviso.lido_em ? 'Lido' : 'Não lido';
      const status = aviso.invalidado_em ? 'Invalidado · ' + leitura : leitura;
      const marco = aviso.antecedencia_dias === 0 ? 'No dia do término' : aviso.antecedencia_dias + ' dias antes';
      for (const texto of [aviso.aluno_nome, 'Término do plano', aviso.data_alvo.split('-').reverse().join('/'), marco, status]) {
        linha.insertCell().textContent = texto;
      }
      const acao = linha.insertCell();
      if (!aviso.lido_em && !aviso.invalidado_em) {
        const ler = document.createElement('button');
        ler.textContent = 'Marcar como lido';
        ler.onclick = () => this.executar(async () => {
          const { lido } = this.dados(await this.api.ler({ id: aviso.id }));
          return lido ? 'Aviso marcado como lido.' : 'O aviso já não está ativo.';
        });
        acao.append(ler);
      }
    }
  }
}
