# Infraestrutura — etapa 1

Atualização: a etapa 2 de SQLite e migrations foi adicionada e está descrita em [BANCO.md](BANCO.md). As seções abaixo registram o escopo e as verificações originais da etapa 1; autenticação, autorização e CRUDs continuam pendentes.

Esta entrega configura somente Electron, TypeScript e os contratos de comunicação de Miguel. Banco, migrations, autenticação, autorização e CRUDs ainda não estão implementados. `AutenticacaoService` e `Autorizador` mantêm os nomes previstos na arquitetura.

## Ambiente e execução

Recomendado: Node 24 LTS, registrado em `.nvmrc` e `package.json`. O Node 25.7.0 encontrado na máquina está fora da faixa recomendada; a instalação global não foi alterada. O npm pode emitir `EBADENGINE` nesse ambiente. A compilação no Node 25 não substitui validação futura no Node 24.

```sh
npm install
npm run setup:electron
npm run typecheck
npm run build
npm start
```

`setup:electron` baixa o binário oficial. É explícito para não depender da execução automática de scripts de instalação pelo gerenciador de pacotes. `npm run dev` compila e abre o aplicativo; não há recarga automática. `npm run test:infra` compila e executa a verificação com janela oculta e encerramento automático.

Dependências de desenvolvimento: Electron (runtime desktop e tipos de sua API), TypeScript (compilador) e `@types/node` (tipos usados pelo Main e ferramentas). O lockfile registra versões resolvidas. Não há framework de interface, bundler ou dependências de banco, autenticação e APIs nesta etapa. JavaScript em `dist/` é resultado de compilação, ignorado pelo Git; toda lógica fonte é TypeScript.

O Electron tem runtime Node próprio. Módulos nativos precisam ser compatíveis com seu ABI; `better-sqlite3` e bcrypt serão instalados e testados somente nas próximas etapas. Esta entrega não afirma compatibilidade binária desses módulos.

Referências oficiais consultadas:

- [Releases do Node](https://nodejs.org/en/about/previous-releases).
- [Pré-requisitos do Electron](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites).
- [Módulos nativos no Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).
- [Limites do preload com sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).

## Arquivos e responsabilidades

| Arquivo | Função |
|---|---|
| `package.json`, `package-lock.json`, `.nvmrc` | Scripts, dependências reproduzíveis e versão recomendada do Node |
| `tsconfig.json` | Compilação estrita do Main, Preload, contratos e ferramentas para CommonJS |
| `tsconfig.renderer.json` | Compilação do renderer para navegador, sem tipos globais do Node |
| `src/main/Aplicacao.ts` | Ciclo de vida, inicialização e erros de abertura sanitizados |
| `src/main/JanelaPrincipal.ts` | Janela, preload, sandbox, permissões e restrição de navegação |
| `src/preload/PonteAcademia.ts` | Exposição controlada de capacidades pelo contextBridge |
| `src/shared/ipc/ContratoIpc.ts` | Tipos de entrada, resultado e DTOs dos canais de autenticação e usuários |
| `src/renderer/ambiente.d.ts` | Tipo da ponte na janela, sem expor Electron |
| `src/renderer/AplicacaoRenderer.ts`, `index.html` | Página inicial neutra e política CSP |
| `tools/CopiarAssets.ts` | Cópia do HTML para o build, sem dependência adicional |
| `tools/VerificarInfraestrutura.ts` | Verificação real de carregamento, ponte, isolamento e sandbox |

## Segurança e limites

Janela com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, segurança web habilitada e webviews desabilitadas. Popups e permissões são negados; navegação da página só admite a URL local esperada. CSP permite apenas scripts locais e bloqueia conexões de rede, formulários e recursos externos. Não há dados pessoais ou credenciais nessa tela.

A ponte `window.academia` atualmente não publica operações. Os contratos futuros de `auth:*` e `usuarios:*` estão tipados conforme a arquitetura, mas não existem handlers nem métodos simulados. As capacidades opcionais serão habilitadas junto de implementações reais e validação runtime no Main. Tipagem TypeScript não substitui zod e autorização. Não existe canal genérico, SQL, acesso ao filesystem, `ipcRenderer` ou token exposto à página.

O preload só importa `electron` em runtime; os imports dos contratos são apagados na compilação. Isso permite manter o sandbox sem bundler. A declaração global da ponte é validada junto aos contratos; o renderer atual não necessita de IPC. Demais domínios e decisões comerciais permanecem com seus responsáveis.

Não há variáveis de ambiente necessárias nesta etapa; portanto não foi criado `.env.example` vazio. A documentação completa `SEGURANCA.md` acompanhará a implementação dos controles de banco e autenticação, sem apresentar controles futuros como já existentes.

## Verificações executadas

No Windows com Node 25.7.0 e npm 11.10.1: `npm run typecheck`, `npm run build` e `npm run test:infra` passaram. O teste Electron abre uma janela oculta, confirma execução do renderer, presença da ponte sem capacidades e ausência de `require` e `process` no mundo da página. O preload só publica a ponte se seu próprio contexto confirmar isolamento e sandbox. O teste encerra a janela e o processo automaticamente, inclusive em falhas ou timeout.

Versões instaladas: Electron 45.3.2, TypeScript 7.0.2 e `@types/node` 24.19.2. A instalação reportou zero vulnerabilidades e avisou sobre a versão do Node fora da faixa recomendada. Ainda falta repetir essas verificações em Node 24 LTS e validar os módulos nativos na etapa do banco. Bloqueios de popup, navegação e permissões estão configurados, mas não foram exercitados individualmente pelo teste automatizado desta etapa.
