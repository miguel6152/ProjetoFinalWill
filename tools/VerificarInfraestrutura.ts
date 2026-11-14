import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { JanelaPrincipal } from '../src/main/JanelaPrincipal';

class VerificarInfraestrutura {
  public async executar(): Promise<void> {
    const limite = setTimeout((): void => {
      console.error('FALHA: tempo limite da verificação.');
      app.exit(1);
    }, 20000);
    let janela: BrowserWindow | undefined;
    try {
      await app.whenReady();
      janela = await new JanelaPrincipal().abrir(false);
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
        require: 'undefined', process: 'undefined', ponte: 'object', capacidades: ['autenticacao'],
        mensagem: 'Infraestrutura inicial do aplicativo.',
        csp: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"
      });
      console.log('OK: janela, renderer, preload, isolamento, sandbox e ponte sem acesso genérico.');
      clearTimeout(limite);
      janela.destroy();
      app.exit(0);
    } catch (erro: unknown) {
      clearTimeout(limite);
      janela?.destroy();
      console.error('FALHA: configuração da infraestrutura Electron.');
      console.error(erro instanceof Error ? erro.message : 'Erro desconhecido no teste.');
      app.exit(1);
    }
  }
}

void new VerificarInfraestrutura().executar();
