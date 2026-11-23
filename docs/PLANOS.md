# CRUD de planos — frente do Davi

Implementado na branch `feat/davi-alunos-planos-matriculas`, usando a tabela `planos` existente. Inclui cadastro, listagem paginada, busca por nome, detalhes, edição, desativação/reativação e exclusão física quando não há matrícula vinculada. Não há migrations, campos adicionais ou dependências novas.

## Regras preservadas

- Campos: nome, duração, valor em centavos, ativo, ID e timestamps. Não foi acrescentada descrição, pois ela não existe no schema.
- Nome obrigatório, com trim e limite de 120 caracteres. Não há unicidade de nome no banco; nomes iguais continuam permitidos.
- Duração de **1, 3 ou 12 meses**, como na constraint original.
- `valor_centavos` é inteiro seguro, não negativo. Zero é permitido, inclusive para planos gratuitos.
- Situação é 0/1. Um plano com vínculos pode ser desativado ou reativado; a matrícula existente não é cancelada nem modificada implicitamente.
- Exclusão física usa a FK `matriculas.plano_id ON DELETE RESTRICT`: matrícula ativa, cancelada ou encerrada impede apagar o plano. A interface orienta desativar para preservar o histórico.
- Editar nome, duração ou valor do plano não altera `valor_contratado_centavos`, datas ou situação de matrículas existentes, nem seus pagamentos.

A interpretação do preço trimestral/anual como valor total ou mensal, parcelamento e geração de cobranças continuam pendentes conforme `ARQUITETURA.md`. A tela usa **Valor do plano (R$)**, sem estabelecer essas políticas. Esta etapa não implementa matrícula ou pagamento.

## Camadas e arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/models/Plano.ts` | Linha de persistência da tabela existente. |
| `src/shared/tipos/Plano.ts` | Entrada de cadastro e DTO com timestamps/referência de concorrência. |
| `src/repositories/PlanoRepository.ts` | Estende `BaseRepository`, reaproveita CRUD e usa busca parametrizada com ordem fixa por ID. |
| `src/services/ValidacaoPlano.ts` | Schemas Zod estritos para campos, IDs, patch e paginação; rejeição de getters, ciclos e undefined explícito. |
| `src/services/PlanoService.ts` | Revalida ator/perfil, trata leituras e escritas transacionais e controla concorrência. |
| `src/services/ErroPlano.ts` | Códigos e mensagens sanitizados, com orientação para conflitos de vínculo. |
| `src/main/ipc/PlanoHandler.ts` | Cinco canais específicos, protegidos por origem, frame e sessão. |
| `src/main/Composicao.ts` | Instancia o serviço e registra/encerra seus handlers usando a conexão e as sessões existentes. |
| `src/shared/ipc/ContratoIpc.ts` | Contratos tipados de criar/listar/obter/atualizar/excluir planos. |
| `src/preload/PonteAcademia.ts` | Capacidade específica `planos`, sem acesso genérico ao banco ou IPC. |
| `src/renderer/telas/PlanosTela.ts` | Listagem, detalhes, busca, paginação, formulário e confirmação de exclusão no padrão visual existente. |
| `src/renderer/componentes/ValorMonetario.ts` | Converte texto decimal para centavos sem multiplicar números de ponto flutuante e formata valores. |
| `src/renderer/AplicacaoRenderer.ts` | Navegação de Planos para admin/recepção e encerramento da tela ao navegar ou sair. |
| `tools/VerificarPlanos.ts` | Integração real com IPC/preload e SQLite temporário, autorização, validação, relacionamentos, rollback e persistência. |
| `tools/VerificarInterfacePlanos.ts` | Exercita formulários reais no Electron, conversão monetária, permissões, conflitos e navegação. |
| `package.json` | Scripts `test:planos` e `test:planos-interface`. |
| `tools/BaseRepository.test-d.ts`, `tools/VerificarInfraestrutura.ts`, `tools/VerificarAutenticacaoIpc.ts`, `tools/VerificarSegurancaAutenticacao.ts` | Atualizam somente as listas explícitas de canais/capacidades para reconhecer planos. |
| `README.md`, `docs/ARQUITETURA.md`, `SEGURANCA.md`, `docs/PLANOS.md` | Documentam o estado, as decisões e os limites da entrega. |

## Segurança e concorrência

Admin cria, consulta, edita, desativa/reativa e exclui. Recepção somente lista e consulta. Instrutor não tem acesso ao módulo. O Main aplica essas regras em todos os cinco canais, independentemente de botões visíveis.

O handler reutiliza a verificação de janela, frame principal e URL da autenticação. O serviço captura sessão/geração antes da autorização assíncrona e relê identidade, credencial, atividade e perfil do ator na transação IMMEDIATE antes de acessar dados. Não há await entre a releitura e a operação. Logout ou perda de privilégio durante autorização impede escrita.

Atualização/exclusão exigem a `referencia` HMAC retornada pelo Main, vinculada ao conteúdo consultado. Uma edição concorrente gera conflito, pedindo nova consulta. A referência não concede permissão e muda ao reiniciar a composição. Como em alunos, é um controle por conteúdo, sem adicionar identidade persistente à tabela: recriações externas que repitam exatamente todos os campos e timestamps não são distinguíveis.

Queries usam parâmetros para entradas variáveis. Dados do banco entram na interface por `textContent`. Erros retornam mensagens públicas, sem SQL ou stack. Nenhuma tabela dos colegas é escrita pelas operações deste módulo.

## Conferir pela interface

```powershell
npm run typecheck
npm run build
npm run test:planos
npm run test:planos-interface
npm run dev
```

1. Entre como admin e abra **Planos → Novo plano**.
2. Informe nome, duração e valor em reais, por exemplo `99,90` ou `99.90`, sem separador de milhar. Salve e confira o valor em **Detalhes**.
3. Use **Editar** para alterar os campos. Desmarque **Plano ativo** para desativar; marque novamente para reativar.
4. Confira que `0,00` é aceito e que valores negativos ou com mais de duas casas decimais são recusados. A API interna também rejeita centavos fracionários ou fora do intervalo seguro.
5. Pesquise por nome; com mais de dez planos, confira a paginação.
6. Exclua um plano sem vínculos e confirme. Com matrícula existente, deve aparecer conflito e o plano deve permanecer cadastrado; use desativação para preservar vínculos.
7. Entre como recepção: aparecem listagem/detalhes, sem operações de escrita. Instrutor não recebe navegação de planos e o Main recusa seus canais.
8. Feche/reabra para conferir persistência.

Os testes usam somente dados sintéticos, bancos temporários e janelas ocultas. As linhas de matrícula/pagamento nos testes são fixtures para verificar integridade; não representam implementação desses módulos. Os cenários cobrem CRUD, valores zero, durações, dados inválidos, busca parametrizada, paginação, perfis/origem/sessão, exclusão bloqueada nas três situações de matrícula, manutenção do valor contratado, preservação de pagamentos, concorrência, rollback e reabertura.

Validação em 17/11/2026: `npm run typecheck`, `npm run build`, `git diff --check` e todos os **21 scripts `test:*`** do `package.json` passaram com código 0, incluindo as duas suítes novas de planos e as 19 existentes. Runtime desktop: Electron 45.3.2, Node 24.22.2 embarcado e SQLite 3.54.1. Os testes de APIs externas permanecem simulados, sem internet.

Matrículas, regras de cobrança e eventual política de retenção continuam fora desta etapa. Commit e push exigem autorização separada.
