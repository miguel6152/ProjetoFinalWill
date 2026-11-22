import { AvisosTela } from './telas/AvisosTela.js';
import { InadimplenciaTela } from './telas/InadimplenciaTela.js';
import { PagamentosTela } from './telas/PagamentosTela.js';
import type { UsuarioSessao } from '../shared/tipos/Autenticacao.js';
import { LoginTela } from './telas/LoginTela.js';
import { UsuariosTela } from './telas/UsuariosTela.js';
import { AlunosTela } from './telas/AlunosTela.js';
import { PlanosTela } from './telas/PlanosTela.js';
import { InstrutoresTela } from './telas/InstrutoresTela.js';
import { MatriculasTela } from './telas/MatriculasTela.js';

class AplicacaoRenderer {
  private matriculas: MatriculasTela | undefined;
  private geracao = 0;
  private instrutores: InstrutoresTela | undefined;
  private usuarios: UsuariosTela | undefined;
  private alunos: AlunosTela | undefined;
  private planos: PlanosTela | undefined;
  private readonly conteudo = document.getElementById('conteudo')!;
  private readonly estado = document.getElementById('estado')!;
  private readonly conta = document.getElementById('conta')!;

  public async iniciar(): Promise<void> {
    try {
      const ponte = window.academia.inicializacao;
      if (ponte === undefined) throw new Error('Ponte indisponível.');
      const inicial = await ponte.estado(undefined);
      if (!inicial.sucesso) { this.estado.textContent = inicial.erro.mensagem; return; }
      if (inicial.dados.necessario) { this.login(true); return; }
      const sessao = await window.academia.autenticacao?.sessao(undefined);
      if (sessao?.sucesso) this.painel(sessao.dados.usuario);
      else this.login(false);
    } catch { this.estado.textContent = 'Não foi possível iniciar a interface. Feche e abra o aplicativo novamente.'; }
  }

  private login(inicial: boolean, mensagem?: string): void {
    this.instrutores?.encerrar(); this.matriculas?.encerrar(); this.matriculas = undefined;
    this.geracao++; this.usuarios?.encerrar(); this.usuarios = undefined; this.conta.replaceChildren();
    this.alunos?.encerrar(); this.alunos = undefined;
    this.planos?.encerrar(); this.planos = undefined;
    this.estado.textContent = mensagem ?? (inicial ? 'Configuração inicial' : 'Acesso ao sistema');
    const geracao = this.geracao;
    new LoginTela(this.conteudo).mostrar(inicial, async dados => {
      if (inicial) {
        const resultado = await window.academia.inicializacao!.criarAdministrador(dados);
        if (geracao !== this.geracao) return undefined;
        if (!resultado.sucesso) return resultado.erro.mensagem;
        this.login(false, 'Administrador criado. Entre com suas credenciais.'); return undefined;
      }
      const resultado = await window.academia.autenticacao!.entrar({ email: dados.email, senha: dados.senha });
      if (geracao !== this.geracao) return undefined;
      if (!resultado.sucesso) return resultado.erro.mensagem;
      this.painel(resultado.dados.usuario); return undefined;
    });
  }

  private painel(usuario: UsuarioSessao): void {
    this.instrutores?.encerrar(); this.matriculas?.encerrar(); this.matriculas = undefined;
    this.planos?.encerrar(); this.planos = undefined;
    this.geracao++; this.usuarios?.encerrar(); this.estado.textContent = 'Sessão iniciada';
    this.alunos?.encerrar(); this.alunos = undefined;
    const nome = document.createElement('span'); nome.textContent = `${usuario.nome} · ${usuario.perfil}`;
    const sair = document.createElement('button'); sair.id = 'sair'; sair.type = 'button'; sair.textContent = 'Sair';
    sair.addEventListener('click', () => {
      sair.disabled = true;
      void window.academia.autenticacao!.sair(undefined).catch(() => undefined).finally(() => this.login(false));
    });
    this.conta.replaceChildren(nome, sair);
    const alunos = document.createElement('button'); alunos.type = 'button'; alunos.id = 'abrir-alunos'; alunos.textContent = 'Alunos';
    alunos.addEventListener('click', () => {
      this.instrutores?.encerrar(); this.matriculas?.encerrar(); this.matriculas = undefined;
      if (window.academia.alunos === undefined) return;
      this.planos?.encerrar(); this.planos = undefined;
      this.usuarios?.encerrar(); this.usuarios = undefined; this.alunos?.encerrar();
      this.alunos = new AlunosTela(this.conteudo, window.academia.alunos, usuario.perfil,
        () => this.login(false, 'Sua sessão terminou. Entre novamente.'), window.academia.endereco);
      this.alunos.mostrar();
    });
    this.conta.append(alunos);
    const abrir = document.createElement('button'); abrir.textContent = 'Instrutores'; abrir.id = 'abrir-instrutores';
    abrir.onclick = () => {
      if (!window.academia.instrutores) return;
      this.usuarios?.encerrar();
      this.alunos?.encerrar();
      this.planos?.encerrar();
      this.matriculas?.encerrar();
      this.instrutores?.encerrar();
      this.instrutores = new InstrutoresTela(this.conteudo, window.academia.instrutores, usuario.perfil, () => this.login(false));
      this.instrutores.mostrar();
    };
    this.conta.append(abrir);
    if (usuario.perfil === 'admin' || usuario.perfil === 'recepcao') {
      const planos = document.createElement('button'); planos.type = 'button'; planos.id = 'abrir-planos'; planos.textContent = 'Planos';
      planos.addEventListener('click',() => {
        this.instrutores?.encerrar(); this.matriculas?.encerrar(); this.matriculas = undefined;
        if (window.academia.planos === undefined) return;
        this.usuarios?.encerrar(); this.usuarios = undefined; this.alunos?.encerrar(); this.alunos = undefined; this.planos?.encerrar();
        this.planos = new PlanosTela(this.conteudo,window.academia.planos,usuario.perfil,() => this.login(false,'Sua sessão terminou. Entre novamente.'));
        this.planos.mostrar();
      });
      this.conta.append(planos);
      const matriculas = document.createElement('button'); matriculas.type = 'button'; matriculas.id = 'abrir-matriculas'; matriculas.textContent = 'Matrículas';
      matriculas.addEventListener('click', () => {
        if (window.academia.matriculas === undefined) return;
        this.usuarios?.encerrar(); this.usuarios = undefined; this.alunos?.encerrar(); this.alunos = undefined;
        this.planos?.encerrar(); this.planos = undefined; this.instrutores?.encerrar(); this.matriculas?.encerrar();
        this.matriculas = new MatriculasTela(this.conteudo, window.academia.matriculas, () => this.login(false, 'Sua sessão terminou. Entre novamente.'), usuario.perfil);
        this.matriculas.mostrar();
      });
      this.conta.append(matriculas);
      const avisos = document.createElement('button');
      avisos.id = 'abrir-avisos';
      avisos.textContent = 'Avisos';
      avisos.onclick = () => {
        if (!window.academia.avisos) return;
        this.instrutores?.encerrar(); this.matriculas?.encerrar();
        this.usuarios?.encerrar();
        this.alunos?.encerrar();
        this.planos?.encerrar();
        new AvisosTela(this.conteudo, window.academia.avisos,
          () => this.login(false, 'Sua sessão terminou. Entre novamente.')).mostrar();
      };
      this.conta.append(avisos);
      for (const [id, nome, Tela] of [
        ['abrir-mensalidades', 'Mensalidades', PagamentosTela],
        ['abrir-inadimplencia', 'Inadimplência', InadimplenciaTela]
      ] as const) {
        const botao = document.createElement('button');
        botao.id = id;
        botao.textContent = nome;
        botao.onclick = () => {
          if (!window.academia.pagamentos) return;
          this.instrutores?.encerrar(); this.matriculas?.encerrar();
          this.usuarios?.encerrar();
          this.alunos?.encerrar();
          this.planos?.encerrar();
          new Tela(this.conteudo, window.academia.pagamentos,
            () => this.login(false, 'Sua sessão terminou. Entre novamente.')).mostrar();
        };
        this.conta.append(botao);
      }
    }
    if (usuario.perfil === 'admin') {
      const usuarios = document.createElement('button'); usuarios.type = 'button'; usuarios.id = 'abrir-usuarios'; usuarios.textContent = 'Usuários';
      usuarios.addEventListener('click', () => this.painel(usuario)); this.conta.append(usuarios);
    }
    if (usuario.perfil === 'admin' && window.academia.usuarios !== undefined) {
      this.usuarios = new UsuariosTela(this.conteudo, window.academia.usuarios, () => this.login(false, 'Sua sessão terminou. Entre novamente.'), usuario.id);
      this.usuarios.mostrar();
    } else {
      const titulo = document.createElement('h2'); titulo.textContent = 'Bem-vindo';
      const texto = document.createElement('p'); texto.textContent = 'Seu acesso está ativo. A administração de usuários é exclusiva de administradores.';
      this.conteudo.replaceChildren(titulo, texto);
    }
  }
}
void new AplicacaoRenderer().iniciar();
