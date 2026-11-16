export class LoginTela {
  public constructor(private readonly destino: HTMLElement) {}

  public mostrar(inicial: boolean, enviar: (dados: { nome: string; email: string; senha: string }) => Promise<string | undefined>): void {
    const painel = document.createElement('section'); painel.className = 'cartao acesso';
    const titulo = document.createElement('h2'); titulo.textContent = inicial ? 'Crie o primeiro administrador' : 'Entre na academia';
    const descricao = document.createElement('p'); descricao.className = 'secundario';
    descricao.textContent = inicial ? 'Escolha suas credenciais. Esta configuração fica disponível somente enquanto não existe nenhum usuário.'
      : 'Use seu e-mail e sua senha para acessar o sistema.';
    const formulario = document.createElement('form'); formulario.id = inicial ? 'form-provisionamento' : 'form-login';
    // Somente HTML constante; dados recebidos do Main nunca passam por innerHTML.
    formulario.innerHTML = `<label id="campo-nome">Nome<input id="nome" name="nome" autocomplete="name" maxlength="120"></label>
      <label>E-mail<input id="email" name="email" type="email" autocomplete="username" maxlength="254" required></label>
      <label>Senha<input id="senha" name="senha" type="password" maxlength="1024" required></label>
      <p class="mensagem" role="alert" id="erro-acesso"></p><button type="submit" id="entrar"></button>`;
    const nome = formulario.querySelector<HTMLInputElement>('#nome')!;
    nome.required = inicial; formulario.querySelector<HTMLElement>('#campo-nome')!.hidden = !inicial;
    const senha = formulario.querySelector<HTMLInputElement>('#senha')!; senha.autocomplete = inicial ? 'new-password' : 'current-password';
    if (inicial) { senha.minLength = 15; senha.placeholder = 'Pelo menos 15 caracteres'; }
    const botao = formulario.querySelector<HTMLButtonElement>('button')!; botao.textContent = inicial ? 'Criar administrador' : 'Entrar';
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      if (botao.disabled) return;
      if (inicial && Array.from(senha.value).length < 15) {
        formulario.querySelector<HTMLElement>('#erro-acesso')!.textContent = 'Use uma senha com pelo menos 15 caracteres.'; return;
      }
      botao.disabled = true;
      const erro = formulario.querySelector<HTMLElement>('#erro-acesso')!; erro.textContent = '';
      void enviar({ nome: nome.value, email: formulario.querySelector<HTMLInputElement>('#email')!.value, senha: senha.value })
        .then(mensagem => { if (mensagem !== undefined && formulario.isConnected) erro.textContent = mensagem; })
        .catch(() => { if (formulario.isConnected) erro.textContent = 'Não foi possível concluir o acesso. Tente novamente.'; })
        .finally(() => { senha.value = ''; botao.disabled = false; });
    });
    painel.append(titulo, descricao, formulario); this.destino.replaceChildren(painel);
    (inicial ? nome : formulario.querySelector<HTMLInputElement>('#email')!).focus();
  }
}
