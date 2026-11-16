# Revisão da retomada da Etapa 5.2 — 14/11/2026

**Atualização posterior — etapa 5.3:** a auditoria independente invalidou a conclusão abaixo quanto à consistência do alvo. A captura ocorria depois do await de autorização, permitindo que atualização, redefinição ou exclusão atingissem a conta substituta. Este documento é o registro histórico da revisão 5.2, não prova de correção desse cenário. A correção 5.3 captura o vínculo antes da primeira suspensão e o revalida na transação; diagnóstico e regressões estão na seção 5.3 de [AUTENTICACAO.md](AUTENTICACAO.md#etapa-53--consistência-da-identidade-do-alvo).

Classificação técnica: **aprovada com ressalvas**, restrita à correção A1/A2 e à frente de Miguel. Não equivale à aprovação independente da Etapa 5, à revisão humana do PR ou à prontidão do sistema inteiro.

## Estado encontrado e trabalho da retomada

Antes de editar, foram examinados o estado do Git, AGENTS.md, a arquitetura, os diffs e os arquivos novos de produção/testes. A branch já era `feat/miguel-infraestrutura`, HEAD `391896085a10c9cec859e344329bfea8f83d37c1`, com 26 arquivos rastreados modificados e 10 não rastreados (nove da implementação e um arquivo estranho). O índice estava sem alterações.

Já existiam o CRUD administrativo da etapa 5, os seis canais, schemas estritos, proteção do último admin, Argon2id, migration 002, vínculo de identidade nas sessões, comparação no login/autorizador, revogação local após transação e conferência do ator/alvo sob IMMEDIATE. VerificarIdentidades já era chamado por test:usuarios e já continha os cenários principais do A1. A documentação também já descrevia a maior parte da correção. Não se atribuem essas implementações à retomada.

Não foi encontrada falha de produção adicional que justificasse substituir esses mecanismos. A retomada modificou somente `tools/VerificarUsuarios.ts`, `tools/VerificarIdentidades.ts`, `SEGURANCA.md`, `docs/AUTENTICACAO.md` e `docs/ARQUITETURA.md`, e criou este relatório. Nenhum arquivo foi removido. Nenhuma dependência foi adicionada.

Correções e reforços:

- A2: retirado o caso enganoso do caminho de entrada com JSON.stringify. Chamada direta do handler testa `{ nome: undefined }`; outro caso mantém `nome` como propriedade própria e acrescenta email válido, impedindo confusão com patch vazio. Ambos retornam VALIDACAO e o registro completo permanece igual.
- A1: acrescentada criação administrativa pendente enquanto outra conexão exclui e recria o ator com mesmo ID e perfil admin. A sessão local permanece a mesma, mas a guarda persistente nega SEM_PERMISSAO e nenhuma linha indevida é criada.
- Migration: acrescentadas asserções de reaplicação sem regenerar identidade e recusa de INSERT que fornece identidade interna.
- Documentação: corrigida a afirmação de que os componentes de autenticação permaneciam inalterados; arquitetura agora explicita identidade persistente, limites entre conexões, Argon2id e ausência de provisionamento/limitação temporal. Mantido o histórico anterior, distinguindo-o da evidência observada nesta execução.

## Revisão técnica de A1

Migration 002 adiciona coluna sem reconstruir tabelas ou alterar a migration publicada. O backfill usa randomblob(16), índice UNIQUE protege as identidades existentes e triggers geram o valor em novos INSERTs e impedem fornecimento/alteração da identidade. A ausência temporária do valor final durante o AFTER INSERT não é observável por outra conexão antes do commit. Falhas revertem estrutura, dados e registro da versão. A idempotência pertence ao Migrador: versões registradas são ignoradas; chamar aplicar diretamente duas vezes não é o contrato suportado.

AutenticacaoService compara a identidade anterior ao hash com a releitura posterior. O coordenador estabelece sessão com essa identidade, e a autorização final a compara com a persistida. Autorizador protege a referência da sessão ao receber respostas tardias. UsuarioService verifica novamente origem, geração, instância da sessão, identidade/atividade/perfil do ator e identidade do alvo em transação IMMEDIATE, depois de aguardar hash quando necessário. Exclusão bem-sucedida revoga todas as sessões locais daquela identidade após retorno da transação de produção; revogações antigas não selecionam a conta substituta pelo ID numérico.

As operações administrativas de produção iniciam sua própria transação no serviço; não existe caminho IPC que as execute dentro de uma transação externa de outro chamador. A revogação posterior à transação pressupõe esse limite. Novos chamadores internos não devem envolver esse serviço em transação externa, pois savepoint não equivale ao commit externo.

| Cenário específico executado | Resultado observado |
|---|---|
| Reutilização real do maior ID, admin → recepcao e recepcao → admin | IDs iguais e identidades diferentes; duas sessões antigas rejeitadas |
| Fluxo completo renderer/preload/IPC | Duas janelas revogadas; seis canais negados; novo login obrigatório |
| Consulta de identidade concluída depois da exclusão/recriação | Resposta antiga negada; referência e geração da sessão nova preservadas |
| Falha tardia da consulta e sinal antigo de revogação | Falha sanitizada; sessão substituta preservada |
| Login aguardando Argon2id | Credencial antiga não autentica a conta substituta |
| Ator excluído durante criação pendente | Nenhuma criação indevida, inclusive com ator recriado |
| Redefinição de senha com alvo substituído | CONFLITO; conta substituta e sessão permanecem inalteradas |
| FK RESTRICT e FK adiada que falha no COMMIT | Conta e duas sessões preservadas; nenhuma revogação prematura |
| Exclusão/recriação por segunda conexão | Próxima autorização nega sessão antiga |
| Ator substituído por segunda conexão durante hash | Mesmo ID/perfil e mesma sessão local não bastam: escrita negada |
| Upgrade da versão 1, falha de upgrade, reaplicação e reabertura | Dados preservados, rollback correto, identidade persistente e imutável |
| A2 direto no handler, com e sem outro campo válido | VALIDACAO; propriedade undefined preservada na entrada; banco inalterado |

## Validações executadas

Todos os comandos abaixo foram executados nesta retomada com `npm.cmd` no PowerShell (equivalente aos comandos npm pedidos). Todos terminaram com código **0**, observado na saída da ferramenta. Os testes Electron usaram memória/arquivos temporários e dados sintéticos; não abriram o banco real de userData.

| Comando | Evidência observada |
|---|---|
| npm run typecheck | Dois projetos TypeScript sem erros; repetido após os reforços finais dos testes |
| npm run build | tsc, projeto renderer e CopiarAssets concluídos; também executado por todas as suítes |
| npm run test:infra | Janela, renderer, preload, isolamento, sandbox e ponte sem acesso genérico |
| npm run test:banco | 9 grupos; migrations síncronas, FKs, rollback, persistência, foreign_key_check e integrity_check |
| npm run test:contratos | 64 configurações inválidas rejeitadas, sem abrir banco |
| npm run test:leituras | 9 grupos; paginação, validação, erros e snapshot WAL com outra conexão |
| npm run test:escritas | 11 grupos; CRUD, entradas, constraints, savepoints e rollback de releitura |
| npm run test:auth-contratos | Quatro códigos de erro; 35 arquivos sem ciclos; fronteiras independentes do banco |
| npm run test:auth | 8 grupos; Argon2id, validação, projeção e falhas sanitizadas |
| npm run test:auth-banco | 8 grupos mais integração Argon2id/SQLite no Main e composição |
| npm run test:sessoes | Perfis atuais, exclusão/inatividade, logout, concorrência, cancelamento e falhas |
| npm run test:auth-ipc | IPC real; duas janelas, respostas tardias, logout, crash/recuperação e composição |
| npm run test:auth-seguranca | 7 grupos; 17 entradas malformadas, origem/frame, falhas e revogação |
| npm run test:usuarios | CRUD/IPC e todos os cenários A1/A2 acima; repetido após acrescentar segunda conexão e migration |
| npm audit | `found 0 vulnerabilities`; sem audit fix |
| git diff --check | Sem erros de whitespace; apenas avisos Git de conversão LF/CRLF |

Não houve falha de validação nesta retomada. O relato preexistente sobre regressão falhando antes da correção não foi reproduzido por reversão de código; não é evidência nova desta execução.

## Inventário exato em relação ao HEAD

Todos os arquivos abaixo já estavam alterados/não rastreados antes da retomada, exceto este relatório. As responsabilidades são de Miguel: infraestrutura, banco, autenticação, perfis, segurança, contratos correspondentes e testes/documentação. Nenhum módulo funcional de colega foi modificado. As fixtures que inserem instrutor apenas exercitam a FK existente; não implementam ou alteram esse módulo.

Arquivos rastreados modificados (26):

| Arquivo | Função da alteração acumulada |
|---|---|
| SEGURANCA.md | Justificativas, revogação por identidade e limites |
| docs/ARQUITETURA.md | Estado da etapa 5, identidade interna e contratos |
| docs/AUTENTICACAO.md | Implementação, testes, histórico e limites |
| docs/BANCO.md | Migration aditiva e coluna técnica |
| package.json | Comando test:usuarios |
| src/main/Composicao.ts | Montagem do CRUD e registro da migration 002 |
| src/main/ipc/AutenticacaoHandler.ts | Validação de contexto reutilizada no Main |
| src/main/seguranca/Autorizador.ts | Comparação da identidade persistente e proteção contra resposta tardia |
| src/main/seguranca/ContratosAutenticacao.ts | Identidade nos contratos internos |
| src/main/seguranca/SessaoManager.ts | Vínculo e revogação por identidade |
| src/preload/PonteAcademia.ts | Seis métodos administrativos específicos |
| src/repositories/ConsultaAutenticacaoRepository.ts | Leitura interna da identidade |
| src/services/AutenticacaoService.ts | Comparação de identidade antes/depois do hash |
| src/services/SessaoAutenticacaoService.ts | Sessão vinculada à identidade autenticada |
| src/services/ValidacaoAutenticacao.ts | Formato da identidade interna |
| src/shared/ipc/ContratoIpc.ts | Patch sem senha e canal próprio para redefinir |
| tools/Autenticacao.test-d.ts | Contratos internos e ausência da identidade no DTO de sessão |
| tools/Autenticacao42.test-d.ts | Compatibilidade da porta interna de credenciais |
| tools/BaseRepository.test-d.ts | União de canais atualizada |
| tools/VerificarAutenticacao.ts | Fixture com identidade interna |
| tools/VerificarAutenticacaoBanco.ts | Migration 002 e projeções internas |
| tools/VerificarAutenticacaoIpc.ts | Fixtures, ponte ampliada e resposta tardia com identidade |
| tools/VerificarBanco.ts | Reabertura com duas versões de migration |
| tools/VerificarInfraestrutura.ts | Expectativa da ponte administrativa |
| tools/VerificarSegurancaAutenticacao.ts | Fixtures com migration 002 e ponte específica |
| tools/VerificarSessoes.ts | Identidade nos contratos e fixtures de sessão |

Arquivos novos/não rastreados pertencentes ao trabalho (10):

| Arquivo | Finalidade |
|---|---|
| src/database/migrations/Migracao002IdentidadeConta.ts | Identidade gerada, backfill, unicidade e imutabilidade |
| src/main/ipc/UsuarioHandler.ts | Seis canais, origem e tradução de erros |
| src/repositories/UsuarioRepository.ts | Acesso administrativo parametrizado e transações |
| src/services/ErroUsuario.ts | Erros públicos fixos |
| src/services/UsuarioService.ts | Regras administrativas e guardas de identidade |
| src/services/ValidacaoUsuario.ts | Zod e rejeição de objetos/propriedades inadequados |
| tools/Usuarios.test-d.ts | Proibição estática de senha no patch e hash no DTO |
| tools/VerificarIdentidades.ts | Regressões A1, migration e concorrência |
| tools/VerificarUsuarios.ts | Integração CRUD/IPC, A2 e chamada das regressões A1 |
| docs/ETAPA_5_2_REVISAO.md | Este relatório da retomada |

Removidos: nenhum. Total esperado ao finalizar: 26 rastreados modificados, dez novos do trabalho e um não rastreado estranho preservado.

## Git e integridade

- Branch: `feat/miguel-infraestrutura`.
- HEAD: `391896085a10c9cec859e344329bfea8f83d37c1`; histórico preservado.
- Índice sem alterações: git diff --cached --name-only não retornou caminhos. Nenhum add, commit, push, reset, clean ou checkout foi executado.
- Migration 001: blob de trabalho e blob do HEAD iguais, `2668213cfd8e9d07e6238d033eef0d335c3000ae`.
- Arquivo estranho preexistente, exibido pelo Git como `"t \357\200\242`n=== VERSAO DECLARADA ===\357\200\242"`: permanece não rastreado e fora do escopo. SHA-256 antes/depois: `A8E8D9B9A1C5BAB5821BD20CEC50FDD9C5DC9F1E150CED4F0C5644E8D56DD1E3`. Não foi editado, removido ou incluído em staging.
- Nenhum artefato adicional apareceu no status após builds/testes; dist é saída ignorada do build. Nenhum módulo dos colegas foi incluído.
- DTOs são projetados explicitamente e os testes de sucesso/erro verificam ausência de senha/hash/identidade interna; a porta que contém identidade é exclusiva do Main.

## Ressalvas e limites

Não há broadcast entre conexões/processos. Uma leitura já realizada antes do commit externo representa seu ponto de observação; não se promete cancelar retroativamente toda resposta assíncrona ou operação já confirmada. Isso não transfere uma sessão para a identidade substituta; escritas administrativas revalidam sob IMMEDIATE.

A identidade usa 128 bits aleatórios. O índice impede colisões entre contas presentes e falha de forma fechada; não há registro histórico de todas as identidades excluídas. Portanto, a não repetição ao longo de toda a história é probabilística, com risco de colisão extremamente pequeno, não uma prova matemática de unicidade eterna. A proteção pressupõe banco e esquema administrados pelo aplicativo, não um invasor com permissão de modificar o arquivo SQLite/triggers.

Redefinição de senha não encerra globalmente sessões existentes. Expiração, limitação temporal de tentativas, provisionamento inicial e telas permanecem pendentes conforme escopo documentado. Os testes não substituem uma nova auditoria independente e revisão humana. A classificação com ressalvas reflete esses limites e não uma falha de teste ocultada.
