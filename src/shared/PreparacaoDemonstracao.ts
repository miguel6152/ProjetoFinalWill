export type RespostaPreparacaoDemonstracao =
  | { sucesso: true; estado: 'criado' | 'ja-preparado' }
  | { sucesso: false; mensagem: string };

export interface PontePreparacaoDemonstracao {
  preparar(senha: string, confirmacao: string): Promise<RespostaPreparacaoDemonstracao>;
  abrir(): Promise<void>;
  cancelar(): Promise<void>;
}
