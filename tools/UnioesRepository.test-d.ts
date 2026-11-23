import type { BaseRepository } from '../src/repositories/BaseRepository';
import type { ConfiguracaoRepository } from '../src/repositories/ConfiguracaoRepository';
import type { Coluna, ColunaAnulavel, ColunaDados, DadosAtualizacao, DadosCriacao, DefinicaoRepository, MapaColunas, RegistroPersistido } from '../src/repositories/TiposRepository';

interface RegistroNome extends RegistroPersistido {
  nome: string;
  observacao: string | null;
}
interface RegistroCodigo extends RegistroPersistido {
  codigo: number;
}
type UniaoInterfaces = RegistroNome | RegistroCodigo;
type AliasUniao = UniaoInterfaces;
type UniaoIntersecao = RegistroPersistido & ({ nome: string } | { codigo: number });
type AliasComposto = UniaoIntersecao & { ativo: number };

// Registros simples, aliases de registros simples e interseções de formato
// único continuam válidos. Uniões dentro de campos não são uniões de registros.
type Simples = RegistroNome & { quantidade: number; situacao: 'ativa' | 'encerrada' };
type AliasSimples = Simples;
type RepositorioSimples = BaseRepository<AliasSimples, 'nome' | 'observacao'>;
type ConfiguracaoSimples = ConfiguracaoRepository<AliasSimples, 'nome' | 'observacao'>;
type ExigirVerdade<T extends true> = T;
type Igual<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
export type RegistrosSimplesAceitos = [
  ExigirVerdade<{ nome: ''; observacao: null; quantidade: 0; situacao: 'ativa' } extends DadosCriacao<AliasSimples> ? true : false>,
  ExigirVerdade<Igual<ColunaAnulavel<AliasSimples>, 'observacao'>>,
  ExigirVerdade<Igual<keyof MapaColunas<AliasSimples>, keyof AliasSimples>>,
  ExigirVerdade<Igual<DefinicaoRepository<AliasSimples>['colunas']['observacao']['anulavel'], true>>,
  ExigirVerdade<Igual<DefinicaoRepository<AliasSimples>['colunas']['nome']['anulavel'], false>>,
  ExigirVerdade<Igual<ReturnType<RepositorioSimples['findById']>, AliasSimples | undefined>>,
  ExigirVerdade<Igual<ConfiguracaoSimples['colunasAtualizacao'][number], 'nome' | 'observacao'>>
];

// Cada diretiva deve se tornar não utilizada (TS2578) se a restrição for removida.
// @ts-expect-error União direta de interfaces não é um registro de formato único.
type BaseComUniao = BaseRepository<RegistroNome | RegistroCodigo>;
// @ts-expect-error Um alias não deve esconder a união.
type BaseComAlias = BaseRepository<AliasUniao>;
// @ts-expect-error Reproduz o caso da auditoria, com interseção e união.
type BaseComIntersecao = BaseRepository<UniaoIntersecao>;
// @ts-expect-error Interseção adicional e alias também preservam a restrição.
type BaseComAliasComposto = BaseRepository<AliasComposto>;
// @ts-expect-error Definição não pode prometer o registro completo de uma união.
type DefinicaoComUniao = DefinicaoRepository<UniaoInterfaces>;
// @ts-expect-error Definição também rejeita alias da união.
type DefinicaoComAlias = DefinicaoRepository<AliasUniao>;
// @ts-expect-error Definição rejeita união composta por interseção.
type DefinicaoComIntersecao = DefinicaoRepository<UniaoIntersecao>;
// @ts-expect-error O mapa não pode se limitar às chaves comuns da união.
type MapaComUniao = MapaColunas<UniaoInterfaces>;
// @ts-expect-error Mapa também rejeita o caso composto da auditoria.
type MapaComIntersecao = MapaColunas<UniaoIntersecao>;
// @ts-expect-error Criação não pode aceitar objeto vazio para uma união de registros.
type CriacaoComUniao = DadosCriacao<UniaoInterfaces>;
// @ts-expect-error Alias não pode ocultar o problema na criação.
type CriacaoComAlias = DadosCriacao<AliasUniao>;
// @ts-expect-error Criação rejeita o caso composto da auditoria.
type CriacaoComIntersecao = DadosCriacao<UniaoIntersecao>;
// @ts-expect-error Atualização segue o mesmo contrato de registro único.
type AtualizacaoComUniao = DadosAtualizacao<UniaoInterfaces>;
// @ts-expect-error Atualização também rejeita interseção com união.
type AtualizacaoComIntersecao = DadosAtualizacao<UniaoIntersecao>;
// @ts-expect-error Configuração deve rejeitar uniões no mesmo ponto da API.
type ConfiguracaoComUniao = ConfiguracaoRepository<AliasUniao>;
// @ts-expect-error Coluna não é uma API alternativa para aceitar a união.
type ColunaComUniao = Coluna<AliasUniao>;
// @ts-expect-error ColunaDados também exige formato único.
type ColunaDadosComUniao = ColunaDados<AliasUniao>;
// @ts-expect-error ColunaAnulavel também exige formato único.
type ColunaAnulavelComUniao = ColunaAnulavel<AliasUniao>;
