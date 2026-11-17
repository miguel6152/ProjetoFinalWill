/** Conversão decimal para centavos sem multiplicação de ponto flutuante. */
export class ValorMonetario {
  public static paraCentavos(texto: string): number | undefined {
    if (!/^\d{1,14}(?:[,.]\d{1,2})?$/.test(texto.trim())) return undefined;
    const [inteiros, fracao = ''] = texto.trim().replace(',','.').split('.');
    const valor = Number(`${inteiros}${fracao.padEnd(2,'0')}`);
    return Number.isSafeInteger(valor) && valor >= 0 ? valor : undefined;
  }

  public static paraEntrada(centavos: number): string {
    return `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2,'0')}`;
  }

  public static formatar(centavos: number): string {
    return `R$ ${Math.trunc(centavos / 100).toLocaleString('pt-BR')},${String(centavos % 100).padStart(2,'0')}`;
  }
}
