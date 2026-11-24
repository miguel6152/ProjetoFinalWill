import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

class CopiarAssets {
  public executar(): void {
    const raiz: string = path.resolve(__dirname, '../..');
    const destino: string = path.join(raiz, 'dist/src/renderer');
    mkdirSync(destino, { recursive: true });
    copyFileSync(path.join(raiz, 'src/renderer/index.html'), path.join(destino, 'index.html'));
    copyFileSync(path.join(raiz, 'src/renderer/PrepararDemonstracao.html'), path.join(destino, 'PrepararDemonstracao.html'));
    copyFileSync(path.join(raiz, 'src/renderer/Estilos.css'), path.join(destino, 'Estilos.css'));
  }
}

new CopiarAssets().executar();
