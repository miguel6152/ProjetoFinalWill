import assert from 'node:assert/strict';

export type CenarioViaCep = 'sucesso' | 'parcial' | 'inexistente' | 'rede' | 'timeout' | 'pendente' | 'indisponivel';

/** Respostas sintéticas: nenhum teste desta integração acessa a internet. */
export class TransporteViaCepTeste {
  public cenario: CenarioViaCep = 'sucesso';
  public chamadas = 0;
  public sinal: AbortSignal | undefined;
  public iniciou: (() => void) | undefined;
  public liberar: (() => void) | undefined;
  public readonly requisitar: typeof fetch = async (entrada, opcoes): Promise<Response> => {
    this.chamadas++;
    assert.equal(entrada, 'https://viacep.com.br/ws/01001000/json/');
    assert.equal(opcoes?.redirect, 'error');
    this.sinal = opcoes?.signal ?? undefined;
    this.iniciou?.(); this.iniciou = undefined;
    if (this.cenario === 'rede') throw new Error('DETALHE_INTERNO_DE_REDE');
    if (this.cenario === 'indisponivel') return new Response('DETALHE_INTERNO_HTTP', { status: 503 });
    if (this.cenario === 'inexistente') return Response.json({ erro: true });
    if (this.cenario === 'timeout' || this.cenario === 'pendente') {
      return new Promise<Response>((resolver, rejeitar) => {
        this.liberar = () => resolver(this.sucesso());
        this.sinal?.addEventListener('abort', () => rejeitar(new Error('DETALHE_INTERNO_ABORT')), { once: true });
      });
    }
    if (this.cenario === 'parcial') return Response.json({ cep: '01001-000', localidade: 'São Paulo', uf: 'SP', logradouro: '', bairro: '' });
    return this.sucesso();
  };

  private sucesso(): Response {
    return Response.json({ cep: '01001-000', logradouro: 'Praça sintética', bairro: 'Bairro sintético', localidade: 'São Paulo', uf: 'SP',
      complemento: 'Complemento que não substitui o informado pelo usuário', ibge: '3550308' });
  }
}
