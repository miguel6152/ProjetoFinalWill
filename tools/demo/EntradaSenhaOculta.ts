import { closeSync, openSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { ReadStream } from 'node:tty';

export interface EntradaTerminal extends NodeJS.ReadStream {
  setRawMode(modo: boolean): this;
}

export interface EntradaPossuida {
  stream: EntradaTerminal;
  fechar(): Promise<void>;
}

export interface DependenciasPrompt {
  plataforma: NodeJS.Platform;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  abrirConsoleWindows(): EntradaPossuida;
}

const dependencias: DependenciasPrompt = {
  plataforma: process.platform,
  stdin,
  stdout,
  abrirConsoleWindows: (): EntradaPossuida => {
    const fd = openSync('\\\\.\\CONIN$', 'r+');
    try {
      const stream = new ReadStream(fd) as EntradaTerminal;
      return {
        stream,
        fechar: (): Promise<void> => new Promise(resolve => {
          if (stream.closed) { resolve(); return; }
          stream.once('close', resolve);
          stream.destroy();
        })
      };
    } catch (erro: unknown) {
      closeSync(fd);
      throw erro;
    }
  }
};

/** Lê caracteres sem eco. No Windows usa o console real, independente do stdin do Electron. */
export class EntradaSenhaOculta {
  public static ler(rotulo: string, io: DependenciasPrompt = dependencias): Promise<string> {
    let stream: EntradaTerminal;
    let fechar: (() => Promise<void>) | undefined;
    if (io.plataforma === 'win32') {
      const consoleInput = io.abrirConsoleWindows();
      stream = consoleInput.stream;
      fechar = consoleInput.fechar;
    } else {
      const entrada = io.stdin as EntradaTerminal;
      if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
        return Promise.reject(new Error('Execute demo:seed em um terminal interativo para informar a senha com segurança.'));
      }
      stream = entrada;
    }

    try {
      io.stdout.write(rotulo);
    } catch (erro: unknown) {
      void fechar?.();
      return Promise.reject(erro);
    }

    return new Promise((resolve, reject) => {
      let valor = '';
      let finalizada = false;
      let modoRawAtivado = false;
      const decoder = new StringDecoder('utf8');

      const limpar = async (): Promise<void> => {
        stream.off('data', receber);
        stream.off('error', falhar);
        stream.off('end', terminarEntrada);
        try {
          try { stream.setRawMode(false); } catch { /* continua fechando os recursos */ }
          stream.pause();
          io.stdout.write('\r\n');
        } finally {
          await fechar?.();
        }
      };

      const concluir = (erro?: Error): void => {
        if (finalizada) return;
        finalizada = true;
        void limpar().then(() => erro ? reject(erro) : resolve(valor), reject);
      };
      const falhar = (erro: Error): void => concluir(erro);
      const terminarEntrada = (): void => concluir(new Error('A entrada do console foi encerrada antes da leitura da senha.'));
      const receber = (dados: Buffer | string): void => {
        for (const caractere of decoder.write(typeof dados === 'string' ? Buffer.from(dados) : dados)) {
          if (caractere === '\u0003') { concluir(new Error('Preparação cancelada.')); return; }
          if (caractere === '\r' || caractere === '\n') { concluir(); return; }
          if (caractere === '\b' || caractere === '\u007f') valor = Array.from(valor).slice(0, -1).join('');
          else if (caractere >= ' ') valor += caractere;
        }
      };

      stream.on('data', receber);
      stream.once('error', falhar);
      stream.once('end', terminarEntrada);
      try {
        modoRawAtivado = true;
        stream.setRawMode(true);
        stream.resume();
      } catch (erro: unknown) {
        concluir(erro instanceof Error ? erro : new Error('Não foi possível ativar a leitura segura do console.'));
      }
    });
  }
}
