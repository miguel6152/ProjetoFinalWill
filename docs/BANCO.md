# SQLite e migrations — etapa 2

**Atualização de encerramento:** a composição aplica versões 1, 2 e 3. A migration 003 adiciona `usuarios.versao_credencial`, inicializada em 1 para as contas existentes, e triggers que avançam a versão a cada mudança real de `senha_hash` e impedem retrocesso/reutilização da versão. Essa versão não é a identidade da conta e não é exposta nos DTOs. Sessões e logins pendentes com versão antiga são rejeitados mesmo após mudança de senha por outra conexão. Falha de DDL/registro de versão reverte toda a 003, preservando dados e histórico anteriores; falha no commit da redefinição reverte também hash e versão. As migrations 001 e 002 permanecem intactas. `test:politicas` cobre upgrade, falha no registro, reaplicação, alteração por outra conexão e rollback de commit. As referências abaixo a duas versões ou schema inicial são históricas.

Atualização 5.2: o texto da etapa 2 abaixo preserva o schema inicial. A aplicação agora aplica também Migracao002IdentidadeConta, que adiciona somente a coluna técnica usuarios.identidade_conta, índice único e triggers de geração/imutabilidade. O diagrama inicial descreve colunas de domínio; a identidade técnica adicional não é DTO ou nova entidade. A migration 1 publicada permanece intacta.

O identificador é hexadecimal aleatório de 128 bits por conta, preenchido também para contas existentes. É independente do ID numérico reutilizável. O DDL e o registro de versão são atômicos pelo Migrador; falha de upgrade reverte coluna/efeitos e mantém a versão 1 e seus dados. As inserções geram identidade no banco e alterações posteriores são recusadas. Não há AUTOINCREMENT ou reescrita de hashes, IDs e vínculos. FKs e dez entidades permanecem as mesmas.

VerificarIdentidades, chamado por test:usuarios, valida instalação/upgrade, identidade distinta após reutilização de ID, imutabilidade, rollback de migration, persistência após reabertura e foreign_key_check/integrity_check. VerificarBanco mantém os testes do schema original e usa as duas versões ao reabrir o banco criado pela composição. Testes usam somente memória/arquivos temporários; o banco existente de userData não foi aberto para esta correção. O ciclo de sessão/revogação está em AUTENTICACAO.md e SEGURANCA.md.

Implementação da infraestrutura de banco de Miguel, conforme `ARQUITETURA.md`. Esta etapa não implementa repositories, services de negócio, autenticação ou novos canais IPC.

A Etapa 3 acrescentou a infraestrutura compartilhada BaseRepository sobre esta conexão, sem modificar schema ou migrations. Suas cinco operações, validações, erros, integração e limites estão em [BASE_REPOSITORY.md](BASE_REPOSITORY.md). A entrega do banco descrita abaixo permanece a referência da Etapa 2; não existem repositories de entidades ou services de negócio nesta entrega.

## Compatibilidade confirmada

`better-sqlite3` 13.1.1 foi carregado no **processo Main do Electron 45.3.2**, no Windows x64, com Node embarcado 24.22.2, ABI de módulos 150 e Node-API 10. O teste abriu banco em memória, executou SQL parametrizado, aplicou migrations e fechou a conexão. Não foi necessário recompilar nem instalar `@electron/rebuild`.

A versão 13 do driver usa Node-API, e o binário fornecido funcionou neste ambiente. Isso não garante compatibilidade automática em outros sistemas ou arquiteturas. O Node global continua em 25.7.0; a recomendação de desenvolvimento permanece Node 24 LTS. A execução dos testes do banco usa o Node embarcado no Electron, e não o global.

- [Mudança para Node-API no better-sqlite3](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0).
- [Compilação com Node-API 10](https://github.com/WiseLibs/better-sqlite3/blob/v13.1.1/binding.gyp).
- [Orientação do Electron sobre módulos nativos](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).

Dependências adicionadas: `better-sqlite3` para execução e `@types/better-sqlite3` apenas para tipagem de desenvolvimento. O lockfile fixa as versões resolvidas. Nenhum ORM, framework de migrations ou ferramenta de recompilação foi necessário.

## Arquivos e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `src/database/Conexao.ts` | Uma conexão SQLite, FKs habilitadas e conferidas, statements parametrizados, transações síncronas e fechamento idempotente |
| `src/database/Migracao.ts` | Contrato de versão, nome e aplicação de uma migration |
| `src/database/EscopoMigracao.ts` | API limitada e revogável entregue à migration, sem conexão ou statements |
| `src/database/Migrador.ts` | Ordem, validação de histórico e execução atômica de cada versão |
| `src/database/migrations/Migracao001EstruturaInicial.ts` | DDL das dez tabelas de domínio e seus índices |
| `src/main/Composicao.ts` | Preparação do diretório, conexão e migrations; liberação dos recursos se houver falha |
| `src/main/Aplicacao.ts` | Inicialização do banco antes da janela e fechamento no encerramento |
| `tools/VerificarBanco.ts` | Testes no Main do Electron, só em memória ou diretório temporário |
| `tools/VerificarMigrationsSincronas.ts` | Rejeição de retornos assíncronos, rollback e bloqueio de SQL tardio |
| `tools/ContratoMigracao.test-d.ts` | Testes de tipos: rejeição de void, Promise, PromiseLike e retorno misto |
| `package.json`, `package-lock.json` | Dependências e comando `test:banco` |
| `SEGURANCA.md` | Controles existentes e limites atuais de proteção |

## Local e ciclo de vida

Na execução normal, o caminho é `app.getPath('userData')/academia.sqlite3`. O banco não fica no repositório. A pasta é criada antes da conexão; migrations terminam antes de abrir a interface. A janela continua sem acesso ao SQLite. Ao encerrar a aplicação, a conexão é fechada. Falha de inicialização fecha os recursos e apresenta uma mensagem sem SQL, caminhos internos ou dados.

Os testes não executam o ponto de entrada normal `Aplicacao.ts` nem usam o diretório `userData` para dados de domínio. Injetam `:memory:` ou um arquivo dentro de pasta criada por `mkdtemp` no diretório temporário do sistema. Todas as conexões são fechadas antes da remoção da pasta; seu caminho pai é conferido antes da remoção recursiva. Nenhum seed ou administrador é criado no banco real.

## Schema e separação das regras

As dez tabelas mantêm exatamente as colunas e tipos do diagrama. São tabelas `STRICT`, para que valores incompatíveis com os tipos declarados sejam rejeitados. PKs são `INTEGER PRIMARY KEY`; booleanos são 0/1; valores monetários são inteiros em centavos. Sem arredondamento implícito de valores fracionários.

**Decisões monetárias aprovadas:** `planos.valor_centavos`, `matriculas.valor_contratado_centavos` e `pagamentos.valor_centavos` são `INTEGER` em centavos e devem ser maiores ou iguais a zero. Valores negativos não são permitidos nessas três colunas. Zero é permitido, inclusive para planos gratuitos. As constraints de não negatividade já presentes na migration correspondem agora a decisões expressamente aprovadas; este registro documental não altera SQL, tabelas ou constraints.

Créditos, descontos, estornos e reembolsos não devem ser representados simplesmente por valores negativos nessas colunas. Se implementados, deverão possuir operações e registros próprios que preservem o histórico financeiro. Essa diretriz não cria tais operações nem aprova sua inclusão no escopo. O schema atual não possui registros específicos para elas; permitir zero também não implementa isenção individual ou um fluxo de cobrança/quitação zerada.

**Questões financeiras pendentes:** se o preço trimestral/anual é total ou mensal; tratamento de descontos e isenções individuais; funcionamento de créditos, pagamentos parciais e reembolsos, com detalhamento de eventuais estornos; e calendário de cobrança/parcelamento. Devem ser discutidas com o grupo, especialmente Davi e Vitor. A unicidade atual de `(matricula_id, competencia)` não define uma política de parcelamento, e a não negatividade não resolve nenhuma dessas pendências. O registro de referência está na seção 2 de [ARQUITETURA.md](ARQUITETURA.md).

Constraints estruturais: nulabilidade especificada, e-mail de usuário normalizado e único, CPF com onze dígitos e único, chat opcional único, duração do plano 1/3/12, enums definidos, competência `YYYY-MM`, unicidade matrícula/competência e aula/aluno, medidas positivas e coerência dos intervalos de matrícula e aula. Datas civis são verificadas quanto a formato e calendário, inclusive dias inexistentes. Aula usa comparação de instantes pelo SQLite, não comparação lexicográfica de fusos diferentes.

Pagamento `pago` exige data de quitação e forma permitida. Essa constraint não define parcelamento, calendário de cobrança, multa ou política de correção. O canal da notificação é obrigatório, porém não limitado a Telegram: a escolha do provedor está pendente na arquitetura. A implementação mantém `vencimento_plano` como tipo inicial previsto, sem implementar envio ou deduplicação comercial.

Coordenadas nulas são aceitas em aulas internas; quando fornecidas, devem estar nos intervalos válidos. Aulas externas exigem ambas as coordenadas, conforme a regra explícita da seção de integridade da arquitetura. Capacidade positiva não significa controle de vagas ocupadas: essa regra pertence ao service de inscrições.

Todas as dez FKs usam `ON DELETE RESTRICT`; cada uma possui índice com a coluna da FK na primeira posição. Alguns índices são os próprios índices de unicidade, evitando duplicação. Há índices adicionais para vencimento de pagamentos, fim de matrículas, início das aulas e avaliações por aluno/data.

Não há triggers de negócio. Validação dos dígitos verificadores de CPF, schemas zod, formato canônico de todos os timestamps UTC, cálculo do vencimento contratado, perfil ativo do instrutor, proteção do último admin, autorização, vagas, sobreposição de matrículas, limites plausíveis de medidas, retenção e políticas comerciais continuam nos módulos e etapas correspondentes. A existência das tabelas não significa que esses controles de aplicação estejam implementados.

## Transações e histórico

`Conexao.transacao` usa `Database.transaction(...).immediate()`: retorno normal confirma; exceção desfaz e é propagada. Chamadas aninhadas usam savepoints. A API exige callbacks síncronos e rejeita retorno de objeto semelhante a Promise; não usar rede, `await` ou efeitos externos na transação. Erros não devem ser engolidos dentro do callback quando o objetivo é desfazer toda a operação.

Para a listagem paginada, Conexao.transacaoLeitura usa DEFERRED e mantém contagem e itens no snapshot da primeira leitura. Não reserva escrita antecipadamente; pode manter bloqueios de leitura conforme o modo de journal. Em uma transação externa, usa savepoint e herda seu snapshot e bloqueios. As escritas do BaseRepository continuam usando transacao/IMMEDIATE; create/update incluem a releitura no escopo atômico. A API interna de leitura não impõe modo read-only e a rejeição de retorno assíncrono não cancela tarefas já agendadas. Os callbacks do repository são estritamente síncronos e internos. Isso não altera a proteção específica e revogável das migrations descrita abaixo.

O contrato `Migracao.aplicar(contexto)` retorna **`undefined`**, não `void`: o TypeScript rejeita implementações cujo retorno seja Promise, PromiseLike ou uma união assíncrona. Uma função que termina normalmente precisa concluir seu SQL antes de retornar. Isso não impede, por análise estática, que uma função esconda timers ou outras tarefas e retorne `undefined`.

Por isso, o migrador não entrega a `Conexao` à migration. Entrega um objeto congelado `ContextoMigracao` com apenas `executarEstrutura`, sem statements, callbacks de consulta, conexão ou driver. `EscopoMigracao` mantém a capacidade de execução em campo privado de JavaScript e a revoga em `finally`, assim que `aplicar` retorna ou lança. A revogação acontece antes da inspeção do retorno, do registro da versão e do commit/rollback; também protege referências guardadas à função de execução.

O migrador confere o retorno real como `unknown` e rejeita qualquer valor diferente de `undefined`, incluindo Promise e PromiseLike. Não lê nem chama `then` de objetos arbitrários, evitando ativar thenables ou getters. Quando recebe uma Promise nativa, registra somente um tratador de rejeição usando o método nativo para impedir uma rejeição global não tratada; não aguarda nem considera esse tratamento um cancelamento.

**Limite da garantia:** JavaScript assíncrono já agendado pode continuar executando, mas não pode executar SQL pelo contexto revogado, após sucesso ou falha. Migrations continuam sendo código interno confiável: não devem importar outra conexão, acessar filesystem/rede, controlar transações por SQL nem produzir efeitos externos. Esta proteção não é um sandbox de código arbitrário e não cancela esses efeitos. A segurança é a revogação do acesso concedido pelo migrador, não o cancelamento de Promises. `Conexao.ts` e sua API geral não foram alterados por esta correção.

`executarEstrutura` recebe apenas DDL interno fixo. Valores variáveis usam `preparar(...).run/get/all` com parâmetros. Nem conexão nem SQL são expostos pelo preload. Nomes de tabelas e colunas nas migrations são constantes internas.

A tabela técnica `migrations` guarda `versao`, `nome`, `aplicada_em` e é adicional às dez entidades. O migrador verifica sequência contínua iniciando em 1, ausência de duplicidades e correspondência entre histórico e versões conhecidas. Dentro da transação de cada migration, confere o histórico novamente e aplica apenas o que falta. O DDL e o registro da versão são confirmados juntos. Se a segunda versão falhar, a primeira já concluída permanece aplicada.

Reaplicação preserva dados e o instante original de aplicação. Histórico desconhecido, com lacuna ou nome divergente é rejeitado; não existe downgrade automático. Migrations publicadas não devem ser editadas: novas mudanças exigem nova classe e versão. O migrador compara versão/nome, sem checksum do código, portanto não detecta alteração de conteúdo mantendo ambos iguais. Não recria tabelas existentes para esconder divergências e não apaga banco em caso de erro.

## Como verificar

```sh
npm run typecheck
npm run test:banco
npm run test:infra
```

`test:banco` executa o build antes de iniciar o teste; não exige outra dependência de testes. Usa `node:assert/strict` em uma classe TypeScript. O teste termina automaticamente com código 0 ou 1.

### Resultados reais

No Windows x64 com Electron 45.3.2, a suíte original passou em oito grupos. Após a correção de migrations assíncronas, a suíte passou em nove grupos:

1. Carregamento nativo no Main, consulta parametrizada e FKs habilitadas.
2. Dez tabelas, comparação de colunas/tipos com o Mermaid da arquitetura, nulabilidade, PKs, unicidade e índices.
3. Dez relacionamentos reais: atualização com FK inexistente e exclusão de pai referenciado rejeitadas em cada um; índice de cada FK conferido.
4. Constraints, duplicidades, campos opcionais, coordenadas condicionais e tratamento de texto com aparência de SQL como dado.
5. Commit, rollback de múltiplas operações e rollback de savepoint aninhado.
6. Rollback da primeira migration, falha de DDL em versão posterior, falha no registro do histórico, reaplicação, evolução e histórico incompatível.
7. Proteção síncrona: migration válida, função async, Promise nativa rejeitada, PromiseLike, getter `then`, thenable em função, retorno inválido e exceção síncrona. Cada cenário agenda uma microtask e um timer que tentam SQL após a saída da transação: ambas as tentativas são bloqueadas. Verificam-se rollback do SQL anterior, ausência da versão rejeitada, preservação da versão anterior e ausência de efeitos tardios; no caso válido, commit e versão permanecem corretos. Nenhum thenable/getter arbitrário é ativado e não há rejeição global não tratada.
8. Persistência em arquivo temporário, reabertura, reaplicação sem perda de dados e ciclo de vida da composição.
9. `PRAGMA foreign_key_check` sem violações e `PRAGMA integrity_check` retornando `ok`.

Os testes de tipo estão incluídos no typecheck e build (sem `skipLibCheck`) e exigem que Promise/PromiseLike/void/retorno misto sejam incompatíveis com `Migracao.aplicar`. Os testes de runtime contornam o tipo deliberadamente em um único ponto para simular JavaScript ou uso incorreto de coerção e exercitar a defesa de execução. As dez tabelas, constraints comerciais e seus valores permitidos não foram modificados pela correção.

`npm run typecheck` passou; o build executado por ambas as suítes passou; `npm run test:infra` também passou, confirmando carregamento da janela/renderer/preload, isolamento, sandbox e ponte sem acesso genérico. A instalação reportou zero vulnerabilidades. `git diff --check` não apontou erros de whitespace (apenas aviso de normalização LF/CRLF no README). Estes testes não verificam regras futuras dos services nem concorrência entre processos distintos.
