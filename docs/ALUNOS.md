# CRUD de alunos — frente do Davi

Implementado na branch `feat/davi-alunos-planos-matriculas`. A entrega de CRUD abrange alunos: cadastro, listagem paginada, busca, detalhes, edição, desativação e exclusão física sem dependências. A etapa seguinte acrescentou [ViaCEP](VIACEP.md) como auxílio opcional ao endereço, preservando preenchimento manual. Planos e matrículas serão tratados posteriormente.

## Arquivos e decisões

| Arquivo | Responsabilidade |
|---|---|
| `src/models/Aluno.ts` | Linha interna da tabela existente, incluindo os campos de notificações que devem ser preservados. |
| `src/shared/tipos/Aluno.ts` | Dados de cadastro e projeções públicas, com uma projeção mínima para instrutores. |
| `src/repositories/AlunoRepository.ts` | Estende `BaseRepository`; reaproveita CRUD, parametriza buscas e consulta vínculos reais do instrutor. |
| `src/services/ValidacaoAluno.ts` | Schemas Zod estritos, CPF com dígitos verificadores, datas reais sem futuro, contato e endereço. Rejeita campos internos, getters, ciclos e undefined explícito. |
| `src/services/AlunoService.ts` | Aplica permissões, revalida ator e escopo na transação, projeta dados e verifica concorrência antes de editar/excluir. |
| `src/services/ErroAluno.ts` | Mensagens públicas sem SQL, stack ou dados pessoais. |
| `src/main/ipc/AlunoHandler.ts` | Registra os cinco canais específicos e reutiliza a validação de janela, origem e frame da autenticação. |
| `src/main/Composicao.ts` | Instancia o módulo com conexão/sessões existentes e encerra seus handlers. Alteração necessária na infraestrutura compartilhada. |
| `src/shared/ipc/ContratoIpc.ts` | Acrescenta contratos tipados de alunos sem mudar assinaturas de usuários/autenticação. |
| `src/preload/PonteAcademia.ts` | Expõe apenas criar, listar, obter, atualizar e excluir alunos. |
| `src/renderer/telas/AlunosTela.ts` | Formulários, tabela, detalhes, busca, paginação, confirmação de exclusão e tratamento de erros. |
| `src/renderer/AplicacaoRenderer.ts` | Acrescenta navegação Alunos/Usuários e limpa a tela ao sair ou perder sessão. |
| `tools/VerificarAlunos.ts` | Testes de integração com IPC/preload e SQLite reais em arquivo temporário. |
| `tools/VerificarInterfaceAlunos.ts` | Executa os formulários reais em janelas Electron ocultas e verifica a persistência. |
| `package.json` | Acrescenta `test:alunos` e `test:alunos-interface`, sem dependências novas. |
| `tools/BaseRepository.test-d.ts`, `tools/VerificarInfraestrutura.ts`, `tools/VerificarAutenticacaoIpc.ts`, `tools/VerificarSegurancaAutenticacao.ts` | Atualizam somente as listas explícitas de canais/capacidades para incluir alunos. |
| `README.md`, `docs/ARQUITETURA.md`, `SEGURANCA.md`, `docs/ALUNOS.md` | Registram o estado e as decisões desta entrega. |

Não há migration. A tabela `alunos` e todas as FKs permanecem intactas. E-mail e telefone não recebem unicidade artificial: somente CPF tem essa restrição no schema. Não foram adicionados campos.

CPF e CEP aceitam a apresentação usual e são armazenados somente com dígitos. Telefone aceita caracteres de formatação e é armazenado com 10 a 13 dígitos. E-mail usa trim e minúsculas. E-mail, telefone e complemento vazios no formulário viram `null`. Nome/endereço têm limites de tamanho; UF precisa ser válida. A data de nascimento é uma data civil real, sem mínimo de idade inventado; não pode ser posterior ao dia local do sistema.

`telegram_chat_id` e `autorizado_notificar_em` são inicializados como nulos na criação, não entram em DTOs/formulários e são preservados na edição. A gestão de consentimento e envio pertence à frente do Vitor.

## Permissões e privacidade

| Operação | Admin | Recepção | Instrutor |
|---|---|---|---|
| Criar/editar/desativar | Sim | Sim | Não |
| Listar/detalhar | Sim | Sim | Apenas alunos vinculados |
| Excluir fisicamente | Sim | Não | Não |

Instrutores precisam de cadastro de instrutor ativo vinculado à conta. O escopo segue os vínculos de aulas/inscrições ou avaliações realizados por esse instrutor, conforme arquitetura. A projeção contém somente ID, nome e situação. A busca de instrutor usa apenas nome; buscar por CPF/contato não revela correspondências pela contagem. Sem vínculo, obter retorna `NAO_ENCONTRADO`.

Admin e recepção recebem CPF mascarado já na saída da listagem; CPF completo, contato e endereço aparecem apenas na consulta individual necessária ao atendimento. A interface usa `textContent` para dados retornados, evitando execução de HTML cadastrado.

Cada operação exige sessão válida no Main. Após a autorização assíncrona, a instância/geração da sessão e a identidade, credencial, atividade e perfil persistidos do ator são conferidos novamente sob transação IMMEDIATE, sem awaits antes de acessar/gravar dados. Logout ou perda de privilégio pendente impede a operação.

Detalhes administrativos retornam uma `referencia` HMAC opaca do conteúdo consultado. Atualizar/excluir exigem essa referência; alterações concorrentes retornam `CONFLITO`, pedindo nova consulta. A referência não substitui permissão e é renovada ao reiniciar a composição. Trata-se de concorrência por conteúdo, sem identidade persistente nova: não se promete distinguir a recriação externa de uma linha com todos os campos e timestamps exatamente iguais. Não é um token de autenticação.

As FKs RESTRICT bloqueiam exclusão quando há matrículas (inclusive canceladas), inscrições ou avaliações. A mensagem orienta desativar em vez de apagar histórico. Nenhuma tabela dos colegas é modificada por operações de alunos. Não há geração de pagamentos nem chamadas externas.

## Executar e conferir

Use Node 24 e as dependências já instaladas:

```powershell
npm run typecheck
npm run build
npm run test:alunos
npm run test:alunos-interface
npm run dev
```

1. Em banco novo, crie o administrador e entre. Em banco existente, use sua conta local.
2. Abra **Alunos** no cabeçalho e clique em **Novo aluno**. Preencha os campos obrigatórios com dados de teste e CPF de teste válido.
3. Salve, confira a máscara na listagem e consulte **Detalhes**.
4. Use **Editar**, altere nome/endereço e salve. Desmarque **Aluno ativo** para desativar sem perder vínculos.
5. Pesquise por nome, CPF sem pontuação, e-mail ou telefone sem formatação. Teste paginação se houver mais de dez registros.
6. Cadastre novamente o mesmo CPF: a operação deve ser recusada. Um CPF com dígitos verificadores inválidos também é recusado.
7. Como admin, clique em **Excluir** e confirme. Com vínculos reais, deve aparecer conflito e o aluno deve permanecer cadastrado.
8. Feche e reabra para conferir persistência. Recepção não tem botão de exclusão; instrutor não tem cadastro/edição e só vê alunos de seu escopo.

Os testes automatizados usam dados sintéticos e bancos temporários, nunca o arquivo de `userData`. Eles cobrem cadastro válido/inválido, normalização, consulta, edição, exclusão, duplicidade na criação/edição, máscaras, paginação, busca parametrizada, integridade das três relações, preservação de notificações, perfis/escopo, sessão, concorrência, rollback, reabertura e formulários reais.

Validação desta etapa em 17/11/2026: `npm run typecheck`, `npm run build`, `git diff --check` e todos os 17 scripts `test:*` do `package.json` passaram (código 0). Isso inclui `test:alunos`, `test:alunos-interface` e as 15 suítes existentes de infraestrutura, banco, repositories, autenticação, sessões, usuários, provisionamento, políticas e interface administrativa. Runtime dos testes desktop: Electron 45.3.2, Node 24.22.2 embarcado e SQLite 3.54.1. Esses resultados cobrem os cenários automatizados; a revisão do grupo continua necessária antes da integração.

Limitações: não implementa política de retenção, auditoria de acessos ou cifragem do arquivo SQLite. Planos/matrículas não integram esta etapa; a integração posterior de endereço está documentada em `VIACEP.md`. A matriz histórica em `ENCERRAMENTO.md` registra a entrega do Miguel; o estado desta frente está neste documento.
