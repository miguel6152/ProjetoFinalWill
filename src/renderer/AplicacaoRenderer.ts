class AplicacaoRenderer {
  public iniciar(): void {
    const mensagem: HTMLElement | null = document.getElementById('estado');
    if (mensagem !== null) mensagem.textContent = 'Infraestrutura inicial do aplicativo.';
  }
}

new AplicacaoRenderer().iniciar();
