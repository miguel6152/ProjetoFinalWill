import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Inclui imports de tipos: ciclos arquiteturais também importam sem código emitido. */
class VerificarDependenciasAutenticacao {
  public executar(): void {
    const raiz = path.resolve('src');
    const arquivos = fs.readdirSync(raiz, { recursive: true, withFileTypes: true })
      .filter((entrada): boolean => entrada.isFile() && entrada.name.endsWith('.ts'))
      .map((entrada): string => path.join(entrada.parentPath, entrada.name));
    const grafo = new Map<string, string[]>();
    for (const arquivo of arquivos) {
      const destinos: string[] = [];
      // Imports/exports estáticos e require/import literais usados neste repositório.
      const fonte = fs.readFileSync(arquivo, 'utf8');
      const referencias = fonte.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g);
      for (const referencia of referencias) {
        const nome = referencia[1];
        assert.ok(nome !== undefined);
        if (!nome.startsWith('.')) continue;
        const destino = path.resolve(path.dirname(arquivo), `${nome.replace(/\.js$/, '')}.ts`);
        assert.ok(fs.existsSync(destino), `Import local não resolvido: ${arquivo}: ${nome}`);
        destinos.push(destino);
      }
      grafo.set(path.resolve(arquivo), destinos);
    }
    const visitados = new Set<string>();
    const ativos = new Set<string>();
    const visitar = (arquivo: string): void => {
      assert.ok(!ativos.has(arquivo), `Dependência circular: ${arquivo}`);
      if (visitados.has(arquivo)) return;
      ativos.add(arquivo);
      for (const destino of grafo.get(arquivo) ?? []) visitar(destino);
      ativos.delete(arquivo);
      visitados.add(arquivo);
    };
    for (const arquivo of grafo.keys()) visitar(arquivo);
    for (const [arquivo, destinos] of grafo) {
      if (arquivo.includes(`${path.sep}shared${path.sep}`) || arquivo.includes(`${path.sep}renderer${path.sep}`) ||
          arquivo.includes(`${path.sep}preload${path.sep}`)) {
        for (const destino of destinos) assert.ok(!destino.includes(`${path.sep}main${path.sep}`), 'Fronteira pública importa Main');
      }
      if (arquivo.includes(`${path.sep}seguranca${path.sep}`)) {
        const fonte = fs.readFileSync(arquivo, 'utf8');
        assert.doesNotMatch(fonte, /from\s+['"][^'"]*(?:database|repositories|electron|better-sqlite3)/);
      }
    }
    console.log(`OK: ${grafo.size} arquivos sem ciclos; fronteira pública e contratos de segurança independentes do banco.`);
  }
}
new VerificarDependenciasAutenticacao().executar();
