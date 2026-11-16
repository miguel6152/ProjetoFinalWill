# Autenticação e sessão — subetapas 4.1, 4.2, 4.3 e 4.4

**Estado atual:** CRUD administrativo com interface, login/logout, provisionamento inicial, expiração, limites e revogação persistente de credencial implementados na rodada de encerramento. A seção final de encerramento e ENCERRAMENTO.md substituem afirmações históricas de funcionalidade pendente. A compatibilidade do ambiente é registrada por execução: não se presume Node global 24 apenas por um registro anterior.

Atualização 5.2: a seção final de correção substitui a associação somente por usuarioId e a revogação apenas por consulta descritas no histórico. Há migration aditiva de identidade persistente, revogação local após commit e proteção de operações pendentes.

As seções da 4.1 e da 4.2 preservam o histórico, inclusive a previsão original de bcrypt e os bloqueios já superados. A 4.2 usa Argon2id. A seção da 4.3 registra a implementação de sessões/IPC e suas correções. A seção final da 4.4 reúne a validação integrada atual e as ressalvas que permanecem.

A subetapa 4.1 define contratos, não executa login. Mantém os nomes futuros AutenticacaoService, SessaoManager e Autorizador. Naquela subetapa não há classes simulando esses componentes, hash real, armazenamento de sessões, handlers novos ou capacidades novas no preload.

## Organização e fronteiras

- `src/shared/tipos/Autenticacao.ts`: perfis, credenciais de entrada e saídas públicas, sem dependência de Electron, banco ou IPC.
- `src/shared/ipc/ContratoIpc.ts`: usa os tipos compartilhados e mantém as exportações de Perfil e UsuarioSessao. Os três canais auth preservam entradas e saídas anteriores.
- `src/main/seguranca/ContratosAutenticacao.ts`: interfaces internas das futuras classes, sem implementação. Não devem ser importadas no renderer.
- `src/main/seguranca/ErroAutenticacao.ts`: códigos e mensagens fixas, com projeção pública explícita.

Fluxo futuro: handler valida remetente/frame e obtém webContentsId do evento confiável; valida payload desconhecido com zod; chama AutenticacaoService; este consulta usuário por repository e verifica bcrypt; somente após sucesso estabelece sessão no SessaoManager. O handler constrói explicitamente o DTO e o Resultado IPC. Essas responsabilidades ainda não estão implementadas. Nenhum perfil ou webContentsId recebido no payload será confiável.

## Contratos internos

`ContratoDadosAutenticacao` separa a busca por e-mail normalizado, que retorna `DadosAutenticacao` com `senhaHash`, da releitura por ID, que retorna apenas `IdentidadeAutenticada` (id, nome, perfil e ativo). Ambas são assíncronas e retornam undefined quando não há usuário. São portas internas; não implementam repository nem expõem hash pelo IPC.

`ContratoHashSenha` define gerar, verificar e necessitaAtualizacao. A implementação futura deverá usar bcrypt com salt aleatório e custo calibrado, sem normalizar ou truncar senhas; deverá validar o limite em bytes antes da geração. Nenhum custo foi escolhido e nenhum hash é executado na 4.1. `DependenciasAutenticacao` reúne as portas de dados, hash e sessões para futura injeção, sem acoplar o serviço à conexão SQLite.

`ContratoAutorizador` define exigirIdentidade e exigirPerfil, retornando identidade interna após releitura do usuário ativo e perfil atual. Uma lista vazia de perfis permitidos deverá negar acesso. O contrato não implementa a matriz de permissões nem o escopo de registros de instrutores; essas verificações continuam necessárias nas etapas funcionais.

AutenticacaoService terá entrar(credenciais, contexto): Promise<UsuarioSessao>, obterSessao(contexto): Promise<UsuarioSessao> e sair(contexto): void. O retorno assíncrono acomoda bcrypt futuro sem executar hash nesta entrega. Os serviços deverão validar entradas com zod; tipos não validam dados de runtime.

SessaoManager terá estabelecer(contexto, usuarioId): void, obter(contexto): Readonly<SessaoInterna> | undefined, encerrar(contexto): void e encerrarTodas(): void. O estado interno contém apenas usuarioId e criadaEm (ISO UTC), associado ao webContentsId no armazenamento futuro em memória. Não guarda senha, hash, token ou cópia durável de perfil. Readonly é estático; cópia/imutabilidade runtime ainda serão responsabilidade da implementação.

Ausência no manager retorna undefined; auth:sessao continua retornando usuario somente em sucesso, com NAO_AUTENTICADO na ausência de sessão válida. Consultar sessão/autorização exigirá conferir usuário ativo e perfil atual no banco. Logout e destruição da janela deverão remover a sessão; encerramento da aplicação deverá remover todas. Não haverá restauração automática em disco. Encerrar sessão ausente deverá ser idempotente internamente; o handler continuará respeitando as exigências de sessão/origem da arquitetura.

## Erros e dados sensíveis

| Código | Uso futuro |
|---|---|
| VALIDACAO | Entrada malformada |
| NAO_AUTENTICADO | Credencial inválida, usuário ausente/inativo ou sessão inválida, sem distinguir publicamente essas causas |
| SEM_PERMISSAO | Origem/ação não permitida |
| INTERNO | Falha inesperada, inclusive infraestrutura |

ErroAutenticacao aceita unknown e reconhece somente strings conhecidas. Outros valores recebem INTERNO sem coerção ou leitura de propriedades. Não recebe causa nem mensagem externa. paraPublico retorna somente codigo/mensagem; nunca enviar a instância Error ou sua stack pelo IPC. A classe não traduz automaticamente erros de repository nem oferece um handler de captura: essa fronteira continua futura. Mensagens fixas não implementam proteção contra enumeração por tempo; login futuro precisará considerar esse canal e limitação de tentativas.

Credenciais existem apenas como entrada transitória e não podem ser logadas, persistidas ou copiadas para sessão/DTO. TypeScript usa tipagem estrutural: tipos públicos não eliminam propriedades extras escondidas em variáveis. Construção explícita das saídas e validação runtime serão obrigatórias; não se promete sanitização automática de objetos arbitrários.

Os contratos TypeScript não garantem segurança em runtime: não autenticam o remetente, não validam payloads nem tornam objetos imutáveis. Os handlers futuros deverão construir DTOs públicos explicitamente, selecionando apenas os campos permitidos, sem repassar objetos internos. Para erros de autenticação destinados ao renderer, deverão usar somente a projeção de `paraPublico()`, nunca a instância de `ErroAutenticacao`, sua stack ou propriedades internas. Isso não substitui o tratamento de falhas inesperadas na fronteira IPC.

## Pendências preservadas

Prazo/expiração da sessão, política e parâmetros de limitação de tentativas, custo bcrypt, provisionamento inicial do admin e matriz completa de permissões continuam para definição/revisão nas etapas correspondentes. Nenhum número padrão foi inventado. Não foi criado contrato de persistência de sessão ou implementado Autorizador. Não há alteração de schema, migrations, regras comerciais ou dependências; bcrypt e zod serão necessários somente na implementação funcional autorizada futura.

## Validação

Na retomada de 13/11/2026, typecheck, build, testes de erros, grafo de dependências e os 64 casos de contratos de repository passaram. As quatro regressões Electron (leituras, escritas, banco e infraestrutura) foram tentadas, mas bloqueadas antes das suítes pela ACL da instalação do Electron no sandbox atual. Os resultados anteriores abaixo são históricos e não representam nova execução bem-sucedida dessas quatro suítes. Não foram alteradas ACLs nem desabilitado o sandbox; a nova execução dessas regressões permanece pendente em ambiente que permita iniciar o Electron.

Comandos tentados após o build, todos bloqueados antes de executar as verificações das suítes:

| Suíte | Comando executado | Resultado na retomada |
|---|---|---|
| Leituras | `node_modules/.bin/electron.cmd dist/tools/VerificarLeiturasRepository.js` | Inicialização bloqueada pela ACL |
| Escritas | `node_modules/.bin/electron.cmd dist/tools/VerificarEscritasRepository.js` | Inicialização bloqueada pela ACL |
| Banco | `node_modules/.bin/electron.cmd dist/tools/VerificarBanco.js` | Inicialização bloqueada pela ACL |
| Infraestrutura | `node_modules/.bin/electron.cmd dist/tools/VerificarInfraestrutura.js` | Inicialização bloqueada pela ACL |

Os quatro processos emitiram erro fatal em `electron/shell/browser/win/install_dir_access.cc:52`: a instalação em `node_modules/electron/dist` possui entrada de ACL para um AppContainer package SID, mas não para `ALL APPLICATION PACKAGES`; por isso o Windows negou acesso ao token do sandbox (`Windows denies the sandbox token access`). Esses bloqueios não são resultados de aprovação ou reprovação das verificações internas das suítes. Não foram alteradas ACLs, permissões do Windows ou configurações de sandbox para contorná-los.

O verificador de dependências usa regex sobre o texto dos arquivos e resolve imports locais acrescentando `.ts` ao caminho. Não utiliza o parser TypeScript nem a resolução completa do compilador: não cobre aliases, resolução por diretório/index ou expressões dinâmicas, e pode interpretar texto em comentários ou strings como referência. As verificações de fronteira também são textuais e limitadas aos padrões reconhecidos. O resultado sobre os imports atuais não garante isolamento ou segurança em runtime e não substitui revisão arquitetural nem validação dos futuros handlers.

`npm run typecheck` inclui Autenticacao.test-d.ts, com compatibilidade dos canais, perfis, ausência de campos sensíveis e retornos internos. `npm run test:auth-contratos` verifica mensagens e códigos, entradas inválidas, objetos com coerção/acessores/proxies e projeção pública. Não testa login/sessão funcionais, pois não existem nesta subetapa. Regressões existentes de repository, banco e janela permanecem obrigatórias. Todos os testes de banco existentes usam memória ou temporários.

Registro histórico anterior à retomada, preservado para referência e não revalidado nesta conferência documental: typecheck sem emissão, build e test:auth-contratos passaram. Executados após o build, VerificarContratosRepository passou com 64 rejeições; VerificarLeiturasRepository com nove grupos; VerificarEscritasRepository com onze; VerificarBanco com nove (incluindo migrations síncronas); VerificarInfraestrutura confirmou janela, renderer, ponte, isolamento e sandbox. Esse registro relata que os quatro processos Electron foram inicialmente bloqueados pela ACL no sandbox do Codex e que a reexecução fora dele passou, sem alterar ACL ou o sandbox da aplicação. O grafo dos imports locais dos vinte arquivos TypeScript de src não apresentou ciclos. Os testes não utilizaram o banco persistente. O ambiente registrado usava Node global 25.7.0; a recomendação existente continua Node 24 LTS e as regressões nativas foram registradas no Electron 45.3.2/Node embarcado 24.22.2, SQLite 3.54.1. Isso não afirma nova validação em Node global 24 nem nova execução bem-sucedida das suítes Electron na retomada.

## Implementação da subetapa 4.2

Estado atual: verificação interna de credenciais, validação Zod e hash Argon2id implementados e aprovados nos testes de contratos, autenticação e integração SQLite. `argon2@0.45.2` e `zod@4.6.7` estão instalados e registrados nos manifests; o lockfile foi atualizado pelo npm. `npm audit` retornou zero vulnerabilidades, e typecheck e build passaram. Não foi executado `npm ci`, nem houve commit ou push. Isso não implementa login pela interface, sessões completas ou autorização. As tentativas anteriores com `zod@4.6.0` e falhas de instalação permanecem abaixo somente como histórico.

### Algoritmo, parâmetros e compatibilidade

A autorização da 4.2 prefere Argon2id e substitui a previsão anterior de bcrypt no AGENTS/arquitetura/contrato. `HashSenhaArgon2` implementa a interface existente usando `node-argon2`, sem alterar assinaturas públicas. `zod` fornece validação runtime, conforme a stack prevista. São dependências de produção, não bibliotecas expostas ao renderer.

Parâmetros explícitos: Argon2id versão 19 (0x13), memória 19456 KiB (19 MiB), duas passagens, paralelismo 1, saída de 32 bytes. A biblioteca gera salt criptográfico aleatório de 16 bytes por chamada. O texto PHC completo (`$argon2id$v=19$m=19456,t=2,p=1$<salt-base64>$<hash-base64>`) cabe no campo `usuarios.senha_hash TEXT NOT NULL` existente. Não há migration, reescrita de dados, senha padrão ou cadastro de usuário nesta entrega. A geração retorna o PHC para uso futuro pela camada de escrita; somente testes armazenam hashes nesta etapa.

O custo parte da [configuração mínima recomendada pela OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), não de calibração realizada neste computador. Medir latência e consumo em máquina de entrega continua pendente. A implementação usa a [biblioteca node-argon2](https://github.com/ranisalt/node-argon2), sem criptografia própria. Os testes atuais passaram em Node global 24.22.3 e no Main Electron 45.3.2/Node embarcado 24.22.2, incluindo Argon2id real e SQLite. Não foi necessário executar rebuild nesta validação; isso não garante compatibilidade com outras máquinas ou versões. O registro anterior de Node global 25.7.0 é histórico.

Senhas são aceitas como strings não vazias até 1024 bytes UTF-8, sem trim, normalização Unicode ou truncamento. Surrogates isolados são rejeitados para evitar conversões UTF-8 ambíguas. Esse é um limite técnico de entrada, não uma política completa de criação de senhas, que pertence ao fluxo futuro de usuários/provisionamento. Hashes aceitos na verificação precisam ser Argon2id v19 com PHC canônico, salt de 16 a 32 bytes, saída de 32 a 64 bytes, memória até 65536 KiB (mínimo 8 × paralelismo), uma a quatro passagens e paralelismo de um a quatro. A validação estrutural limita recursos antes de chamar o código nativo. Não há comparação direta de senha/hash: a biblioteca verifica a senha. Hash malformado/fora desses limites retorna false; falha da biblioteca para hash estruturalmente aceito gera INTERNO sanitizado. `necessitaAtualizacao` sinaliza formato não aceito ou parâmetros diferentes dos atuais, sem gravar rehash. Não há suporte automático a hashes bcrypt nem migração de credenciais legadas.

### Arquivos e fluxo no Main

- `src/services/ValidacaoAutenticacao.ts`: schemas zod e rejeição prévia de objetos com getters, proxies, campos extras ou protótipos inesperados. Tipos não substituem essas validações.
- `src/services/HashSenhaArgon2.ts`: geração, verificação e indicação de atualização. Permite injetar um motor de biblioteca apenas por código confiável no Main para testar falhas criptográficas; o padrão é a biblioteca real.
- `src/services/AutenticacaoService.ts`: implementa somente `Pick<ContratoAutenticacaoService, 'entrar'>`, recebendo somente as dependências de dados e hash. Não recebe gerenciador de sessões. `entrar` valida credenciais/contexto, normaliza apenas o email, consulta a porta interna, verifica hash e atividade e relê identidade após o await da verificação. Retorna um objeto novo com somente id, nome e perfil, nunca senha, hash ou token.
- `src/models/RegistroUsuarioAutenticacao.ts`: tipo da linha SQLite, privado à persistência; não é DTO público.
- `src/repositories/ConsultaAutenticacaoRepository.ts`: implementa `ContratoDadosAutenticacao` e estende BaseRepository conforme o padrão. Usa SELECTs parametrizados e projeções explícitas; somente a consulta por email lê hash, e a consulta por ID não o seleciona. Os cinco métodos genéricos herdados são explicitamente indisponíveis, evitando habilitar CRUD de usuários ou leituras genéricas com hash nesta etapa. Não há novo serviço/handler de CRUD.
- `src/main/Composicao.ts`: monta repository, hash e serviço após as migrations e disponibiliza o serviço apenas por método interno do Main. Ao encerrar, libera sua referência e fecha a conexão. Não cria ou persiste sessões.
- `src/main/seguranca/ContratosAutenticacao.ts`: comentários atualizados para a escolha de Argon2id e para distinguir verificação de credenciais de gerenciamento de sessão; assinaturas da 4.1 preservadas.
- `tools/VerificarAutenticacao.ts`: casos de hash real, validação, falhas injetadas e serviço com porta de dados controlada, sem banco ou sessão. Pode rodar em Node e ser reutilizado pela suíte Electron.
- `tools/VerificarAutenticacaoBanco.ts`: testes de hash real e integração SQLite em memória no Main Electron, inclusive schema existente, projeções, consulta parametrizada, conta inativa, métodos genéricos indisponíveis, falha de conexão e composição.
- `tools/Autenticacao42.test-d.ts`: verifica compatibilidade com as portas da 4.1 e ausência dos métodos/dependência de sessão na implementação parcial.
- `tools/Autenticacao.test-d.ts`: compatibilidade estática dos canais, perfis e contratos, incluída no typecheck.
- `tools/VerificarContratosAutenticacao.ts`: verifica códigos, mensagens, fallback e projeção pública dos erros.
- `tools/VerificarDependenciasAutenticacao.ts`: verifica imports reconhecidos por regex, ciclos e fronteiras dos 25 arquivos de src; não substitui análise completa do compilador ou segurança em runtime.
- `docs/AUTENTICACAO.md`: registra contratos, implementação, resultados e limitações das subetapas 4.1 e 4.2.
- `package-lock.json`: registra versões resolvidas e integridade, incluindo Argon2 0.45.2 e Zod 4.6.7.
- `package.json`: dependências justificadas e scripts `test:auth` e `test:auth-banco`. Não há alteração de preload, renderer ou contratos públicos IPC nesta subetapa.

### Ausência de sessão e limites de segurança

O retorno mantém o nome de tipo `UsuarioSessao` por compatibilidade, mas significa apenas credenciais conferidas naquele instante. Não é prova persistente de autenticação, token nem sessão estabelecida. `AutenticacaoService` não implementa obterSessao/sair e não finge sucesso dessas operações; esses métodos permanecem apenas no contrato completo para a 4.3. SessaoManager e Autorizador seguem sem implementação. O preload continua expondo objeto vazio e nenhum handler IPC é registrado, evitando publicar um login sem seu ciclo de sessão. A 4.3 deverá integrar o resultado da verificação ao gerenciador, validar remetente/frame e obter contexto de evento confiável antes de habilitar os canais previstos. IDs/perfis enviados no payload de credenciais são rejeitados; o ID consultado após a senha vem do banco. Validar numericamente webContentsId não autentica origem; o serviço só pode ser chamado por código confiável do Main.

Credenciais inválidas, conta ausente e conta inativa produzem o mesmo código/mensagem NAO_AUTENTICADO. Para conta ausente, o serviço verifica a senha recebida contra um hash fictício criado com segredo aleatório por instância; todas as tentativas de formato válido aguardam essa inicialização, cujo resultado é reutilizado. Contas inativas passam pela verificação de senha antes da rejeição. Isso reduz atalhos de comportamento, mas não promete tempo constante: consulta, releitura de identidade, hashes corrompidos/antigos, escalonamento e erros internos podem ter tempos diferentes. Falhas do banco/criptografia são traduzidas para erros fixos sem causa, SQL ou credenciais. Não há logs no serviço/repository/hash. Apenas `paraPublico()` deve projetar erros de autenticação destinados ao renderer, e handlers futuros devem construir DTOs explicitamente.

Limitação de tentativas/concorrrência ainda não está implementada; deve ser definida antes de expor login via IPC. Não há atualização de senha/rehash, provisionamento de admin, expiração de sessões ou autorização por perfil. A releitura após verificação observa atividade/perfil atuais, mas não cria uma transação através do await nem garante atomicidade diante de futuras mudanças concorrentes de credenciais; o fluxo futuro de alteração/revogação deve definir essa política. Nenhum recurso comercial foi implementado.

### Histórico de verificações inicialmente tentadas na 4.2

Os resultados desta seção e do diagnóstico seguinte antecedem a instalação bem-sucedida. As falhas de autenticação, typecheck e build foram superadas conforme a seção final; as quatro regressões gerais Electron não foram repetidas na correção do Zod.

| Comando | Resultado observado |
|---|---|
| `npm install --save-exact argon2@0.45.2 zod@4.6.0 --fetch-retries=0 --fetch-timeout=15000 --cache .cache-npm-auth` | EACCES no acesso ao registry; dependências não instaladas e lockfile não atualizado |
| `npm run typecheck` | Falhou com TS2307: módulos argon2/zod não encontrados; não constitui aprovação parcial dos tipos novos |
| `npm run build` | Falhou pelos mesmos módulos ausentes; tsc emitiu JS parcial em dist, mas não concluiu o build |
| `node dist/tools/VerificarContratosAutenticacao.js` | Passou: códigos, fallback e projeção pública |
| `node dist/tools/VerificarDependenciasAutenticacao.js` | Passou: 25 arquivos de src sem ciclos nos imports reconhecidos e fronteiras verificadas por regex |
| `node dist/tools/VerificarContratosRepository.js` | Passou: 64 configurações inválidas rejeitadas |
| `node dist/tools/VerificarAutenticacao.js` | Bloqueado no carregamento: MODULE_NOT_FOUND para argon2; casos de teste não executados |
| `node_modules/.bin/electron.cmd dist/tools/VerificarAutenticacaoBanco.js` | Bloqueado no carregamento: módulo zod ausente; casos de teste não executados |
| `node_modules/.bin/electron.cmd dist/tools/VerificarBanco.js` | Bloqueado no carregamento: módulo zod ausente pela composição; verificações de migrations não executadas |
| `node_modules/.bin/electron.cmd dist/tools/VerificarLeiturasRepository.js` | Inicialização bloqueada pela ACL Windows já descrita; suíte não executada |
| `node_modules/.bin/electron.cmd dist/tools/VerificarEscritasRepository.js` | Inicialização bloqueada pela mesma ACL; suíte não executada |
| `node_modules/.bin/electron.cmd dist/tools/VerificarInfraestrutura.js` | Inicialização bloqueada pela mesma ACL; suíte não executada |

Os processos de teste que permaneceram abertos após erro de carregamento foram interrompidos. Nenhum teste foi apontado ao banco persistente e nenhuma ACL, permissão do Windows ou configuração de sandbox foi alterada. Para concluir a 4.2, faltam instalar as dependências/atualizar o lockfile, concluir typecheck/build, executar os testes novos e repetir as regressões em ambiente compatível. Até lá, não se declara aprovação da autenticação nem compatibilidade nativa comprovada.

### Histórico da recuperação da instalação: diagnóstico confirmado à época

Foram examinados integralmente os logs locais da instalação original (`2026-11-14T02_25_20_304Z-debug-0.log`) e da nova tentativa (`2026-11-14T02_36_53_114Z-debug-0.log`), com cuidado para não divulgar credenciais. Ambos mostram cache-miss dos manifests e EACCES durante os GETs ao registry, antes da instalação. As linhas `placeDep ... OK` do log não comprovam pacote instalado: a operação termina com exit 1 ainda na construção da árvore de dependências.

A configuração efetiva mantém `https://registry.npmjs.org/`, `strict-ssl=true`, `offline=false` e nenhum proxy HTTP/HTTPS configurado. Não existem arquivos `.npmrc` locais, do usuário ou globais nos caminhos consultados; existe a configuração distribuída com o npm. Nenhuma configuração foi modificada. O cache padrão fica fora da área gravável do workspace e o npm também reporta falha ao salvar logs nele; esse é um impedimento de gravação separado do bloqueio de rede.

Para separar as causas, a nova instalação usou cache dentro do projeto: `npm install --cache .cache-npm-auth --fetch-retries=0 --fetch-timeout=15000`. O npm conseguiu gravar seu log local, mas os GETs novamente receberam EACCES. `npm cache verify --cache .cache-npm-auth` passou, com zero entradas/zero bytes. `npm install --offline --cache .cache-npm-auth --fetch-retries=0` terminou com ENOTCACHED; a consulta ao cache padrão também não encontrou os pacotes solicitados.

Uma verificação independente via `node:https`, sem modificar SSL ou rede, reproduziu EACCES no registry oficial. DNS resolveu normalmente. A instrumentação observou socket criado, mas nenhum evento de conexão TCP, TLS ou resposta HTTP antes do erro (`tcp=false, tls=false, http=false`). O ambiente informa `CODEX_SANDBOX_NETWORK_DISABLED=1`. Essas evidências identificam o bloqueio de saída de rede do sandbox como causa da falha de download, em vez de erro de certificado, autenticação HTTP ou cache local corrompido. Não foi identificada nem modificada uma regra global específica de firewall/ACL do Windows; remover a restrição do ambiente está fora dos mecanismos de recuperação permitidos nesta sessão.

`npm ls --depth=0` confirma argon2@0.45.2 e zod@4.6.0 como UNMET DEPENDENCY; `require.resolve` confirma MODULE_NOT_FOUND para ambos. As dependências anteriores continuam presentes. O lockfile permanece sem diff em relação ao Git, ainda sem essas dependências; não foi editado manualmente ou apresentado como atualizado. Portanto, a compatibilidade nativa com Electron 45.3.2, sua versão embutida de Node e a necessidade de rebuild continuam não comprovadas. Não se tentou rebuild sem a biblioteca instalada nem se substituiu o registry, desabilitou SSL, alterou ACL/permissões/sandbox ou simulou instalação.

Naquela recuperação, os verificadores diretos existentes de erros de autenticação, dependências (25 arquivos) e contratos de repository (64 rejeições) passaram. Foram executados diretamente os artefatos disponíveis em dist; isso não equivalia a um novo build completo bem-sucedido nem à validação funcional da 4.2. `git diff --check` também passou. Naquele momento, os testes funcionais permaneciam pendentes; esse estado foi superado pela validação abaixo. A 4.3 não foi iniciada.

### Resultados atuais da 4.2 — 14/11/2026

Resultados efetivamente observados nesta sessão, antes desta revisão exclusivamente documental:

| Comando | Resultado atual |
|---|---|
| Instalação exata de `zod@4.6.7` pelo npm | Aprovada; somente o Zod foi atualizado, preservando Argon2 0.45.2 e as demais dependências |
| `npm audit` | Aprovado: zero vulnerabilidades |
| `npm run typecheck` | Aprovado, incluindo os dois arquivos de testes de tipos da autenticação |
| `npm run build` | Aprovado; as três suítes abaixo também concluíram seus builds prévios |
| `npm run test:auth-contratos` | Aprovado: quatro códigos de erro, fallback sem coerção, projeção sem stack/cause e 25 arquivos sem ciclos nos imports reconhecidos |
| `npm run test:auth` | Aprovado: oito grupos, incluindo hash real, validação, credenciais inválidas, conta inativa e falhas sanitizadas |
| `npm run test:auth-banco` | Aprovado: os oito grupos anteriores e integração real Argon2id/SQLite no Main Electron 45.3.2/Node 24.22.2; projeções, SQL parametrizado, falha de banco e composição |
| `git diff --check` | Aprovado; somente avisos de conversão LF para CRLF |

O acesso ao registry e a inicialização Electron falharam inicialmente dentro do sandbox do agente. As reexecuções autorizadas fora dele passaram, sem alterar ACLs, configurações de rede ou o sandbox da aplicação. Não foi usado `npm audit fix --force`.

Os testes usam dados sintéticos. A suíte de autenticação trabalha em memória, sem banco persistente; a integração utiliza exclusivamente SQLite `:memory:`, inclusive na composição. As regressões gerais já registradas usam bancos em memória ou arquivos temporários, sem apontar ao banco persistente. Leituras, escritas, banco e infraestrutura não foram repetidos nesta correção do Zod; seus resultados anteriores continuam históricos. Não se atribui à execução atual da autenticação o uso de arquivos temporários que ela não cria.

Permanecem ausentes: login no renderer/preload, handlers IPC de autenticação, SessaoManager, Autorizador, logout funcional, expiração/revogação de sessões, limitação de tentativas e concorrência, provisionamento do primeiro admin e atualização persistida de senha/rehash. `entrar` apenas verifica credenciais e retorna identidade, sem estabelecer sessão. A aprovação das suítes da 4.2 não significa sistema pronto para uso com dados reais nem implementação da 4.3.

## Implementação da subetapa 4.3

Estado em 14/11/2026: gerenciamento de sessões em memória e os três canais IPC de autenticação implementados e testados. A interface visual continua sendo a tela de infraestrutura; não foi criada tela de login ou cadastro inicial. Não houve alteração de schema, dependências, algoritmos de hash ou contratos públicos da 4.1/4.2, nem commit ou push. As alterações preexistentes foram preservadas.

### Arquivos e responsabilidades

- `src/main/seguranca/SessaoManager.ts` (novo): implementa ContratoSessaoManager, registra contextos autorizados pelo Main e guarda somente usuarioId/criadaEm em objetos congelados. Uma versão privada por contexto invalida operações pendentes; não há credencial, hash, perfil armazenado ou persistência de sessão.
- `src/main/seguranca/Autorizador.ts` (novo): implementa ContratoAutorizador, relê usuário ativo e perfil atual e rejeita listas vazias de perfis. Usuário removido/inativo invalida sessão; falha de leitura nega acesso e retorna erro sanitizado. Não implementa escopo de registros de módulos futuros.
- `src/services/SessaoAutenticacaoService.ts` (novo): implementa o contrato completo, coordenando o verificador parcial da 4.2, sessões e autorização. Cria sessão somente depois de conferir credenciais, releitura de identidade e versão do contexto. Expõe consulta e logout sem alterar AutenticacaoService ou seus testes de compatibilidade da 4.2.
- `src/main/ipc/AutenticacaoHandler.ts` (novo): registra somente auth:entrar, auth:sessao e auth:sair, valida origem e argumentos, constrói DTOs públicos e projeta erros por paraPublico(). Remove handlers e listeners no encerramento.
- `src/main/Composicao.ts`: monta os novos componentes e vincula as janelas; encerra sessões/IPC antes de fechar o banco. O acesso interno ao verificador da 4.2 permanece disponível.
- `src/main/JanelaPrincipal.ts`: permite vincular a janela pelo Main antes do carregamento do renderer, mantendo todas as opções de segurança existentes.
- `src/main/Aplicacao.ts`: conecta a janela criada à composição.
- `src/preload/PonteAcademia.ts`: expõe somente academia.autenticacao.entrar, sessao e sair, com canais fixos. Não oferece invoke genérico, escolha de canal, evento ou contexto.
- `tools/VerificarSessoes.ts` (novo): testa sessões, perfis atuais, invalidação, consultas concorrentes com logout, falhas e cancelamento de login pendente.
- `tools/VerificarAutenticacaoIpc.ts` (novo): testa IPC/preload reais em janelas ocultas, Argon2id e SQLite em memória, remetentes/frames, falsificação, ciclo de vida e composição.
- `tools/VerificarInfraestrutura.ts`: atualiza a expectativa da ponte para a única capacidade agora implementada, autenticacao.
- `package.json`: adiciona somente scripts test:sessoes e test:auth-ipc; versões de dependências e lockfile permanecem inalterados pela 4.3.
- `SEGURANCA.md` e este documento: registram os controles atuais, resultados e limitações após validação.

### Origem, concorrência e ciclo de vida

O Main vincula a instância exata de BrowserWindow/webContents criada por JanelaPrincipal. Cada handler exige webContents vivo e registrado, senderFrame igual ao frame principal vivo e URL exata da página permitida tanto no frame quanto no webContents. O contexto contém exclusivamente o ID extraído desse remetente. Payloads extras, identidade/perfil enviados no login, parâmetros nos canais sem entrada e argumentos adicionais são rejeitados. Uma janela não registrada e subframes não podem autenticar ou consultar outra sessão.

auth:entrar é permitido sem sessão após validar a origem. auth:sessao e auth:sair exigem identidade ativa e um dos perfis admin/recepcao/instrutor, conferidos no Main. A resposta contém apenas usuario: { id, nome, perfil } ou encerrada: true; erros contêm somente codigo/mensagem. Sem sessão, a resposta é NAO_AUTENTICADO; erro inesperado é INTERNO, sem stack/cause, SQL, hash ou credenciais.

Cada novo login admitido invalida a sessão anterior antes de verificar credenciais. Apenas um login por contexto pode estar em andamento; outro recebe SEM_PERMISSAO, sem iniciar novo hash. Logout invalida também login pendente, mesmo quando retorna NAO_AUTENTICADO por ainda não existir sessão. Versões do contexto e comparação da sessão impedem que respostas tardias recriem sessões após logout, navegação, destruição ou encerramento. Origem e versão são conferidas novamente antes de devolver a resposta IPC.

Após a auditoria da 4.3, o logout passou a capturar também a instância exata da sessão no início da chamada. Depois da consulta assíncrona, exige novamente origem/frame válidos, mesma geração e mesma sessão antes de encerrá-la. Sem sessão, o cancelamento do login pendente ocorre sincronamente, sem consulta. Não há logout incondicional no catch: falhas de consulta preservam a classificação pública original, inclusive INTERNO, sem detalhes internos. O autorizador só revoga por falha inesperada se a sessão armazenada ainda for a instância consultada, preservando sessões substitutas.

Navegação principal (inclusive reload) e perda do processo renderer invalidam a sessão e operações pendentes. Destruição da janela ou do webContents remove o registro e os listeners. Encerrar a composição remove handlers, registros e sessões antes de fechar a conexão. Não há restauração automática. contextIsolation, sandbox, nodeIntegration: false, CSP e bloqueios de navegação/permissões permanecem ativos; não foi alterada ACL ou configuração de segurança para executar testes.

### Validação da 4.3

Todos os comandos abaixo passaram. Os testes Electron foram executados fora do sandbox do agente com autorização, mantendo o sandbox da aplicação. Os verificadores diretos usaram artefatos do build aprovado.

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Aprovado, incluindo os testes de tipos existentes |
| `npm run build` | Aprovado |
| `npm run test:sessoes` | Aprovado: sessões/DTOs, perfis, conta inativa/excluída, logout, contexto inválido, concorrência e falhas |
| `npm run test:auth-ipc` | Aprovado: cobertura original e regressões da auditoria — logout antigo, falha tardia, sessão substituta preservada, erro INTERNO no logout, duas janelas autorizadas com usuários diferentes e render-process-gone nativo |
| `node dist/tools/VerificarContratosAutenticacao.js` | Aprovado: códigos e projeção de erros |
| `node dist/tools/VerificarDependenciasAutenticacao.js` | Aprovado: 29 arquivos de src, sem ciclos nos imports reconhecidos |
| `node dist/tools/VerificarAutenticacao.js` | Aprovado: oito grupos da 4.2 |
| `node dist/tools/VerificarContratosRepository.js` | Aprovado: 64 configurações inválidas rejeitadas |
| `electron dist/tools/VerificarAutenticacaoBanco.js` | Aprovado: oito grupos e integração Argon2id/SQLite da 4.2 |
| `electron dist/tools/VerificarInfraestrutura.js` | Aprovado: janela, preload, isolamento, sandbox, CSP e ponte restrita |
| `electron dist/tools/VerificarBanco.js` | Aprovado: nove grupos, incluindo migrations e persistência temporária |
| `electron dist/tools/VerificarLeiturasRepository.js` | Aprovado: nove grupos |
| `electron dist/tools/VerificarEscritasRepository.js` | Aprovado: onze grupos |
| `git diff --check` | Aprovado; somente avisos de conversão LF para CRLF |
| `npm audit` | Reexecutado após as correções da auditoria: zero vulnerabilidades |

Somente dados sintéticos foram usados. Os testes novos não acessam banco persistente e a integração IPC usa exclusivamente SQLite :memory:. As regressões gerais usam memória/arquivos temporários. Nenhuma dependência foi instalada ou atualizada para corrigir os achados.

### Correções dos achados da auditoria da 4.3

A auditoria classificou a versão anterior como bloqueada: logout e falhas de consultas antigas podiam apagar uma sessão posterior, e o logout podia substituir INTERNO por NAO_AUTENTICADO. Essas falhas foram corrigidas exclusivamente em AutenticacaoHandler e Autorizador, sem alteração dos contratos públicos. A cobertura foi ampliada em tools/VerificarAutenticacaoIpc.ts.

O novo teste falhou antes da correção com “Logout antigo modificou a sessão posterior”, reproduzindo a perda da sessão do usuário 2 após reload da mesma janela. Após a correção, passou para respostas tardias tanto de sucesso quanto de erro. As consultas de autorização são retardadas por promises controladas, com sinal explícito de início, sem depender de sleeps; credenciais e sessões novas são verificadas com Argon2id/SQLite reais. O teste de documento antigo usa o handler diretamente para observar sua resposta mesmo após o reload; os novos logins e consultas de validação usam IPC/preload reais.

As asserções verificam identidade por referência e geração da sessão substituta antes e depois da conclusão da operação antiga, além de consultar a identidade pública pelo preload. A falha tardia de auth:sessao também foi testada após trocar o usuário no mesmo documento. A falha operacional em auth:sair retorna INTERNO com somente codigo/mensagem e revoga apenas a sessão consultada.

Duas janelas autorizadas ficam abertas simultaneamente com usuários/perfis distintos; falsificação de identidade é rejeitada e o logout de uma não altera sessão ou geração da outra. O teste provoca render-process-gone com forcefullyCrashRenderer em uma janela oculta, confere invalidação, recupera o renderer, exercita novamente os três canais e verifica a remoção do contexto na destruição.

Após essas correções, passaram novamente typecheck, build, test:auth-contratos, test:auth, test:auth-banco, test:sessoes, test:auth-ipc, test:contratos, test:infra, test:banco, test:leituras e test:escritas. npm audit retornou zero vulnerabilidades. Os resultados corrigem os bloqueadores reproduzidos e permanecem disponíveis para revisão; não substituem uma nova aprovação independente.

### Limitações e decisões pendentes

Ainda faltam tela de login, provisionamento inicial do admin, CRUD de usuários, atualização persistida de senha/rehash e controles específicos dos módulos futuros. As sessões não têm expiração automática: prazo e política de expiração não foram definidos. Não há política de bloqueio por número de tentativas ou limitação temporal; a proteção implementada limita apenas logins simultâneos por contexto. Calibração do hash e política de tentativas continuam pendentes antes do uso real.

Reler atividade/perfil evita confiar em identidade durável do renderer, mas não cria transação que cubra todo o trabalho assíncrono nem substitui autorização imediatamente antes de futuras mutações. Não há garantia de tempo constante contra enumeração. A validação automatizada não equivale à aprovação humana da entrega nem torna o sistema pronto para dados reais.

## Integração e validação de segurança — subetapa 4.4

Resultado técnico em 14/11/2026: **aprovada com ressalvas para o escopo de integração e validação**. A inspeção não identificou novo defeito de produção que exigisse alterar os componentes já aprovados. Foram fechadas lacunas de cobertura pelo IPC e na composição real. A avaliação não substitui revisão independente e não autoriza uso com dados reais, commit ou push.

### Alterações e evidências

- `tools/VerificarSegurancaAutenticacao.ts` (novo): sete grupos com Electron, preload, renderer, SQLite e Argon2id reais; janelas ocultas e apenas dados sintéticos. O arquivo temporário da composição é criado exclusivamente para o teste e removido após fechamento das conexões, com validação do diretório absoluto e sem remoção recursiva.
- `package.json`: acrescenta somente `test:auth-seguranca`. Nenhuma instalação, atualização de dependências ou alteração do package-lock.json.
- Este documento e `SEGURANCA.md`: resultados, avaliação de tentativas repetidas e limitações atuais. Código de produção, contratos, opções Electron e todos os testes anteriores permanecem inalterados nesta subetapa.

| Grupo da nova suíte | Resultados efetivamente verificados |
|---|---|
| Entradas inválidas | 17 casos pelo preload/IPC: dados ausentes, tipos errados, email inválido, senha vazia, surrogate isolado, tamanho excedido e campos extras de identidade/contexto. Todos retornam VALIDACAO, não criam sessão e não incrementam contadores de banco/hash. |
| Credenciais e repetição | Senha incorreta, usuário inexistente, inativo e PHC inválido retornam a mesma resposta pública NAO_AUTENTICADO. Cinco tentativas incorretas sequenciais não autenticam; um login válido posterior funciona. Não há inferência de bloqueio ou proteção temporal nesse teste. |
| Falhas internas | Falhas injetadas nas portas de consulta, verificação de hash e releitura chegam pelo IPC como INTERNO, sem sessão ou detalhes internos. Após remover a falha, o login válido funciona. Os testes anteriores continuam exercitando falhas do motor Argon2id e validações locais contra getters/proxies. |
| Revogação e isolamento | UPDATEs parametrizados no SQLite alteram perfil e desativam usuário. A consulta reflete o perfil atual, exigirPerfil nega admin ao instrutor e a desativação revoga a sessão. Reativar o usuário não restaura a sessão anterior. A sessão e geração da outra janela permanecem intactas. |
| SQL e origem | Consultas com texto de injeção não retornam usuários; dados existentes permanecem intactos. Todos os canais negam janela não registrada, frame nulo, frame de outra janela, URL diferente e contexto destruído. Contadores confirmam que origens rejeitadas não iniciam banco/hash. |
| Falha SQLite real | Fechar o banco com duas sessões válidas faz logout e consulta retornarem INTERNO, revoga as sessões consultadas e impede novo login. O erro do logout não é mascarado como NAO_AUTENTICADO. |
| Composição real | Um banco temporário é preparado e passado a Composicao.iniciar; JanelaPrincipal vincula o handler antes do renderer. Login válido, consulta e logout funcionam pelo preload, e o arquivo SQLite permanece byte a byte igual ao original após encerrar a composição. Não há persistência adicional de sessões/credenciais por esse fluxo. |

A suíte também observa que o processo renderer está sandboxed no Windows via app.getAppMetrics. A ponte só é publicada após o preload conferir contextIsolated/sandboxed; no mundo principal não existem require, process, ipcRenderer ou invoke genérico. As únicas capacidades são autenticacao.entrar/sessao/sair, em objetos congelados. As opções contextIsolation: true, sandbox: true e nodeIntegration: false foram preservadas no código de produção.

A navegação iniciada pelo renderer para uma URL file: local diferente é cancelada. Para testar a origem independentemente desse bloqueio, o Main força uma navegação para about:blank: o IPC nega a chamada e não acessa banco/hash. Os cenários de frame/contexto usam eventos reais do Electron passados ao handler; login e origem também são exercitados pela ponte efetiva. Isso não equivale a fuzzing de todo o transporte IPC.

Os testes da 4.3 continuam cobrindo login pendente concorrente com logout, consulta concorrente com logout, navegação e destruição, as duas corridas corrigidas, duas janelas autorizadas com usuários distintos e render-process-gone nativo com recuperação. As asserções verificam sessão por referência, geração e identidade pública; não se limitam à presença de métodos. A inicialização de Aplicacao foi revisada, mas não foi aberta contra o banco real de userData; a composição equivalente foi exercitada com o arquivo temporário.

### Avaliação de tentativas e limitações

Entradas malformadas são rejeitadas antes do trabalho de banco/hash; o hash limita formato/custos do PHC e tamanho UTF-8 da senha. Apenas um login por contexto pode estar pendente, e o renderer não pode registrar janelas ou escolher contexto/identidade. As falhas públicas não distinguem senha errada, conta ausente ou inativa. Isso não garante tempo constante nem resistência a inundação do transporte ou tentativas sequenciais.

**Não foi implementado bloqueio de contas por email informado no login.** Sem estratégia adicional, um atacante poderia usar essa política para bloquear contas legítimas. Uma futura política precisa definir limites de recursos, justiça entre contextos, recuperação e efeitos de reload/reabertura, sem confiar no renderer. A suíte atual confirma rejeição segura e recuperação de tentativas repetidas; não mede força bruta, throughput ou resistência a negação de serviço.

**Expiração automática continua ausente:** criadaEm não é um TTL, não há relógio/prazo de inatividade aplicado à autorização. Política de tentativas sequenciais, expiração, calibração do hash na máquina de entrega, tela de login e provisionamento inicial de usuários continuam pendentes. Atualização persistida de senha/rehash, CRUD de usuários e autorização de operações futuras também permanecem fora desta entrega. Releitura de atividade/perfil não substitui autorização junto às futuras mutações.

### Validação executada na 4.4

Node global 24.22.3; Electron 45.3.2 com Node 24.22.2; SQLite 3.54.1 e better-sqlite3 13.1.1 nas regressões. Todos os comandos abaixo concluíram com código 0; resultados e asserções foram conferidos. Electron foi executado com autorização fora do sandbox do agente, sem alterar o sandbox da aplicação, ACLs ou configurações de segurança.

| Comando | Resultado final |
|---|---|
| `npm run typecheck` | Aprovado: Main, preload, renderer e testes de tipos |
| `npm run build` | Aprovado; builds prévios das suítes também concluídos |
| `npm run test:auth` | Aprovado: oito grupos de autenticação/hash |
| `npm run test:auth-contratos` | Aprovado: erros públicos e 29 arquivos de src sem ciclos nos imports reconhecidos |
| `npm run test:sessoes` | Aprovado: ciclo de vida, perfil atual, falhas e concorrência |
| `npm run test:auth-ipc` | Aprovado: IPC/preload real e todas as regressões das corridas da 4.3 |
| `npm run test:auth-seguranca` | Aprovado: sete grupos adicionais descritos acima |
| `npm run test:auth-banco` | Aprovado: autenticação e integração Argon2id/SQLite no Main |
| `npm run test:contratos` | Aprovado: 64 configurações de repository inválidas rejeitadas |
| `npm run test:infra` | Aprovado: VerificarInfraestrutura, janela, renderer, ponte e isolamento |
| `npm run test:banco` | Aprovado: VerificarBanco, nove grupos, incluindo migrations síncronas e persistência temporária |
| `npm run test:leituras` | Aprovado: VerificarLeiturasRepository, nove grupos |
| `npm run test:escritas` | Aprovado: VerificarEscritasRepository, onze grupos |
| `npm audit` | Zero vulnerabilidades; nenhum audit fix ou force utilizado |
| `git diff --check` | Aprovado; apenas avisos de conversão LF para CRLF |

As tentativas iniciais de preparação da suíte expuseram suposições incorretas do teste sobre uma API de preferências não disponível, o agendamento da navegação e o encerramento automático após fechar todas as janelas. Foram ajustados os testes para a API tipada disponível, resposta antes de iniciar a navegação e ciclo de vida correto das fixtures. Nenhuma proteção da produção ou teste anterior foi removido para obter aprovação.

## Etapa 5 — CRUD administrativo de usuários (entrega inicial; atualizada no encerramento)

Implementação restrita à frente de Miguel: UsuarioRepository, UsuarioService, ValidacaoUsuario, ErroUsuario e UsuarioHandler. Na correção 5.2, ConsultaAutenticacaoRepository, AutenticacaoService, SessaoAutenticacaoService, Autorizador e SessaoManager também passaram a transportar e conferir a identidade persistente interna. AutenticacaoHandler disponibiliza ao outro handler do Main sua validação de contexto já existente, sem expô-la ao Renderer, preservando as guardas de logout, geração e revogação tardia corrigidas na 4.3.

Composicao monta o serviço sobre a mesma conexão e sessões existentes e remove handlers administrativos antes de encerrar a autenticação/banco. Preload publica usuarios.criar/listar/obter/atualizar/excluir/alterarSenha, em objeto congelado, sem canal genérico. A autorização admin é obrigatória no Main para os seis canais; recepcao e instrutor são negados. A nova capacidade exigiu apenas ampliar as expectativas das três suítes anteriores da ponte e a união estática de canais, sem remover cenários ou asserções de segurança.

Os contratos anteriores de criar/listar/obter/excluir são preservados. usuarios:atualizar passa a usar Partial<Omit<NovoUsuario, 'senha'>>: alteração deliberada para impedir redefinição de senha por mass assignment. O novo usuarios:alterar-senha recebe { id, senha } e retorna UsuarioDto, exclusivamente para redefinição administrativa autorizada. Não existe recuperação pública, tela ou novo fluxo de autosserviço.

| Requisito | Implementação | Evidência e critério de aprovação |
|---|---|---|
| Criar | Validação estrita, normalização de nome/email, HashSenhaArgon2 e create herdado | IPC cria linha real; PHC verifica senha e difere de texto puro; DTO não contém segredo |
| Ler | obterPublico/listarPublico, paginação 1–100, id ASC e busca literal parametrizada por nome/email | Consulta individual, páginas vazia/excedente, filtro e texto semelhante a injeção; nenhum hash selecionado |
| Atualizar | Patch explícito sem senha/hash/campos internos; omitidos preservados | Nome, email e perfil alterados; duplicidade e patch vazio/extra rejeitados |
| Redefinir senha | Canal próprio, mesmo contrato técnico de senha da autenticação e Argon2id | Hash anterior não confere; login IPC rejeita senha anterior e aceita a nova |
| Excluir | Autoexclusão bloqueada; RESTRICT preservado | Usuário sem vínculo é removido, consulta posterior não encontra e sessão perde acesso; vínculo de instrutor retorna CONFLITO |
| Último admin | Leitura do ator, contagem e mutação dentro de IMMEDIATE | Rebaixar/desativar último admin é negado; duas janelas com admins distintos desativando a si próprios deixam exatamente um ativo, independentemente da ordem |
| Origem e sessão | Guarda do Main, geração e referência de sessão antes da operação atômica | Seis canais negam origem/frame/subframe inválidos; logout com sessão substituta, navegação/destruição e perda de privilégio durante hash não gravam |
| Falhas | Resultado público com código/mensagem fixos | Hash com falha injetada e SQLite realmente fechado não vazam SQL/stack e não deixam criação indevida |
| Persistência/composição | Migration de produção, arquivo temporário e Composicao real | Fechar/reabrir mantém dados; nova janela usa auth e CRUD pela ponte efetiva |

`npm run test:usuarios` executa a nova suíte em Electron, SQLite em arquivo temporário e Argon2id reais, com sete grupos. Nenhum banco existente de userData é aberto. A suíte fecha conexões e janelas e remove somente arquivos conhecidos de seu diretório temporário, sem remoção recursiva. Pausas determinísticas e falha de hash são instrumentação de testes; os casos positivos não simulam banco, IPC ou criptografia. Os testes estáticos adicionais estão em tools/Usuarios.test-d.ts.

Passaram nesta implementação: npm run typecheck; npm run build; npm audit (zero vulnerabilidades); test:usuarios; test:auth; test:auth-contratos; test:sessoes; test:auth-banco; test:auth-ipc; test:auth-seguranca; test:contratos; test:infra; test:banco; test:leituras; test:escritas. As regressões da 4.3 continuaram passando com suas asserções de identidade e geração. A primeira execução nova identificou uma fixture de duplicidade que reutilizava email já liberado; outra revelou a suposição incorreta sobre qual janela vence a corrida. Foram corrigidos os testes, mantendo a exigência de exatamente um admin ativo.

Argon2id continua sendo a decisão autorizada da 4.2, substituindo bcrypt mencionado no planejamento inicial; a correção 5.2 acrescenta migration aditiva, sem trocar algoritmo ou dependências. Limites técnicos de senha não equivalem a política completa de força de senha. A redefinição não encerra globalmente sessões já abertas. Identidade/atividade/perfil são relidos; exclusão administrativa revoga as sessões locais da conta após commit, e desativação nega a próxima autorização. A identidade persistente também impede assumir outra conta que reutilize o ID. Não há expiração automática, limitação temporal, garantia completa contra força bruta/inundação IPC, tela de login/admin ou provisionamento inicial. Nenhum admin padrão foi criado. Um admin existente é pré-requisito do CRUD.

Os outros nove CRUDs continuam sob responsabilidade dos respectivos colegas; esta entrega não os implementa nem os declara completos. A implementação está disponível para auditoria independente antes de qualquer consolidação em commit. Nenhuma operação de índice, commit ou push integra esta etapa de desenvolvimento.

## Correção 5.2 — identidade de conta e revogação

O teste novo foi executado antes da correção e falhou por sessão antiga assumir identidade substituta. Depois da correção, passa com reutilização efetiva do maior ID excluído pelo SQLite, sem AUTOINCREMENT. O ID público continua numérico; identidadeConta é exclusivamente interna e persistente na conta, armazenada também na sessão em memória. Não é senha nem token de acesso.

Migracao002IdentidadeConta preenche usuarios.identidade_conta com valores aleatórios de 128 bits e índice único, e acrescenta triggers de geração automática/imutabilidade. A versão 1 publicada não foi alterada. A composição aplica 1 e 2. A camada de CRUD continua sem aceitar esse campo e os DTOs continuam sem expô-lo.

O contrato interno IdentidadeAutenticada e SessaoInterna agora inclui identidadeConta; estabelecer exige o ID e a identidade. AutenticacaoService preserva entrar como projeção pública e acrescenta verificarCredenciais para o coordenador Main. Este último confere identidade antes/depois do hash. SessaoAutenticacaoService estabelece a sessão com a identidade verificada; a autorização final compara o token persistido. Mesmo se excluir/recriar ocorrer entre essas etapas, a sessão antiga não pode representar a conta substituta. Nenhuma assinatura dos canais IPC públicos mudou na 5.2.

Na exclusão, UsuarioService captura a identidade confirmada dentro da transação e só a revoga após COMMIT bem-sucedido. A revogação percorre todas as sessões locais com aquela identidade e gira suas gerações. Não há await entre commit e revogação no event loop do Main. Falha de FK ou do próprio COMMIT preserva todas as sessões; sinais antigos não atingem sessões de outra identidade com o mesmo ID. Uma instância diferente não recebe o sinal local, mas a próxima autorização consulta o identificador persistido e rejeita a conta substituta.

O ator administrativo precisa conservar sessão/generation e identidade persistente. O alvo de alteração é capturado antes de await e conferido novamente sob IMMEDIATE; hash de redefinição antiga não pode ser gravado em conta recriada. Operações já confirmadas antes de uma exclusão não são desfeitas retroativamente.

| Evidência nova | Nível e resultado |
|---|---|
| A/B/F: ID reutilizado, duas sessões, troca admin/recepcao nos dois sentidos | IPC/preload/Electron com SQLite temporário e Argon2id reais; sessões revogadas, seis canais negados e novo login necessário |
| C: consulta com sucesso/falha tardia e sinal antigo de revogação | Serviços reais, pausa controlada, SQLite temporário; referência e geração da sessão substituta preservadas |
| D: FK e COMMIT recusados | SQLite real, inclusive FK adiada; conta e duas sessões mantidas |
| E: login em hash, criação pelo ator excluído e redefinição sobre alvo substituído | Serviços reais e pausas controladas; nenhum login/escrita indevidos e conta substituta inalterada |
| Outra conexão | Exclusão/recriação sem sinal local; identidade persistente rejeita sessão antiga e impede criação pendente pelo ator substituído, mesmo com sessão local inalterada |
| Migration | Banco vazio pelas suítes integradas; upgrade da versão 1, rollback de falha, preservação de dados e identidade após reaplicar/fechar/reabrir; INSERT com identidade fornecida rejeitado |
| A2: propriedade explicitamente undefined | Handler chamado diretamente com `{ nome: undefined }` e com outro campo válido no mesmo patch; propriedade própria conferida, VALIDACAO e registro inalterado, sem JSON.stringify no caminho de entrada |

VerificarIdentidades é chamado por test:usuarios. O teste geral de banco mantém os casos da migration inicial e reaplica as duas versões no banco da composição. As fixtures de autenticação passaram a instalar versão 2; os testes de tipos e objetos internos incluem a nova identidade, preservando os DTOs públicos. As regressões completas da 4.3/4.4 continuam aprovadas, junto de todos os comandos exigidos na 5.2. A auditoria independente posterior continua necessária antes do commit.

Retomada em 14/11/2026: todos os comandos exigidos foram executados novamente e observados com saída zero, incluindo os reforços acima. O relato anterior de teste falhando antes da correção foi encontrado na documentação; esta retomada não desfez a correção para reproduzir aquele estado. A relação exata de arquivos, evidências e ressalvas está em [ETAPA_5_2_REVISAO.md](ETAPA_5_2_REVISAO.md).

## Etapa 5.3 — consistência da identidade do alvo

A auditoria posterior encontrou um intervalo não coberto pelos testes 5.2: UsuarioService aguardava exigirPerfil antes de capturar a identidade do alvo. A proteção do solicitante não protegia esse alvo. Outra conexão podia excluir/recriar o registro durante a suspensão; a captura e a conferência final passavam a usar a identidade nova. Atualização, redefinição de senha e exclusão retornavam sucesso sobre a conta substituta. A conclusão histórica da revisão 5.2 não se aplica a esse cenário.

UsuarioService agora prepara um vínculo interno imutável com ID e identidade persistente antes do primeiro await. A preparação inspeciona descritores e valida o ID sem executar getters. Erros de preparação são retidos até autorizar o solicitante, mantendo a prioridade de NAO_AUTENTICADO/SEM_PERMISSAO para chamadas sem permissão; essa leitura preliminar não autoriza a operação nem publica existência de conta. A validação completa do canal permanece obrigatória antes do hash ou da mutação. O vínculo não é recapturado depois da autorização ou do hash.

Dentro da mesma transação IMMEDIATE, o serviço confere origem, geração e referência da sessão, identidade/atividade/perfil do solicitante e identidade persistente do alvo. Ausência inicial continua sendo ausência, mesmo se uma conta aparecer depois: NAO_ENCONTRADO. Remoção sem substituição também retorna NAO_ENCONTRADO. Identidade diferente retorna CONFLITO, sem modificar dados ou revogar sessões. A verificação e a mutação são síncronas sob a mesma reserva de escrita. Atualização/redefinição/exclusão usam esse único caminho; obter também usa o vínculo inicial. Criar e listar não têm alvo individual. Nenhum contrato IPC, DTO, hash ou migration foi alterado na 5.3.

VerificarAlvosUsuarios, chamado por test:usuarios, inicia o handler real e imediatamente usa uma segunda conexão SQLite para substituir o alvo antes de retomar as microtasks. Autorizador, ConsultaAutenticacaoRepository e Argon2id são os de produção: não há adaptador de autorização lento, sleep ou dependência de temporização. Para cada um dos três canais, cobre troca de perfil nos dois sentidos, reutilização real do ID com identidade diferente, duas sessões da substituta preservadas por referência/geração, remoção antes/durante a chamada, conta que aparece após ausência inicial, operação normal e falha real no COMMIT por FK adiada. Os contextos das sessões novas são preparados diretamente pelo Main com a identidade real; login completo e corridas durante hash continuam cobertos pelas suítes anteriores. Último admin, autoexclusão e integridade também são conferidos.

O novo teste foi executado antes da correção de produção e falhou em usuarios:atualizar com sucesso indevido sobre o alvo substituto. Após a correção, os três canais passam individualmente. A suíte mantém os testes A1/A2 anteriores. Essa evidência não equivale a uma nova auditoria independente da implementação 5.3.

O vínculo começa na leitura síncrona do alvo ao receber a chamada no Main. Ele não identifica qual registro uma tela antiga exibiu antes de enviar a chamada, pois o contrato público continua recebendo ID numérico. Operações já confirmadas não são desfeitas retroativamente; os limites anteriores de sessões e conexões permanecem. A leitura preliminar do alvo pode ocorrer antes da confirmação do perfil, mas nenhum dado dela é devolvido a solicitante não autorizado.

Validação final da 5.3: typecheck, build, test:usuarios (incluindo VerificarIdentidades/A1, A2 e VerificarAlvosUsuarios), test:auth, test:auth-banco, test:sessoes, test:auth-ipc, test:auth-seguranca, test:banco, test:leituras, test:escritas, test:infra, test:contratos e test:auth-contratos terminaram com código zero. npm audit retornou zero vulnerabilidades e git diff --check não apontou erros. A preparação do novo teste inicialmente exigiu tipagem explícita para corrigir TS7022; depois disso foi observada a falha de comportamento no código 5.2. Uma execução Electron posterior foi impedida por ACL do sandbox de execução antes das asserções e repetida com autorização fora desse sandbox, mantendo o sandbox do Electron e sem alterar ACLs. Não houve staging, commit, push, alteração das migrations ou acesso ao banco real de userData.

## Encerramento — estado atual da frente do Miguel

Esta seção substitui limitações históricas de interface, provisionamento, duração de sessão e ausência de revogação por senha. Não existe uma entrega histórica 5.4 comprovada; o trabalho foi organizado em correções de encerramento, documentadas em ENCERRAMENTO.md.

### Credenciais e sessões

Migracao003VersaoCredencial adiciona versao_credencial, iniciada em 1, com avanço por trigger a cada mudança real de senha_hash. Não altera a identidade imutável nem as migrations 001/002. ConsultaAutenticacaoRepository retorna essa versão somente à porta interna do Main. AutenticacaoService compara a versão capturada com a leitura pós-hash; SessaoManager armazena identidade e versão; Autorizador compara ambas. UsuarioService revalida também a versão do solicitante sob IMMEDIATE antes de gravar. Assim, um login ou uma criação pendente com credencial revogada não conserva acesso.

Após commit da redefinição, revogarCredencial seleciona identidade exata e versões até a anterior: sinais antigos não encerram sessões com senha mais nova ou outra conta de mesmo ID. A versão persistente protege também contra alteração por outra conexão, sem broadcast; a leitura de autorização é o ponto de observação. Rollback preserva hash, versão e sessões. Os testes de A1/A2/A3 continuam obrigatórios.

PoliticaSessao aplica 30 minutos de inatividade e oito horas de duração absoluta por padrão, rechecados também após suspensão assíncrona. Uso não prolonga a duração máxima. LimitadorLogin aplica 30 tentativas/minuto por janela, 120 por processo e quatro simultâneas, compartilhado com provisionamento na composição. HashSenhaArgon2 tem teto global de quatro operações nativas, incluindo operações administrativas, sem fila ilimitada. Saturação é SEM_PERMISSAO sanitizado. Não há bloqueio por email informado por terceiros. Configuração inválida é rejeitada no início tratado por Aplicacao, antes de abrir/migrar o banco.

Novas senhas, criação, provisionamento e redefinição, exigem 15 caracteres Unicode, mantendo o limite de 1024 bytes, ausência de trim/truncamento e validação de surrogates. A contagem é por pontos de código. Login e verificação de hashes antigos preservam o contrato técnico anterior para não inutilizar contas existentes. O comprimento é uma escolha técnica apoiada na referência de fator único do [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver), não declaração de conformidade integral ou garantia de força de toda senha.

### Provisionamento e interface

InicializacaoHandler publica somente inicializacao:estado e inicializacao:criar-admin. Origem, frame e geração são guardados antes e depois do hash. ProvisionamentoService valida nome/email/senha, força admin ativo e revalida banco completamente vazio sob IMMEDIATE; duas conexões não criam dois primeiros usuários. Qualquer usuário existente encerra o fluxo, mesmo sem admin ativo. Não é uma recuperação pública de conta, não há senha padrão e não há login automático após provisionamento.

LoginTela e UsuariosTela usam apenas a ponte. O Main autoriza todas as operações independentemente da interface. Recepção/instrutor não recebem painel administrativo. Dados externos usam textContent/value, nunca HTML interpolado; nomes com marcação são exibidos como texto. Senhas são removidas dos formulários após uso. Logout e NAO_AUTENTICADO removem o painel; autorredefinição volta ao login. A consulta de sessão não é feita por polling que prolongaria artificialmente a inatividade. A interface não implementa os módulos dos colegas.

### Evidências novas

- test:inicializacao: formulário/canais estritos, origem, rollback, duas conexões concorrentes, admin único, persistência e cancelamento de documento/geração durante hash.
- test:politicas: relógio controlado sem sleeps, prazo absoluto/inatividade, limites e recuperação, teto global de hashes, upgrade/rollback da 003, duas sessões revogadas, login antigo pendente, escrita por ator revogado, alteração por conexão externa, sinal antigo e falha real de commit.
- test:interface: formulários reais → preload → IPC → services → arquivo SQLite; CRUD, busca, XSS como texto, senha nova, perfil negado no Main, último admin, logout, autorredefinição, reabertura e integridade.

Execuções e classificações finais ficam em ENCERRAMENTO.md. Não se atribui nova aprovação a um teste que só tenha resultado histórico. A medição local de três ciclos Argon2id/hash+verificação é registrada na saída de test:politicas; não substitui avaliação na máquina de entrega.
# Complemento do encerramento: identidade exibida

A UI oficial envia a referência opaca recebida nos DTOs administrativos nos três canais de mutação do alvo. O Main valida o HMAC antes da suspensão e mantém a captura/revalidação transacional da Etapa 5.3. Assim, uma substituição anterior ao envio de um formulário também é recusada. Clientes legados que omitem `referencia` conservam apenas o vínculo à identidade existente na entrada no Main. `test:interface` substitui contas por outra conexão, comprova ID reutilizado e verifica linha completa e duas sessões novas nos três formulários.
