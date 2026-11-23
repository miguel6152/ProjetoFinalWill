import type { PonteAcademia, Resultado } from '../../shared/ipc/ContratoIpc.js';
import { HorarioAula } from '../componentes/HorarioAula.js';

export class RelatoriosTela {
  private ativa = true;
  private ocupada = false;
  private readonly mensagem = document.createElement('p');
  private readonly linhas = document.createElement('tbody');
  private readonly form = document.createElement('form');
  public constructor(private readonly destino: HTMLElement, private readonly ponte: NonNullable<PonteAcademia['relatorios']>,
    private readonly tipo: 'evolucao' | 'frequencia', private readonly sessaoInvalida: () => void) {}

  public mostrar(): void {
    const titulo = document.createElement('h2');
    titulo.textContent = this.tipo === 'evolucao' ? 'Evolução física' : 'Frequência';
    this.form.id = 'filtros-relatorio'; this.form.className = 'ferramentas';
    this.form.innerHTML = `<label>ID do aluno${this.tipo === 'frequencia' ? ' (opcional)' : ''}<input name="aluno_id" type="number" min="1" step="1" ${this.tipo === 'evolucao' ? 'required' : ''}></label>
      <label>De<input name="inicio" type="date" required></label><label>Até<input name="fim" type="date" required></label>
      ${this.tipo === 'frequencia' ? '<label>ID da aula (opcional)<input name="aula_id" type="number" min="1" step="1"></label>' : ''}
      <button type="submit">Consultar / tentar novamente</button>`;
    const hoje = HorarioAula.local(new Date().toISOString()).slice(0,10);
    this.campo('inicio').value = hoje.slice(0,8) + '01'; this.campo('fim').value = hoje;
    this.form.onsubmit = evento => { evento.preventDefault(); void this.carregar(); };
    const explicacao = document.createElement('p');
    explicacao.textContent = this.tipo === 'evolucao'
      ? 'Histórico cronológico. Medidas ausentes aparecem como “Não informada”. Período máximo: 366 dias.'
      : 'Dias inclusivos em America/Sao_Paulo. Somente inscrições ativas em aulas concluídas. Percentual = presentes ÷ (presentes + ausentes). Período máximo: 366 dias.';
    this.mensagem.id = 'mensagem-relatorio'; this.mensagem.setAttribute('role','status');
    this.mensagem.textContent = 'Informe os filtros e consulte.';
    const tabela = document.createElement('table'); tabela.id = 'resultado-relatorio';
    const cabecalho = document.createElement('thead'), linha = document.createElement('tr');
    for (const rotulo of this.tipo === 'evolucao'
      ? ['Data','Peso (kg)','Altura (cm)','Cintura (cm)','Quadril (cm)','Braço (cm)','Coxa (cm)']
      : ['ID do aluno','Nome','Presentes','Ausentes','Não registradas','Presença (%)']) {
      const th = document.createElement('th'); th.textContent = rotulo; linha.append(th);
    }
    cabecalho.append(linha); tabela.append(cabecalho, this.linhas);
    this.destino.replaceChildren(titulo, explicacao, this.form, this.mensagem, tabela);
  }
  public encerrar(): void { this.ativa = false; this.linhas.replaceChildren(); }
  private campo(nome: string): HTMLInputElement { return this.form.querySelector<HTMLInputElement>('[name=' + nome + ']')!; }
  private exigir<T>(resultado: Resultado<T>): T {
    if (resultado.sucesso) return resultado.dados;
    if (this.ativa) {
      this.mensagem.textContent = resultado.erro.mensagem;
      if (resultado.erro.codigo === 'NAO_AUTENTICADO') this.sessaoInvalida();
    }
    throw new Error('Consulta recusada.');
  }
  private adicionar(valores: (string | number | null)[]): void {
    const linha = document.createElement('tr');
    for (const valor of valores) {
      const td = document.createElement('td');
      td.textContent = valor === null ? 'Não informada' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor;
      linha.append(td);
    }
    this.linhas.append(linha);
  }
  private async carregar(): Promise<void> {
    if (!this.ativa || this.ocupada) return;
    this.ocupada = true; this.linhas.replaceChildren(); this.mensagem.textContent = 'Carregando relatório…';
    const botao = this.form.querySelector('button')!; botao.disabled = true;
    try {
      const inicio = this.campo('inicio').value, fim = this.campo('fim').value, aluno = this.campo('aluno_id').value;
      if (this.tipo === 'evolucao') {
        const dados = this.exigir(await this.ponte.evolucao({ aluno_id: Number(aluno), inicio, fim }));
        if (!this.ativa) return;
        for (const p of dados.pontos) this.adicionar([p.realizada_em,p.peso_kg,p.altura_cm,p.cintura_cm,p.quadril_cm,p.braco_cm,p.coxa_cm]);
      } else {
        const aula = this.campo('aula_id').value;
        const dados = this.exigir(await this.ponte.frequencia({
          inicio: HorarioAula.instante(inicio + 'T00:00'),
          fim: new Date(Date.parse(HorarioAula.instante(fim + 'T23:59')) + 59999).toISOString(),
          ...(aluno ? { aluno_id: Number(aluno) } : {}), ...(aula ? { aula_id: Number(aula) } : {})
        }));
        if (!this.ativa) return;
        for (const p of dados.itens) this.adicionar([p.aluno_id,p.nome,p.presentes,p.ausentes,p.nao_registradas,
          p.percentual_presenca === null ? 'Sem presença registrada (sem denominador)' : p.percentual_presenca.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%']);
      }
      this.mensagem.textContent = this.linhas.children.length ? 'Relatório atualizado conforme os filtros.' : 'Nenhum resultado para os filtros.';
    } catch {
      if (this.ativa && this.mensagem.textContent === 'Carregando relatório…') this.mensagem.textContent = 'Não foi possível consultar. Confira as datas e tente novamente.';
    } finally { this.ocupada = false; if (this.ativa) botao.disabled = false; }
  }
}
