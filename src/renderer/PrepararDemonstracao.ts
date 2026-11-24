class PrepararDemonstracaoTela {
  private readonly formulario = document.getElementById('formulario-demo') as HTMLFormElement;
  private readonly senha = document.getElementById('senha-demo') as HTMLInputElement;
  private readonly confirmacao = document.getElementById('confirmacao-demo') as HTMLInputElement;
  private readonly mensagem = document.getElementById('mensagem-demo')!;
  private readonly preparar = document.getElementById('preparar-demo') as HTMLButtonElement;
  private readonly abrir = document.getElementById('abrir-demo') as HTMLButtonElement;
  private readonly cancelar = document.getElementById('cancelar-demo') as HTMLButtonElement;

  public iniciar(): void {
    this.formulario.addEventListener('submit', evento => { evento.preventDefault(); void this.enviar(); });
    this.cancelar.addEventListener('click', () => { void window.preparacaoDemo?.cancelar(); });
    this.abrir.addEventListener('click', () => { void window.preparacaoDemo?.abrir(); });
  }

  private async enviar(): Promise<void> {
    const ponte = window.preparacaoDemo;
    if (!ponte) { this.mensagem.textContent = 'A função de preparação não está disponível. Feche e abra pelo atalho do Menu Iniciar.'; return; }
    this.preparar.disabled = true;
    this.cancelar.disabled = true;
    this.senha.disabled = true;
    this.confirmacao.disabled = true;
    this.mensagem.textContent = 'Preparando banco de demonstração…';
    try {
      const resposta = await ponte.preparar(this.senha.value, this.confirmacao.value);
      this.senha.value = '';
      this.confirmacao.value = '';
      if (!resposta.sucesso) {
        this.mensagem.textContent = resposta.mensagem;
        this.preparar.disabled = false;
        this.cancelar.disabled = false;
        this.senha.disabled = false;
        this.confirmacao.disabled = false;
        return;
      }
      this.mensagem.textContent = resposta.estado === 'criado'
        ? 'Banco de demonstração preparado. A senha foi armazenada somente como hash Argon2id.'
        : 'O banco de demonstração já estava preparado e não foi alterado.';
      this.abrir.hidden = false;
      this.cancelar.textContent = 'Fechar';
      this.cancelar.disabled = false;
    } catch {
      this.senha.value = '';
      this.confirmacao.value = '';
      this.mensagem.textContent = 'A preparação falhou. Os bancos existentes foram preservados.';
      this.preparar.disabled = false;
      this.cancelar.disabled = false;
      this.senha.disabled = false;
      this.confirmacao.disabled = false;
    }
  }
}

new PrepararDemonstracaoTela().iniciar();
