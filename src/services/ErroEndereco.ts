import type { CodigoErro } from '../shared/ipc/ContratoIpc';

export type MotivoEndereco = 'VALIDACAO' | 'NAO_ENCONTRADO' | 'REDE' | 'TIMEOUT' | 'RESPOSTA_INVALIDA' | 'INDISPONIVEL';

export class ErroEndereco extends Error {
  public readonly codigo: CodigoErro;
  public constructor(public readonly motivo: MotivoEndereco) {
    const mensagens: Record<MotivoEndereco, string> = {
      VALIDACAO: 'Informe um CEP com oito dígitos. Você pode preencher o endereço manualmente.',
      NAO_ENCONTRADO: 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.',
      REDE: 'Não foi possível conectar ao ViaCEP. Preencha o endereço manualmente ou tente novamente.',
      TIMEOUT: 'A consulta ao ViaCEP excedeu o tempo limite. Preencha o endereço manualmente ou tente novamente.',
      RESPOSTA_INVALIDA: 'O ViaCEP retornou uma resposta inesperada. Preencha o endereço manualmente.',
      INDISPONIVEL: 'O ViaCEP está indisponível. Preencha o endereço manualmente ou tente novamente.'
    };
    super(mensagens[motivo]); this.name = 'ErroEndereco';
    this.codigo = motivo === 'VALIDACAO' ? 'VALIDACAO' : motivo === 'NAO_ENCONTRADO' ? 'NAO_ENCONTRADO' : 'REDE';
  }
}
