import type { PonteAcademia, Resultado } from '../../shared/ipc/ContratoIpc.js';
import type { EntregaDto, PreferenciaDto } from '../../shared/tipos/Entrega.js';

export class MensagensTela {
  private readonly grupo = document.createElement('fieldset');
  private readonly mensagem = document.createElement('p');
  private readonly historico = document.createElement('section');
  private readonly vinculo = document.createElement('section');
  private ocupado = false;

  public constructor(private readonly api: NonNullable<PonteAcademia['avisos']>, private readonly sair: () => void) {}

  public montar(painel: HTMLElement): void {
    this.grupo.innerHTML = `<legend>Mensagens do Telegram</legend>
      <details><summary>Vínculo e preferência do aluno</summary>
      <form><label>ID do aluno<input name="aluno" type="number" min="1" required></label>
      <button>Consultar aluno</button></form></details>`;
    this.grupo.querySelector('details')!.append(this.vinculo);
    this.mensagem.setAttribute('role','status');
    this.grupo.append(this.mensagem,this.historico);
    painel.append(this.grupo);
    const busca = this.grupo.querySelector('form')!;
    busca.oninput = () => this.vinculo.replaceChildren();
    busca.onsubmit = e => {
      e.preventDefault();
      const id = Number(new FormData(busca).get('aluno'));
      void this.executar(async () => {
        this.vinculo.replaceChildren();
        const aluno = this.dados(await this.api.preferencia({ id }));
        if (!aluno) throw new Error('Aluno não encontrado.');
        this.exibirAluno(aluno);
      });
    };
  }

  private exibirAluno(aluno: PreferenciaDto): void {
    this.vinculo.innerHTML = `<p></p><form>
      <label>ID do chat privado verificado<input name="chat" inputmode="numeric" pattern="[1-9][0-9]{0,15}" required></label>
      <label><input type="checkbox" required>Conferi o chat apresentado pelo aluno identificado acima.</label>
      <label><input type="checkbox" name="consente">O aluno autorizou receber avisos de término do plano.</label>
      <button>Salvar vínculo e preferência</button></form><button type="button">Remover vínculo e autorização</button>`;
    this.vinculo.querySelector('p')!.textContent = `Aluno #${aluno.id} · ${aluno.nome} · Chat ${aluno.vinculado ? 'vinculado' : 'ausente'} · Recebimento ${aluno.autorizado ? 'autorizado' : 'desativado'}`;
    const salvar = (chat: string | null, autorizar: boolean) => this.executar(async () => {
      const { salvo } = this.dados(await this.api.configurar({ id: aluno.id, chat, autorizar }));
      if (!salvo) throw new Error('Aluno não encontrado.');
      this.exibirAluno({ ...aluno, vinculado: chat !== null, autorizado: autorizar });
      this.historico.replaceChildren();
      this.mensagem.textContent = 'Preferência salva.';
    });
    const form = this.vinculo.querySelector('form')!;
    form.onsubmit = e => {
      e.preventDefault();
      const f = new FormData(form);
      void salvar(String(f.get('chat')), f.has('consente'));
    };
    this.vinculo.querySelector<HTMLButtonElement>('button[type=button]')!.onclick = () => salvar(null,false);
  }

  public abrir(id: number, aluno: string, alvo: string): void {
    void this.executar(async () => {
      const dados = this.dados(await this.api.entrega({ id }));
      this.exibirEntrega(id, aluno, alvo, dados);
      this.historico.scrollIntoView({ block: 'nearest' });
    });
  }

  private exibirEntrega(id: number, aluno: string, alvo: string, dados: EntregaDto): void {
    this.historico.replaceChildren();
    const titulo = document.createElement('h3'), estado = document.createElement('p');
    titulo.textContent = `Entrega do aviso #${id} · ${aluno} · ${alvo.split('-').reverse().join('/')}`;
    estado.textContent = `Modo: ${dados.modo}. Estado: ${dados.estado}. ${dados.motivo}`;
    this.historico.append(titulo,estado);
    for (const t of dados.tentativas) {
      const linha = document.createElement('p');
      linha.textContent = [`Tentativa ${t.numero} · ${t.modo} · ${t.estado}`, 'Início ' + t.inicio,
        t.fim && 'Fim ' + t.fim, t.motivo, t.proxima && 'Espera até ' + t.proxima,
        t.mensagem_id && 'ID da mensagem ' + t.mensagem_id].filter(Boolean).join(' · ');
      this.historico.append(linha);
    }
    if (dados.pode_processar) {
      const botao = document.createElement('button');
      botao.className = 'processar-entrega';
      botao.textContent = dados.modo === 'simulado' ? 'Simular entrega' :
        dados.tentativas.length ? 'Confirmar reenvio pelo Telegram após correção' : 'Confirmar envio pelo Telegram';
      botao.onclick = () => this.executar(async () => {
        const atual = this.dados(await this.api.processar({ id, modo: dados.modo }));
        this.exibirEntrega(id,aluno,alvo,atual);
      });
      this.historico.append(botao);
    }
  }

  private dados<T>(r: Resultado<T>): T {
    if (r.sucesso) return r.dados;
    if (r.erro.codigo === 'NAO_AUTENTICADO' && this.grupo.isConnected) this.sair();
    throw new Error(r.erro.mensagem);
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    if (this.ocupado || !this.grupo.isConnected) return;
    this.ocupado = true;
    this.grupo.disabled = true;
    this.mensagem.textContent = 'Carregando…';
    try {
      await acao();
      if (this.mensagem.textContent === 'Carregando…') this.mensagem.textContent = '';
    } catch (erro) {
      this.mensagem.textContent = erro instanceof Error ? erro.message : 'Operação indisponível.';
    } finally { this.grupo.disabled = false; this.ocupado = false; }
  }
}
