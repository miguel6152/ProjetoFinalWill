import { app } from 'electron';
import { BancoDemonstracao } from './demo/BancoDemonstracao';
import { EntradaSenhaOculta } from './demo/EntradaSenhaOculta';
import { IdentidadeAplicacao } from '../src/shared/IdentidadeAplicacao';

IdentidadeAplicacao.configurar(app);

void app.whenReady().then(async () => {
  try {
    const senha = await EntradaSenhaOculta.ler('Senha do administrador demo (mínimo 15 caracteres): ');
    if (Array.from(senha).length < 15) throw new Error('A senha precisa ter pelo menos 15 caracteres.');
    if (Buffer.byteLength(senha, 'utf8') > 1024) throw new Error('A senha excede o limite de 1024 bytes.');
    const confirmacao = await EntradaSenhaOculta.ler('Confirme a senha: ');
    if (senha !== confirmacao) throw new Error('As senhas não coincidem.');
    const estado = await BancoDemonstracao.preparar(app.getPath('userData'), senha);
    process.stdout.write(estado === 'criado' ? 'Banco demo criado em academia-demo.sqlite3.\n' : 'Banco demo já preparado; nenhuma alteração foi feita.\n');
  } catch (erro: unknown) {
    console.error(erro instanceof Error ? erro.message : 'Falha ao preparar o banco demo.');
    app.exit(1);
    return;
  }
  app.quit();
});
