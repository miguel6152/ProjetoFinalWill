import { app } from 'electron';
import { PreparadorDemonstracao } from '../src/main/demo/PreparadorDemonstracao';
import { EntradaSenhaOculta } from './demo/EntradaSenhaOculta';
import { IdentidadeAplicacao } from '../src/shared/IdentidadeAplicacao';

IdentidadeAplicacao.configurar(app);

void app.whenReady().then(async () => {
  try {
    const senha = await EntradaSenhaOculta.ler('Senha do administrador demo (mínimo 15 caracteres): ');
    const confirmacao = await EntradaSenhaOculta.ler('Confirme a senha: ');
    const estado = await new PreparadorDemonstracao().executar(app.getPath('userData'), senha, confirmacao);
    process.stdout.write(estado === 'criado' ? 'Banco demo criado em academia-demo.sqlite3.\n' : 'Banco demo já preparado; nenhuma alteração foi feita.\n');
  } catch (erro: unknown) {
    console.error(erro instanceof Error ? erro.message : 'Falha ao preparar o banco demo.');
    app.exit(1);
    return;
  }
  app.quit();
});
