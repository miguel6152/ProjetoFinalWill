# BaseRepository — contratos, operações e integração (subetapas 3.1 a 3.4)

**Nota de atualização:** as seções desta entrega registram o histórico da etapa 3. A autenticação e os repositories concretos de usuários foram implementados posteriormente. A base continua inalterada nesta rodada; seus limites de escalares, configuração confiável e commit externo são contratos técnicos, não promessas de implementar os nove módulos dos colegas. Estado atual em [ENCERRAMENTO.md](ENCERRAMENTO.md).

As subetapas 3.1 (contratos), 3.2 (leituras) e 3.3 (escritas), incluindo os ajustes de suas auditorias, foram aprovadas. A subetapa 3.4 integra e verifica a Etapa 3 e aguarda revisão. Não foram implementados repositories de produção, autenticação, autorização, services ou canais novos. A Etapa 4 não foi iniciada. Nenhum commit da Etapa 3 está autorizado por esta entrega.

## Arquivos e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `src/repositories/BaseRepository.ts` | Cinco operações concretas, validação de entradas, conexão injetada e configuração validada |
| `src/repositories/TiposRepository.ts` | Registro escalar, criação/atualização e mapa obrigatório de colunas |
| `src/repositories/ConfiguracaoRepository.ts` | Materialização por descritores, validação da cópia e congelamento; não consulta banco |
| `src/repositories/ErroRepository.ts` | Somente códigos string conhecidos, com fallback seguro e mensagens fixas |
| `src/shared/tipos/Paginacao.ts` | Tipos sem dependência de IPC |
| `src/shared/ipc/ContratoIpc.ts` | Mantém as reexportações de paginação e os contratos originais |
| `tools/BaseRepository.test-d.ts` | Testes de tipos, mapas completos, flags, escalares e compatibilidade IPC |
| `tools/UnioesRepository.test-d.ts` | Casos positivos de formato único e 18 rejeições de uniões na API pública |
| `tools/VerificarContratosRepository.ts` | Testes de runtime da configuração e dos erros, sem banco ou CRUD fictício |
| `tools/VerificarLeiturasRepository.ts` | Validação, paginação, ordenação e snapshot, com memória e temporários |
| `tools/VerificarEscritasRepository.ts` | Escritas, integração das cinco operações e rollback, somente em memória |

O projeto inclui repositories e testes de tipos no typecheck. O comando `test:contratos` executa build e testes de configuração sem driver nativo. Nenhuma dependência foi adicionada.

## Resultado da integração 3.4

Não foi identificado defeito bloqueante na revisão conjunta de contratos, configuração, cinco operações, erros e transações. Não foi necessário alterar src/. Foi acrescentado um único cenário de integração à suíte de escrita existente. Esta validação técnica não substitui a revisão e aprovação da equipe nem autoriza commit ou início da Etapa 4.

| Verificação executada | Resultado |
|---|---|
| `npm run typecheck` | Passou sem emissão; inclui testes estáticos de contratos e compatibilidade IPC |
| `npm run build` | Passou |
| `node dist/tools/VerificarContratosRepository.js` | Passou: 64 configurações inválidas rejeitadas |
| Electron: `dist/tools/VerificarEscritasRepository.js` | Passou: 11 grupos, incluindo o ciclo de integração completo |
| Electron: `dist/tools/VerificarLeiturasRepository.js` | Passou: nove grupos, incluindo snapshot concorrente e transações externas |
| Electron: `dist/tools/VerificarBanco.js` | Passou: nove grupos, incluindo migrations, FKs e integridade |
| Electron: `dist/tools/VerificarInfraestrutura.js` | Passou: janela, renderer, preload, isolamento e sandbox |
| Grafo dos imports locais de src, incluindo tipos | 17 arquivos, sem ciclos |
| `git diff --check` | Passou; aviso preexistente LF/CRLF no README |

Os testes de banco rodaram no Electron 45.3.2, Node embarcado 24.22.2, better-sqlite3 13.1.1 e SQLite 3.54.1. Uma execução paralela emitiu avisos de cache do Chromium em uso/acesso negado, mas todas as suítes terminaram com código 0. Esses caches não são o banco de domínio. Nenhum teste abriu o banco persistente: escritas/integração usaram apenas :memory:; leituras e regressão do banco usaram memória ou diretórios temporários.

As verificações de sensibilidade foram feitas sem editar arquivos: o ciclo completo detectou update e delete que retornavam sem persistir; o teste de ordenação detectou remoção de ORDER BY; os dois testes de falha de releitura detectaram remoção de rollback; a conferência de fixtures detectou remoção de STRICT. A cópia virtual dos tipos passou com a restrição de uniões e gerou exatamente 18 TS2578 ao removê-la, comprovando a sensibilidade dos casos negativos. Essas verificações são evidências dos cenários exercitados, não uma prova de cobertura de todos os defeitos possíveis.

Permanecem os limites descritos neste documento: metadados internos devem corresponder ao schema; TypeScript não existe em runtime; enums e regras comerciais não são inferidos; indicadores são 0/1 e não booleanos; timestamps não são monotônicos; operações dentro de transação externa dependem de seu commit. Autenticação, autorização, DTOs de entidades, serviços, IPC de negócio e repositories concretos continuam fora desta etapa. Nenhuma decisão comercial pendente foi transformada em regra.

## Registro e operações

`T` representa um registro de persistência completo: `id: number`, `criado_em: string`, `atualizado_em: string` e campos obrigatórios com valores `string | number | null`. A restrição `RegistroSqlite<T>` rejeita campos opcionais, `undefined`, booleanos, objetos, métodos, arrays e instâncias de `Date`. Objetos de domínio exigem conversão explícita nos módulos correspondentes. Este contrato cobre os escalares TEXT/INTEGER/REAL das tabelas atuais, sem tentar suportar todos os recursos do SQLite.

O registro deve ter **formato único**: uniões de registros não fazem parte deste contrato. A restrição estática em `RegistroSqlite<T>` é aplicada por BaseRepository, ConfiguracaoRepository, DefinicaoRepository, MapaColunas, DadosCriacao, DadosAtualizacao e os tipos auxiliares de colunas. Ela rejeita também aliases e uniões compostas por interseções, como `RegistroPersistido & ({ nome: string } | { codigo: number })`, evitando que apenas as chaves comuns sejam usadas para prometer T completo. Não há suporte a uniões de registros.

Interseções que formam um único registro continuam permitidas. Uniões nos valores de um campo, como `string | null` ou um conjunto de literais de situação, continuam permitidas conforme os tipos de armazenamento existentes. A restrição é aplicada pelo TypeScript e apagada na compilação: não é uma identificação de uniões em execução. Sintaxe de aliases ou uniões equivalentes que o compilador normaliza para um único tipo não pode ser reconstruída; coerções explícitas e JavaScript incompatível continuam fora dessa garantia estática.

`BaseRepository<T, A>` possui um segundo parâmetro de tipo opcional: `A` é a união das colunas de dados atualizáveis. Se omitido, todas as colunas de dados são atualizáveis e o mapa precisa declarar isso; para restringir atualizações, o repository concreto informa a união exata ou `never` para nenhuma coluna. ID e timestamps nunca podem fazer parte de A. Não há configuração implícita que contradiga esse tipo.

| Método | Retorno |
|---|---|
| `create(dados: DadosCriacao<T>)` | `T` |
| `findById(id: number)` | `T | undefined` |
| `findAll(paginacao: Paginacao)` | `Pagina<T>` |
| `update(id: number, alteracoes: DadosAtualizacao<T, A>)` | `T | undefined` |
| `delete(id: number)` | `boolean` |

Todos são síncronos e implementados na base, que permanece uma classe abstrata para ser estendida. A base não cria nem fecha a conexão. O import de Conexao é somente de tipo. T não é DTO público e não deve ser enviado diretamente ao renderer, especialmente quando houver dados sensíveis.

## Definição única das colunas

A definição interna contém apenas `tabela` e `colunas`. `colunas` é um objeto obrigatório com uma entrada por chave de T. Cada entrada declara exatamente `tipo`, `anulavel` e `atualizavel`.

Exemplo de forma, sem criar um repository de produção:

```ts
interface RegistroExemplo extends RegistroPersistido {
  nome: string;
  observacao: string | null;
  quantidade: number;
}
type Atualizaveis = 'nome' | 'observacao';

const definicao: DefinicaoRepository<RegistroExemplo, Atualizaveis> = {
  tabela: 'registros_exemplo',
  colunas: {
    id: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
    nome: { tipo: 'TEXT', anulavel: false, atualizavel: true },
    observacao: { tipo: 'TEXT', anulavel: true, atualizavel: true },
    quantidade: { tipo: 'INTEGER', anulavel: false, atualizavel: false },
    criado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false },
    atualizado_em: { tipo: 'TEXT', anulavel: false, atualizavel: false }
  }
};
```

O compilador exige todas as chaves, inclusive as técnicas. Campo textual requer TEXT; numérico requer INTEGER ou REAL; campo exclusivamente nulo exige tipo de armazenamento explícito. Unir texto e número num mesmo campo não produz um tipo de coluna configurável neste contrato inicial. ID exige INTEGER; os timestamps exigem TEXT.

A nulabilidade de cada entrada deve corresponder exatamente à presença de `null` em T. A permissão de atualização deve corresponder exatamente a A. Assim, um campo não pode desaparecer da seleção, de uma lista de nulabilidade ou ser declarado não atualizável enquanto a assinatura específica de update o aceita.

A configuração gera `colunas` (leitura), `colunasCriacao`, `colunasAtualizacao` e `colunasAnulaveis` a partir desse único mapa. Essas listas são saídas somente de leitura, não entradas independentes. Todas as chaves do mapa são incluídas na leitura; todos os campos de dados participam da criação. As listas antigas fornecidas na entrada são rejeitadas. Não existe suporte a projeção parcial prometendo T completo.

## Materialização, validação e imutabilidade em execução

A definição, seu mapa e os metadados de cada campo devem ser objetos simples com protótipo Object.prototype ou nulo. Os valores são obtidos de descritores de propriedades próprias de dados, enumeráveis. Getters e setters são rejeitados sem serem chamados. Arrays, Map, Set, Date, protótipos personalizados, símbolos e propriedades não enumeráveis são rejeitados onde não fazem parte do contrato.

Primeiro são construídas cópias independentes. Toda validação e todo armazenamento usam essas cópias; a origem não é relida depois de validada. Os nomes aceitam apenas snake_case ASCII e o mapa exige as três chaves técnicas. Cada metadado exige exatamente três propriedades, tipo SQLite conhecido e flags booleanas. Em execução, ID e timestamps também são obrigatoriamente não anuláveis e não atualizáveis, com seus tipos técnicos corretos.

O mapa copiado, cada metadado, as listas derivadas e a configuração final são congelados. Alterar propriedades, referências ou metadados originais depois da construção não altera a configuração armazenada.

A implementação também rejeita proxies identificados por `node:util.types.isProxy`, antes de realizar reflexão. Isso não é uma alegação de proteção absoluta contra Proxy, código arbitrário ou um runtime comprometido. O contrato exige metadados internos confiáveis e objetos simples, não dados recebidos do usuário; não constitui um sandbox.

## Garantias estáticas e limites de execução

TypeScript verifica completude do mapa para T, escalares permitidos, tipo de armazenamento, nulabilidade e A. Esses tipos são apagados em execução. O validador verifica a estrutura dos metadados explícitos, suas flags e invariantes técnicas; não descobre todas as propriedades de T nem compara a definição com o schema físico.

Se alguém contornar o compilador com coerções ou fornecer JavaScript incompatível, a execução não pode inferir um campo de T omitido ou uma nulabilidade de domínio falsificada. Um mapa estruturalmente válido continua sendo a fonte explícita de informação. O repository concreto deve declará-lo com `DefinicaoRepository<T, A>`, usar T correspondente ao registro realmente selecionado e manter seus metadados coerentes com as tabelas. As leituras usam a seleção completa derivada do mapa. Uma checagem de schema físico não foi implementada.

`DadosCriacao<T>` exige todos os campos de dados. `DadosAtualizacao<T, A>` permite somente A, de forma opcional. Campos técnicos e demais campos proibidos têm tipo opcional `never`, bloqueando seu envio quando estão visíveis no tipo da variável. `exactOptionalPropertyTypes` rejeita `undefined` explícito; `null` só é aceito pelo tipo quando declarado.

Isso não impede propriedades extras escondidas por uma variável de tipo mais estreito, nem coerções explícitas. A proteção estática é complementada em execução: findById, update e delete validam o ID; findAll valida a paginação; create e update inspecionam todas as propriedades reais da entrada e validam os valores conforme os metadados. Atualizações vazias são rejeitadas.

A implementação preserva campos ausentes na atualização, distingue null de undefined e mantém zero/string vazia sem normalização por valor falso. Timestamps são gerados pela infraestrutura em UTC nas escritas. Não há defaults ou regras comerciais novos.

## Erros e paginação

`ErroRepository` recebe `unknown` para validar de fato valores de runtime. Apenas strings próprias do conjunto CONFIGURACAO_INVALIDA, ENTRADA_INVALIDA, CONFLITO, INDISPONIVEL e INTERNO são aceitas. Objetos, arrays, números, símbolos, funções e strings desconhecidas resultam em INTERNO sem coerção, sem chamar toString ou Symbol.toPrimitive e sem preservar o valor original. Todas as mensagens são fixas. Violações SQLite com código SQLITE_CONSTRAINT ou SQLITE_CONSTRAINT_* são traduzidas para CONFLITO, sem perder a falha nem retornar falso sucesso. Demais traduções seguem abaixo.

`Paginacao` contém pagina/tamanho, sem busca genérica. A subetapa 3.2 valida os limites antes de consultar. `Pagina<T>` inclui agora `totalPaginas` obrigatório para o repository. O tipo compartilhado `PaginaIpc<T>` preserva o formato anterior (itens, total, pagina, tamanho), importado e reexportado como `Pagina` por ContratoIpc.ts. Assim os canais e DTOs IPC existentes não mudam e os tipos compartilhados continuam sem depender do IPC.

## Leituras implementadas na subetapa 3.2

findById exige ID numérico inteiro positivo e seguro (até Number.MAX_SAFE_INTEGER). Consulta apenas as colunas da configuração congelada, com ID em parâmetro preparado, e retorna undefined quando ausente. Não há SELECT *, filtros, joins, busca ou ordenação fornecida pelo chamador.

findAll exige objeto simples com exatamente pagina e tamanho, ambos números inteiros seguros; página começa em 1 e tamanho fica entre 1 e 100. Strings numéricas não são convertidas. Ausência, null, undefined, NaN, infinitos, frações, propriedades extras, acessores e proxies detectáveis são rejeitados. Os dois valores são capturados por descritores, sem executar getters. O offset calculado também deve ser inteiro seguro. Todos os valores variáveis são parâmetros; somente identificadores internos validados são interpolados e delimitados por aspas duplas.

A ordenação fixa é id ASC. O retorno contém itens, total de registros, pagina, tamanho e totalPaginas = ceil(total / tamanho). Tabela vazia tem zero páginas; página além da última retorna itens vazios e mantém os totais reais, sem ajustar silenciosamente a página solicitada.

Conexao.transacaoLeitura executa o callback síncrono em uma transação DEFERRED. A contagem abre o snapshot usado também pela listagem e o driver encerra o escopo tanto no sucesso quanto em falha. Não se usa BEGIN IMMEDIATE nas leituras. Quando existe uma transação externa, o driver usa savepoint e prevalecem o snapshot e os bloqueios externos. Esta API interna não impõe modo read-only ao SQLite nem cancela trabalho assíncrono arbitrário; as duas operações do repository são SELECTs síncronos, sem callbacks externos. O método rejeita retornos semelhantes a Promise como defesa adicional, não como mecanismo de cancelamento.

SQLITE_BUSY e SQLITE_LOCKED são traduzidos para INDISPONIVEL; demais falhas inesperadas para INTERNO. As mensagens são fixas, sem SQL, parâmetros, mensagem original ou cause. A checagem do schema físico e a conversão entre registro e domínio continuam a cargo dos repositories concretos. Paginação e contagem são síncronas e tabelas muito grandes poderão exigir avaliação de desempenho futura.

Os testes estão em VerificarLeiturasRepository.ts, com RepositoryLeituraTeste e ConexaoObservadaTeste exclusivamente em tools/. A fixture não implementa escritas: seus métodos obrigatórios lançam erro explícito caso sejam chamados. Nenhum repository de produção ou módulo de outro integrante foi criado.

Comando: `npm run test:leituras`. São usados bancos em memória e um arquivo temporário WAL, removido após fechar as duas conexões. O teste de snapshot confirma uma inserção por outra conexão entre COUNT e listagem: a primeira página mantém o total e itens anteriores, e a consulta seguinte vê a inserção. Isso também verifica ausência de reserva de escrita. Há testes de limites com 105 registros, entradas inválidas antes de preparar SQL, zero/null/string vazia, integridade, mensagens sanitizadas e encerramento da transação em caso de erro.

## Escritas implementadas na subetapa 3.3

create exige exatamente todas as colunas de dados do mapa, inclusive as anuláveis (que podem receber null). Não há preenchimento implícito por defaults. update exige pelo menos uma coluna de A; campos omitidos ficam inalterados. Em ambos, campos desconhecidos, protegidos e não autorizados são rejeitados, inclusive quando ocultados por um tipo estático mais estreito. As entradas devem ser objetos simples com protótipo Object.prototype ou nulo. Descritores são capturados uma vez, sem executar getters/setters, e os valores escalares validados são copiados antes do SQL. Arrays, símbolos, propriedades não enumeráveis, proxies detectados e protótipos personalizados são rejeitados.

TEXT aceita somente string; INTEGER exige número inteiro seguro; REAL exige número finito. null só é aceito quando anulavel for true; undefined é sempre rejeitado. Zero e string vazia são preservados. Booleanos (incluindo false) não fazem parte do contrato aprovado ValorPersistivel: indicadores SQLite continuam sendo números 0/1, com constraints do schema. Não há conversão automática de tipos. Os metadados não descrevem enums, comprimentos ou regras de domínio; essas regras continuam nos serviços e nas constraints existentes. Os tipos TypeScript e os valores literais de T não são descobertos em execução.

SQLite gera o ID por INTEGER PRIMARY KEY. create verifica changes e lastInsertRowid, rejeitando IDs que não possam ser representados como inteiros positivos seguros, com rollback da inserção. create gera criado_em e atualizado_em iguais, por Date.toISOString(); update gera somente atualizado_em. A precisão é de milissegundos do relógio do sistema: duas operações no mesmo milissegundo podem ter timestamps iguais; não se promete um relógio monotônico.

Cada escrita usa Conexao.transacao (IMMEDIATE), que cria savepoint quando já existe uma transação externa. create e update executam a escrita e releem o registro na mesma transação, retornando também efeitos de AFTER triggers. Não se depende de RETURNING. Falha de releitura reverte o escopo da operação. O retorno interno é envolvido em um objeto síncrono para satisfazer a proteção de tipos contra Promise da conexão, sem coerções de T nem alteração desse contrato. update retorna undefined quando changes for zero; delete retorna changes === 1 e preserva integralmente FKs/RESTRICT. Não se usam OR REPLACE, OR IGNORE nem desativação de constraints.

Em transação externa, o retorno de uma operação ainda depende da confirmação externa. Uma violação adiada pelo SQLite até o COMMIT externo será observada pelo proprietário dessa transação, que também deve tratar o erro na fronteira da aplicação. O repository não finaliza a transação externa. Os callbacks internos são síncronos; não há autenticação, autorização ou validação de regras comerciais na base.

Os testes de escrita estão em tools/VerificarEscritasRepository.ts e usam RepositoryEscritaTeste somente como fixture, herdando as cinco operações reais. Todo banco desse teste é :memory:. O schema sintético e seus triggers existem somente nos testes, sem alteração nas dez tabelas ou migrations da aplicação. O comando é `npm run test:escritas`.

## Comandos e resultados

Na integração 3.4, foi acrescentado apenas o cenário ausente: um ciclo completo sobre o mesmo registro, com create, findById, listagem paginada, update parcial, ambas as releituras, delete e confirmação de ausência. O cenário também confere os totais após exclusão e preserva um segundo registro de controle. Ele faz parte de `test:escritas`, reutiliza RepositoryEscritaTeste e suas tabelas STRICT em memória, sem repository de domínio ou duplicação de schema. As demais verificações de entradas, integridade, erros e transações externas permanecem nas suítes existentes.

Os ajustes finais da 3.3 são permanentes: as três tabelas sintéticas de escrita usam STRICT, verificado por pragma_table_list; há testes separados de exceção na consulta de releitura após create e update, com restauração da instrumentação em finally e confirmação do rollback. A injeção fica restrita à instância de teste. Asserções feitas durante a observação da escrita são reapresentadas fora do repository para não serem confundidas com a falha esperada sanitizada.

A revisão de integração não exigiu alteração nos contratos públicos, na lógica de produção, nas migrations, nas regras comerciais ou nas dependências. As garantias estáticas, validações por metadados, DTOs IPC e limitações documentadas permanecem. O documento de segurança existente é [SEGURANCA.md](../SEGURANCA.md), na raiz; não existe uma cópia em docs/SEGURANCA.md. O banco e as transações são descritos em [BANCO.md](BANCO.md).

```sh
npm run typecheck
npm run test:contratos
npm run test:leituras
npm run test:escritas
npm run build
npm run test:banco
npm run test:infra
git diff --check
```

Os testes estáticos cobrem omissão de campos obrigatórios/técnicos, campo de T fora do mapa, flags divergentes de nulabilidade/atualização, tipos SQLite incompatíveis, campos não persistíveis, campos protegidos e as assinaturas das operações e do IPC. Não usam CRUD fictício.

`tools/UnioesRepository.test-d.ts` acrescenta casos positivos para registros simples, aliases, interseções de formato único e campos anuláveis; os casos negativos usam `@ts-expect-error` para uniões diretas, aliases e interseções nos pontos públicos da API. A verificação de sensibilidade remove somente a restrição em uma cópia virtual em memória e exige que as diretivas negativas passem a produzir TS2578, sem editar o código de produção.

Os testes de execução cobrem os getters variáveis reproduzidos na auditoria (zero leituras), setter, acessor dentro de metadados, coleções/protótipos/iteradores personalizados, Proxy detectado/revogado, estrutura inválida, propriedades extras e cópia congelada independente. As flags derivadas são conferidas nos casos válidos. Os testes de erro verificam strings conhecidas e inválidos incluindo objeto com toString, objeto com Symbol.toPrimitive, número e array, sem conversões.

Após as correções, typecheck e o build/teste de contratos passaram; 64 configurações inválidas foram rejeitadas. Nenhum banco é aberto por esses testes. A regressão do banco passou em nove grupos no Electron 45.3.2, usando exclusivamente memória ou arquivos temporários. A regressão da janela também passou, confirmando renderer/preload, isolamento, sandbox e ponte sem acesso genérico. Os builds executados pelas duas regressões passaram. A conferência de whitespace passou, apenas com o aviso preexistente LF/CRLF no README. Nenhuma migration, regra comercial ou dependência foi alterada.

Na correção específica de uniões, typecheck, teste de contratos (64 rejeições) e build passaram novamente. A análise dos testes pelo TypeScript 7.0.2 retornou zero diagnósticos com a restrição e exatamente 18 erros TS2578 ao removê-la somente em memória, comprovando a sensibilidade das diretivas negativas. As regressões do banco (nove grupos) e da janela passaram novamente. O teste da janela terminou com código 0, mas registrou mensagens de GPU do Chromium após o resultado OK; isso foi observado sem modificar a configuração gráfica ou ampliar o escopo desta correção. A restrição continua exclusivamente estática, sem validação de uniões em execução.

Na subetapa 3.2, `npm run typecheck` (incluindo todos os testes estáticos) e `npm run build` passaram. Executados diretamente após esse build, VerificarContratosRepository passou com 64 rejeições, VerificarLeiturasRepository com sete grupos e VerificarBanco com nove grupos, incluindo as proteções contra migrations assíncronas. VerificarInfraestrutura confirmou janela, renderer, preload, isolamento e sandbox e saiu com código 0; houve novamente dois diagnósticos de GPU após o OK. A primeira tentativa dos testes de leitura dentro do sandbox do Codex foi bloqueada por ACL do Windows no Electron instalado; a execução autorizada fora desse sandbox passou sem modificar ACLs nem desabilitar o sandbox da aplicação. Os testes de banco utilizaram exclusivamente memória e temporários. Não houve mudança em migrations, regras comerciais ou dependências.

Na subetapa 3.3, typecheck sem emissão (com os testes estáticos) e build passaram após corrigir a compatibilidade do retorno genérico com o contrato síncrono da conexão usando o envelope interno. VerificarEscritasRepository passou em oito grupos no Electron 45.3.2 com better-sqlite3 13.1.1 e SQLite 3.54.1, confirmando na prática run/changes/lastInsertRowid, timestamps UTC, validação, parâmetros, constraints, FKs/RESTRICT, savepoints, commit/rollback externos e releitura atômica após triggers. VerificarContratosRepository passou com 64 rejeições, VerificarLeiturasRepository com nove grupos (incluindo as observações corrigidas), VerificarBanco com nove grupos e VerificarInfraestrutura com saída 0. A sensibilidade da ordenação foi reexecutada em memória: o teste real passou com ORDER BY e falhou sem ele, retornando [5, 4] em vez de [1, 2]. O grafo dos imports locais de src, incluindo imports de tipos, não apresentou ciclos. A conferência de whitespace passou, com o aviso preexistente LF/CRLF do README. Nenhum banco persistente foi aberto; o teste de escrita usa somente memória, e as regressões de banco/leitura usam memória ou diretórios temporários. Não foram alteradas migrations, constraints, dependências ou módulos de domínio.
