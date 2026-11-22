import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';
import { Composicao } from '../src/main/Composicao';

class VerificarInfraestrutura {
  public async executar(): Promise<void> {
    const limite = setTimeout((): void => {
      console.error('FALHA: tempo limite da verificação.');
      app.exit(1);
    }, 20000);
    let janela: BrowserWindow | undefined;
    const composicao = new Composicao();
    try {
      await app.whenReady();
      composicao.iniciar(':memory:');
      janela = await new JanelaPrincipal().abrir(false, (j, url) => composicao.vincularJanela(j, url));
      await janela.webContents.executeJavaScript(`new Promise(resolve => {
        const conferir = () => { if (document.querySelector('#form-provisionamento')) { observador.disconnect(); resolve(true); } };
        const observador = new MutationObserver(conferir); observador.observe(document.body, {childList:true,subtree:true}); conferir();
      })`);
      // O preload só publica a ponte após conferir isolamento e sandbox em seu contexto.
      const estado: unknown = await janela.webContents.executeJavaScript(`({
        require: typeof window.require,
        process: typeof window.process,
        ponte: typeof window.academia,
        capacidades: Object.keys(window.academia),
        mensagem: document.getElementById('estado').textContent,
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content
      })`);
      assert.deepEqual(estado, {
        require: 'undefined', process: 'undefined', ponte: 'object', capacidades: ['autenticacao', 'usuarios', 'inicializacao', 'alunos', 'endereco', 'aulas', 'instrutores', 'planos', 'matriculas', 'pagamentos', 'avisos'],
        mensagem: 'Configuração inicial',
        csp: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"
      });
      console.log('OK: janela, renderer, preload, isolamento, sandbox e ponte sem acesso genérico.');
      clearTimeout(limite);
      composicao.encerrar();
      janela.destroy();
      app.exit(0);
    } catch (erro: unknown) {
      clearTimeout(limite);
      composicao.encerrar();
      janela?.destroy();
      console.error('FALHA: configuração da infraestrutura Electron.');
      console.error(erro instanceof Error ? erro.message : 'Erro desconhecido no teste.');
      app.exit(1);
    }
  }
}

void new VerificarInfraestrutura().executar();
