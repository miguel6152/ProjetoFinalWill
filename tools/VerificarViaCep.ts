import assert from 'node:assert/strict';
import { ViaCepService } from '../src/services/ViaCepService';
import { ErroEndereco } from '../src/services/ErroEndereco';
import type { MotivoEndereco } from '../src/services/ErroEndereco';
import { TransporteViaCepTeste } from './TransporteViaCepTeste';

class VerificarViaCep {
  public async executar(): Promise<void> {
    const transporte = new TransporteViaCepTeste(), service = new ViaCepService(transporte.requisitar);
    for (const cep of ['01001000', '01001-000', ' 01001-000 ']) {
      assert.deepEqual(await service.consultar({ cep }), { cep: '01001000', logradouro: 'Praça sintética', bairro: 'Bairro sintético', cidade: 'São Paulo', uf: 'SP' });
    }
    transporte.cenario = 'parcial';
    assert.deepEqual(await service.consultar({ cep: '01001000' }), { cep: '01001000', logradouro: '', bairro: '', cidade: 'São Paulo', uf: 'SP' });
    console.log('OK ViaCEP: CEP normalizado, URL HTTPS fixa, redirect recusado, mapeamento de cidade, resposta parcial e DTO sem metadados/complemento.');

    const antes = transporte.chamadas;
    for (const entrada of [undefined, null, {}, [], { cep: 1001000 }, { cep: '' }, { cep: '123' }, { cep: '010010000' },
      { cep: '0100a000' }, { cep: '01001 000' }, { cep: '../01001000' }, { cep: '01001000', url: 'https://example.invalid' }]) {
      await this.rejeitar(() => service.consultar(entrada), 'VALIDACAO');
    }
    let acessos = 0;
    const getter = Object.defineProperty({}, 'cep', { enumerable: true, get: () => { acessos++; return '01001000'; } });
    await this.rejeitar(() => service.consultar(getter), 'VALIDACAO'); assert.equal(acessos, 0);
    assert.equal(transporte.chamadas, antes);
    console.log('OK ViaCEP: entradas inválidas/getters recusados antes de HTTP; renderer não escolhe URL nem envia dados pessoais adicionais.');

    for (const [cenario, motivo] of [['inexistente','NAO_ENCONTRADO'], ['rede','REDE'], ['indisponivel','INDISPONIVEL']] as const) {
      transporte.cenario = cenario; await this.rejeitar(() => service.consultar({ cep: '01001000' }), motivo);
    }
    for (const json of [null, [], {}, { erro: 'desconhecido' }, { cep: '01001-000' }, { cep: '99999-999', localidade: 'Cidade', uf: 'SP' },
      { cep: '01001-000', localidade: 123, uf: 'SP' }, { cep: '01001-000', localidade: 'Cidade', uf: 'XX' },
      { cep: '01001-000', logradouro: 'x'.repeat(121), localidade: 'Cidade', uf: 'SP' }]) {
      await this.rejeitar(() => new ViaCepService(async () => Response.json(json)).consultar({ cep: '01001000' }), 'RESPOSTA_INVALIDA');
    }
    await this.rejeitar(() => new ViaCepService(async () => Response.json({ erro: 'true' })).consultar({ cep: '01001000' }), 'NAO_ENCONTRADO');
    await this.rejeitar(() => new ViaCepService(async () => new Response('<html>erro</html>')).consultar({ cep: '01001000' }), 'RESPOSTA_INVALIDA');
    console.log('OK ViaCEP: inexistência, rede, HTTP 503, JSON inválido, payload inesperado, UF inválida e CEP divergente tratados sem detalhes internos.');

    transporte.cenario = 'timeout';
    const curto = new ViaCepService(transporte.requisitar, 10);
    await this.rejeitar(() => curto.consultar({ cep: '01001000' }), 'TIMEOUT'); assert.equal(transporte.sinal?.aborted, true);
    // O prazo também cobre leitura do corpo e transportes que não respeitem AbortSignal.
    await this.rejeitar(() => new ViaCepService(async () => new Response(new ReadableStream<Uint8Array>()), 10).consultar({ cep: '01001000' }), 'TIMEOUT');
    await this.rejeitar(() => new ViaCepService(async () => new Promise<Response>(() => {}), 10).consultar({ cep: '01001000' }), 'TIMEOUT');
    transporte.cenario = 'sucesso'; assert.equal((await curto.consultar({ cep: '01001000' })).uf, 'SP');
    console.log('OK ViaCEP: timeout de requisição/corpo, aborto real do sinal, limite mesmo sem cooperação do transporte e recuperação na consulta seguinte.');
  }

  private async rejeitar(acao: () => Promise<unknown>, motivo: MotivoEndereco): Promise<void> {
    await assert.rejects(acao, (erro: unknown) => {
      assert.ok(erro instanceof ErroEndereco); assert.equal(erro.motivo, motivo);
      assert.doesNotMatch(erro.message, /DETALHE_INTERNO|stack|SELECT|senha/); return true;
    });
  }
}
void new VerificarViaCep().executar().catch(erro => { console.error(erro); process.exitCode = 1; });
