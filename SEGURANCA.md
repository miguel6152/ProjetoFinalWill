# Segurança — estado após a infraestrutura de banco

Este documento distingue controles implementados de controles planejados. A aplicação ainda não possui login, autorização, CRUDs ou cadastro de dados pela interface. Não utilizar esta etapa isolada como sistema pronto para dados reais.

## Controles implementados

- Main é proprietário da conexão SQLite; renderer não importa banco, filesystem ou APIs Node. O preload publica somente capacidades implementadas, atualmente nenhuma operação de negócio.
- Electron utiliza isolamento de contexto, sandbox, Node desabilitado no renderer, CSP restritiva, permissões negadas, bloqueio de popups e navegação controlada.
- FKs são habilitadas e verificadas em toda conexão. Exclusões de registros referenciados são bloqueadas sem cascata, evitando perda indireta de histórico.
- Constraints de tipos, nulabilidade, unicidade e valores estruturais reduzem inconsistências. Dados variáveis usam parâmetros; DDL é interno e não aceita entrada do renderer.
- Migrations são transacionais por versão e não removem o banco diante de erro. Erros exibidos na inicialização não incluem SQL, dados ou detalhes internos.
- Migrations exigem retorno `undefined` e recebem somente uma API SQL limitada, revogada em `finally` antes do registro da versão e da conclusão da transação. Retornos assíncronos são rejeitados e SQL tardio por essa API é bloqueado. Isso não cancela JavaScript agendado nem isola código que obtenha outra conexão ou produza efeitos externos. Detalhes e testes em `docs/BANCO.md`.
- Banco persistente fica em `userData`, fora do repositório; arquivos SQLite, `.env` e dependências estão ignorados pelo Git. Não há segredos embutidos ou variáveis de ambiente necessárias nestas duas etapas.
- Testes usam apenas bancos em memória ou arquivos temporários e dados sintéticos. O campo de hash em fixtures contém um marcador não utilizável para autenticação, nunca uma senha em texto puro.

## Decisões monetárias aprovadas e histórico financeiro

Valores monetários são armazenados em centavos como `INTEGER`. Está aprovado que `planos.valor_centavos`, `matriculas.valor_contratado_centavos` e `pagamentos.valor_centavos` devem ser maiores ou iguais a zero: valores negativos são proibidos nessas três colunas e zero é permitido, inclusive para planos gratuitos. As constraints existentes já aplicam essa restrição; nenhum SQL foi alterado por este registro documental.

Créditos, descontos, estornos e reembolsos não devem ser representados simplesmente por valores negativos nessas colunas. Caso sejam implementados, deverão possuir operações e registros próprios, preservando o histórico financeiro. Essa diretriz está aprovada, mas tais funcionalidades e seus mecanismos de histórico/auditoria não estão implementados nem têm inclusão no escopo automaticamente aprovada.

Continuam pendentes, para discussão com o grupo, especialmente Davi e Vitor: preço trimestral/anual como total do período ou valor mensal; tratamento de descontos e isenções individuais; funcionamento de créditos, pagamentos parciais e reembolsos, incluindo o detalhamento de eventuais estornos; e calendário de cobrança/parcelamento. A permissão de zero não estabelece o fluxo de isenção, cobrança zerada ou quitação. Essas pendências permanecem separadas das regras aprovadas em [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/BANCO.md](docs/BANCO.md).

## Dados pessoais e de saúde

CPF, contato, endereço e avaliações exigem minimização e acesso por necessidade. O schema prevê esses dados, mas as telas e services que irão coletá-los ainda não existem. A aplicação não oferece nesta etapa mascaramento, gestão de direitos do titular, auditoria de acesso ou política de retenção. Tais controles devem ser implementados nos respectivos módulos antes de uso com dados reais.

SQLite com better-sqlite3 não cifra o arquivo automaticamente. Restringir acesso à conta/pasta do sistema operacional e proteger backups é necessário; nenhum controle de perfil da aplicação substitui proteção do arquivo local. Chaves estrangeiras protegem consistência, não confidencialidade.

## Próximas etapas

Implementar bcrypt para senhas, sessão no Main, limitação de tentativas, zod para entradas, checagem de perfil e remetente em cada handler, revogação de sessão, proteção do último admin e DTOs sem hashes. Perfis e canais devem seguir a arquitetura aprovada. Avaliações serão restritas a admin/instrutor e CPF será mascarado nas listagens quando esses módulos forem entregues.

A equipe ainda definirá prazo de sessão, retenção/correção de históricos e provedor de comunicação. Nenhuma dessas decisões foi convertida em regra automática nesta entrega. Tokens de integrações futuras pertencerão ao `.env` no Main e terão apenas exemplos fictícios em `.env.example`.
