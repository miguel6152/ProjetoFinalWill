import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Conexao } from '../database/Conexao';
import { Migrador } from '../database/Migrador';
import { Migracao001EstruturaInicial } from '../database/migrations/Migracao001EstruturaInicial';

export class Composicao {
  private conexao: Conexao | undefined;

  public iniciar(caminho: string): void {
    if (this.conexao !== undefined) return;
    if (caminho !== ':memory:') mkdirSync(path.dirname(caminho), { recursive: true });
    const conexao: Conexao = new Conexao(caminho);
    try {
      new Migrador(conexao, [new Migracao001EstruturaInicial()]).executar();
      this.conexao = conexao;
    } catch (erro: unknown) {
      conexao.fechar();
      throw erro;
    }
  }

  public encerrar(): void {
    this.conexao?.fechar();
    this.conexao = undefined;
  }
}
