import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

interface AlvoDevTools {
  title: string;
  url: string;
}

class VerificarPacoteDemonstracao {
  private readonly executavel = path.resolve('release/win-unpacked/Sistema de Academia.exe');
  private processo: ChildProcess | undefined;

  public async executar(): Promise<void> {
    if (process.platform !== 'win32') throw new Error('O teste do pacote instalado exige Windows x64.');
    const resources = path.resolve('release/win-unpacked/resources');
    const arquivoAsar = path.join(resources, 'app.asar');
    assert.ok(existsSync(arquivoAsar), 'o pacote ASAR existe');
    assert.ok(existsSync(path.join(resources, 'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-x64.node')),
      'binário x64 do better-sqlite3 foi desempacotado');
    assert.ok(existsSync(path.join(resources, 'app.asar.unpacked/node_modules/argon2/prebuilds/win32-x64/argon2.glibc.node')),
      'binário x64 do argon2 foi desempacotado');

    const pasta = mkdtempSync(path.join(os.tmpdir(), 'sistema-academia-pacote-demo-'));
    try {
      const appData = path.join(pasta, 'Roaming');
      const userData = path.join(appData, 'sistema-academia');
      mkdirSync(userData, { recursive: true });
      const bancoNormal = path.join(userData, 'academia.sqlite3');
      const bytesNormais = Buffer.from('sentinela temporaria do banco normal');
      writeFileSync(bancoNormal, bytesNormais, { flag: 'wx' });
      await this.iniciar(appData);
      await this.encerrar();
      assert.equal(existsSync(path.join(userData, 'academia-demo.sqlite3')), false,
        'interrupção antes do envio da senha não cria um banco parcial');
      assert.deepEqual(readFileSync(bancoNormal), bytesNormais,
        'a tela empacotada não abre nem modifica o banco normal');
      process.stdout.write('Verificação do pacote demo: arquivos, dependências nativas, inicialização isolada e interrupção aprovados.\n');
    } finally {
      await this.encerrar();
      rmSync(pasta, { recursive: true, force: true });
    }
  }

  private async iniciar(appData: string): Promise<void> {
    const porta = await this.portaLivre();
    this.processo = spawn(this.executavel, [`--remote-debugging-port=${porta}`, '--preparar-demo'], {
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, APPDATA: appData, LOCALAPPDATA: path.join(path.dirname(appData), 'Local') }
    });
    const limite = Date.now() + 30000;
    while (Date.now() < limite) {
      if (this.processo.exitCode !== null) throw new Error('O executável empacotado encerrou ao carregar a tela demo.');
      try {
        const resposta = await fetch(`http://127.0.0.1:${porta}/json/list`);
        if (resposta.ok) {
          const alvos = await resposta.json() as AlvoDevTools[];
          if (alvos.some(alvo => alvo.title === 'Preparar demonstração' && alvo.url.endsWith('/PrepararDemonstracao.html'))) return;
        }
      } catch { /* aguarda o endpoint local da instância isolada */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('A tela demo do executável empacotado não abriu no tempo esperado.');
  }

  private async encerrar(): Promise<void> {
    const processo = this.processo;
    if (!processo?.pid || processo.exitCode !== null) return;
    const encerramento = spawn('taskkill.exe', ['/PID', String(processo.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise<void>(resolve => encerramento.once('close', () => resolve()));
    if (processo.exitCode === null) {
      await Promise.race([
        new Promise<void>(resolve => processo.once('exit', () => resolve())),
        new Promise<void>(resolve => setTimeout(resolve, 5000))
      ]);
    }
  }

  private async portaLivre(): Promise<number> {
    const servidor = net.createServer();
    await new Promise<void>((resolve, reject) => servidor.once('error', reject).listen(0, '127.0.0.1', resolve));
    const porta = (servidor.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => servidor.close(erro => erro ? reject(erro) : resolve()));
    return porta;
  }
}

void new VerificarPacoteDemonstracao().executar().catch(erro => {
  console.error(erro instanceof Error ? erro.message : 'Falha ao testar a demonstração empacotada.');
  process.exitCode = 1;
});
