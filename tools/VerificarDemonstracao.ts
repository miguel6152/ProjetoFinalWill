import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database = require('better-sqlite3');
import { app } from 'electron';
import { BancoDemonstracao, EMAIL_ADMIN_DEMO } from '../src/main/demo/BancoDemonstracao';
import { PreparadorDemonstracao } from '../src/main/demo/PreparadorDemonstracao';
import { EntradaSenhaOculta, type DependenciasPrompt, type EntradaTerminal } from './demo/EntradaSenhaOculta';
import { IdentidadeAplicacao } from '../src/shared/IdentidadeAplicacao';

IdentidadeAplicacao.configurar(app);

void app.whenReady().then(async () => {
  const pasta = mkdtempSync(path.join(os.tmpdir(), 'projeto-demo-test-'));
  try {
    assert.equal(app.getPath('userData'), IdentidadeAplicacao.diretorioUserData(app.getPath('appData')),
      'Electron usa o diretório userData derivado do nome configurado pelo seed e pela aplicação');
    await verificarEntradaSenhaOculta();
    const producao = path.join(pasta, 'academia.sqlite3');
    const demo = path.join(pasta, 'academia-demo.sqlite3');
    const sentinela = Buffer.from('banco real de teste; não alterar');
    writeFileSync(producao, sentinela, { flag: 'wx' });
    await assert.rejects(new PreparadorDemonstracao().executar(pasta, 'curta', 'curta'), /15 caracteres/);
    await assert.rejects(new PreparadorDemonstracao().executar(pasta, 'senha-demo-segura-com-15-caracteres', 'senha-errada-com-15-caracteres'), /não coincidem/);
    assert.equal(existsSync(demo), false, 'senha inválida ou não confirmada não cria banco demo');
    assert.equal(await new PreparadorDemonstracao().executar(pasta, 'senha-demo-segura-com-15-caracteres', 'senha-demo-segura-com-15-caracteres'), 'criado');
    assert.deepEqual(readFileSync(producao), sentinela, 'arquivo de produção permanece byte a byte intacto');
    const db = new Database(demo, { readonly: true, fileMustExist: true });
    try {
      const quantidades = db.prepare(`SELECT
        (SELECT count(*) FROM alunos) alunos,
        (SELECT count(*) FROM instrutores) instrutores,
        (SELECT count(*) FROM planos) planos,
        (SELECT count(*) FROM matriculas) matriculas,
        (SELECT count(*) FROM pagamentos) pagamentos,
        (SELECT count(*) FROM aulas) aulas,
        (SELECT count(*) FROM inscricoes_aula) inscricoes,
        (SELECT count(*) FROM avaliacoes_fisicas) avaliacoes,
        (SELECT count(*) FROM notificacoes) notificacoes`).get() as Record<string, number>;
      assert.deepEqual(quantidades, { alunos:15,instrutores:5,planos:5,matriculas:15,pagamentos:15,aulas:6,inscricoes:24,avaliacoes:20,notificacoes:3 });
      const cpfs = (db.prepare('SELECT cpf FROM alunos').all() as { cpf: string }[]).map(x => x.cpf);
      assert.equal(new Set(cpfs).size, 15);
      assert.ok(cpfs.every(cpfValido), 'todos os CPFs sintéticos passam o checksum local');
      assert.equal((db.prepare('SELECT email FROM usuarios WHERE perfil=?').get('admin') as { email: string }).email, EMAIL_ADMIN_DEMO);
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
      const hashes = db.prepare('SELECT senha_hash FROM usuarios').all() as { senha_hash: string }[];
      assert.ok(hashes.every(x => x.senha_hash.startsWith('$argon2id$')));
      assert.ok(hashes.every(x => !x.senha_hash.includes('senha-demo-segura')));
    } finally { db.close(); }
    const snapshotDemo = readFileSync(demo);
    assert.equal(await new PreparadorDemonstracao().executar(pasta, 'outra-senha-qualquer-para-teste', 'outra-senha-qualquer-para-teste'), 'ja-preparado');
    assert.deepEqual(readFileSync(demo), snapshotDemo, 'segunda execução não altera nem duplica o banco demo');
    assert.deepEqual(readFileSync(producao), sentinela);

    const pastaComDemoDesconhecido = path.join(pasta, 'desconhecido');
    const demoDesconhecido = path.join(pastaComDemoDesconhecido, 'academia-demo.sqlite3');
    const bytesDesconhecidos = Buffer.from('não sobrescrever');
    mkdirSync(pastaComDemoDesconhecido);
    writeFileSync(demoDesconhecido, bytesDesconhecidos, { flag: 'wx' });
    await assert.rejects(new PreparadorDemonstracao().executar(pastaComDemoDesconhecido, 'senha-demo-segura-com-15-caracteres', 'senha-demo-segura-com-15-caracteres'));
    assert.deepEqual(readFileSync(demoDesconhecido), bytesDesconhecidos);
    stdoutOk();
  } catch (erro: unknown) {
    console.error(erro);
    app.exit(1);
    return;
  } finally { rmSync(pasta, { recursive: true, force: true }); }
  app.quit();
});

function stdoutOk(): void { process.stdout.write('Verificação demo: isolamento, FKs, Argon2id, conteúdo e idempotência aprovados.\n'); }

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9,10]) {
    let soma=0;
    for(let i=0;i<tamanho;i++) soma+=Number(cpf[i])*(tamanho+1-i);
    const digito=(soma*10)%11;
    if((digito===10?0:digito)!==Number(cpf[tamanho])) return false;
  }
  return true;
}

async function verificarEntradaSenhaOculta(): Promise<void> {
  const windows = new TerminalFalso();
  const stdinRedirecionado = new TerminalFalso();
  stdinRedirecionado.isTTY = false;
  let fechamentos = 0;
  const saida: string[] = [];
  const io = dependenciasFalsas('win32', windows, saida, async () => { fechamentos++; }, stdinRedirecionado);
  const senha = 'Senha segura com ç e 24';
  const leitura = EntradaSenhaOculta.ler('Senha: ', io);
  const bytes = Buffer.from(`${senha}\r`, 'utf8');
  queueMicrotask(() => {
    windows.emit('data', bytes.subarray(0, 12));
    windows.emit('data', bytes.subarray(12));
  });
  assert.equal(await leitura, senha);
  assert.deepEqual(windows.modos, [true, false]);
  assert.equal(fechamentos, 1);
  assert.equal(saida.join(''), 'Senha: \r\n', 'a saída contém somente o prompt, nunca os caracteres digitados');

  const cancelamento = new TerminalFalso();
  let fechouCancelamento = false;
  const cancelar = EntradaSenhaOculta.ler('Senha: ', dependenciasFalsas('win32', cancelamento, [], async () => { fechouCancelamento = true; }));
  queueMicrotask(() => cancelamento.emit('data', Buffer.from([3])));
  await assert.rejects(cancelar, /cancelada/);
  assert.deepEqual(cancelamento.modos, [true, false]);
  assert.equal(fechouCancelamento, true);

  const falha = new TerminalFalso();
  falha.falharAtivacao = true;
  let fechouFalha = false;
  await assert.rejects(EntradaSenhaOculta.ler('Senha: ', dependenciasFalsas('win32', falha, [], async () => { fechouFalha = true; })));
  assert.deepEqual(falha.modos, [true, false]);
  assert.equal(fechouFalha, true);

  const stdinNaoTty = new TerminalFalso();
  stdinNaoTty.isTTY = false;
  await assert.rejects(EntradaSenhaOculta.ler('Senha: ', dependenciasFalsas('linux', stdinNaoTty, [], async () => {})), /terminal interativo/);
}

function dependenciasFalsas(plataforma: NodeJS.Platform, terminal: TerminalFalso, saida: string[], fechar: () => Promise<void>, stdin = terminal): DependenciasPrompt {
  return {
    plataforma,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: { write: (texto: string): boolean => { saida.push(texto); return true; } } as unknown as NodeJS.WriteStream,
    abrirConsoleWindows: () => ({ stream: terminal as unknown as EntradaTerminal, fechar })
  };
}

class TerminalFalso extends EventEmitter {
  public isTTY = true;
  public closed = false;
  public falharAtivacao = false;
  public readonly modos: boolean[] = [];
  public setRawMode(modo: boolean): this {
    this.modos.push(modo);
    if (modo && this.falharAtivacao) throw new Error('falha simulada ao ativar raw mode');
    return this;
  }
  public resume(): this { return this; }
  public pause(): this { return this; }
  public destroy(): this { this.closed = true; this.emit('close'); return this; }
}
