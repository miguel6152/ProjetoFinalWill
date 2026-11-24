import { BancoDemonstracao } from './BancoDemonstracao';

export type EstadoPreparacaoDemonstracao = 'criado' | 'ja-preparado';

export class PreparadorDemonstracao {
  public async executar(diretorio: string, senha: string, confirmacao: string): Promise<EstadoPreparacaoDemonstracao> {
    if (Array.from(senha).length < 15) throw new Error('A senha precisa ter pelo menos 15 caracteres.');
    if (Buffer.byteLength(senha, 'utf8') > 1024) throw new Error('A senha excede o limite de 1024 bytes.');
    if (senha !== confirmacao) throw new Error('As senhas não coincidem.');
    return BancoDemonstracao.preparar(diretorio, senha);
  }
}
