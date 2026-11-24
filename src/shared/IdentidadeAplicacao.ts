import path from 'node:path';

/** Identidade interna estável usada pelo Electron para derivar app.getPath('userData'). */
export class IdentidadeAplicacao {
  public static readonly nome = 'sistema-academia';

  public static configurar(aplicacao: { setName(nome: string): void }): void {
    aplicacao.setName(this.nome);
  }

  public static diretorioUserData(diretorioAppData: string): string {
    return path.join(diretorioAppData, this.nome);
  }
}
