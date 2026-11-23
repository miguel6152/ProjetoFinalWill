import type { PonteAcademia } from '../../shared/ipc/ContratoIpc.js';

export class ConsultaCepFormulario {
  private revisao = 0;
  private consultando = false;
  private readonly editados = new Set<string>();
  private readonly cep: HTMLInputElement;
  private readonly botao: HTMLButtonElement;
  private readonly mensagem: HTMLElement;

  public constructor(private readonly formulario: HTMLFormElement, private readonly ponte: PonteAcademia['endereco'],
    private readonly sessaoInvalida: () => void) {
    this.cep = formulario.querySelector<HTMLInputElement>('[name=cep]')!;
    this.botao = formulario.querySelector<HTMLButtonElement>('#consultar-cep')!;
    this.mensagem = formulario.querySelector<HTMLElement>('#mensagem-cep')!;
    this.botao.disabled = ponte === undefined;
    this.mensagem.textContent = 'Você também pode preencher o endereço manualmente.';
    this.cep.addEventListener('input', () => {
      this.revisao++;
      this.mensagem.textContent = 'CEP alterado. Consulte novamente ou preencha o endereço manualmente.';
    });
    for (const nome of ['logradouro', 'bairro', 'cidade', 'uf']) {
      const campo = formulario.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${nome}]`)!;
      const registrar = (): void => { if (this.consultando) this.editados.add(nome); };
      campo.addEventListener('input', registrar); campo.addEventListener('change', registrar);
    }
    this.botao.addEventListener('click', () => { void this.consultar(); });
  }

  private async consultar(): Promise<void> {
    if (this.consultando || this.ponte === undefined) return;
    const valor = this.cep.value.trim();
    if (!/^(\d{8}|\d{5}-\d{3})$/.test(valor)) {
      this.mensagem.textContent = 'Informe um CEP com oito dígitos. Você pode preencher o endereço manualmente.'; return;
    }
    const cep = valor.replace('-', ''), revisao = ++this.revisao;
    const anteriores = new Map<string, string>();
    for (const nome of ['logradouro', 'bairro', 'cidade', 'uf']) anteriores.set(nome,
      this.formulario.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${nome}]`)!.value);
    this.editados.clear(); this.consultando = true; this.botao.disabled = true;
    this.mensagem.textContent = 'Consultando CEP… O preenchimento manual continua disponível.';
    const atual = (): boolean => this.formulario.isConnected && revisao === this.revisao && this.cep.value.trim().replace('-', '') === cep;
    try {
      const resultado = await this.ponte.consultarCep({ cep });
      if (!atual()) return;
      if (!resultado.sucesso) {
        this.mensagem.textContent = resultado.erro.mensagem;
        if (resultado.erro.codigo === 'NAO_AUTENTICADO') this.sessaoInvalida();
        return;
      }
      for (const nome of ['logradouro', 'bairro', 'cidade', 'uf'] as const) {
        const campo = this.formulario.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${nome}]`)!;
        const valorRetornado = resultado.dados[nome];
        if (valorRetornado !== '' && !this.editados.has(nome) && campo.value === anteriores.get(nome)) campo.value = valorRetornado;
      }
      this.mensagem.textContent = 'Consulta concluída. Confira o endereço e complete os campos que faltarem; todos continuam editáveis.';
    } catch {
      if (atual()) this.mensagem.textContent = 'Não foi possível consultar o CEP. Preencha o endereço manualmente ou tente novamente.';
    } finally {
      this.consultando = false;
      if (this.formulario.isConnected) this.botao.disabled = false;
    }
  }
}
