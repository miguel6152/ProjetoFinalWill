# AGENTS.md

Regras para qualquer assistente de IA (Codex, OpenCode, Claude, etc.) que trabalhe neste repositório.
Leia este arquivo e `docs/ARQUITETURA.md` antes de escrever qualquer código.

## Contexto do projeto

Sistema de gestão para uma academia de ginástica de bairro, feito como projeto final da disciplina DAD (Desenvolvimento de Aplicações Desktop). É uma **aplicação desktop em Electron com TypeScript**, entregue por este repositório do GitHub.

O cliente precisa de: cadastro de alunos; planos (mensal, trimestral, anual); instrutores e aulas (musculação, funcional, dança); avaliações físicas com evolução (peso, medidas); controle de mensalidades e inadimplência; aviso de chuva para aulas ao ar livre; mensagem automática ao aluno quando o plano estiver perto de vencer.

## Requisitos obrigatórios (não negociáveis)

1. Banco relacional com **no mínimo 6 tabelas** ligadas por chaves estrangeiras reais.
2. **CRUD completo** (criar, ler, atualizar, excluir) para **todas** as entidades.
3. **4 consumos de API distintos**, cada um com propósito real:
   - ViaCEP (endereço no cadastro)
   - Open-Meteo (chuva em aulas ao ar livre)
   - API de mensagens, Telegram Bot ou e-mail (aviso de vencimento)
   - API própria em Express + TypeScript (relatórios)
4. **Segurança** pensada desde o início e justificada em `SEGURANCA.md`.
5. **Código em classes (POO)**, sem funções soltas com lógica de negócio.
6. **Electron + TypeScript.** Nenhum arquivo `.js` com lógica da aplicação.

## Stack

- Electron, TypeScript (modo `strict`)
- SQLite com `better-sqlite3`
- Express + TypeScript para a API própria
- `bcrypt` para senhas, `zod` para validação
- Configurações e chaves em `.env` (nunca commitar)

## Estrutura de pastas

```
src/
  main/          processo principal do Electron
  preload/       ponte segura entre main e renderer
  renderer/      telas
  models/        entidades e tipos
  repositories/  acesso ao banco (um por entidade, estendem BaseRepository)
  services/      regras de negócio e consumo de APIs
  api/           API própria (Express)
  database/      conexão e migrations
docs/            arquitetura e documentação
```

## Padrões de código

- Uma classe por arquivo, nome do arquivo igual ao da classe (`AlunoRepository.ts`).
- Camadas: **model → repository → service → handler IPC → tela**. A tela nunca acessa o banco diretamente.
- Todo repository estende `BaseRepository<T>` e usa **queries parametrizadas**, nunca concatenação de strings em SQL.
- Todo service valida a entrada com **zod** antes de usar os dados.
- Tipagem explícita, sem `any`.
- Tratar erros de rede e de banco sem derrubar o app, com mensagens claras para o usuário.
- Nomes de tabelas e colunas em português, sem acento, em `snake_case`. Nomes de classes em `PascalCase`.

## Segurança (sempre)

- Senhas **sempre** com hash bcrypt. Nunca em texto puro, nunca em log.
- Controle de acesso por perfil (`admin`, `recepcao`, `instrutor`) checado no processo **main**, em todo handler IPC. Nunca confiar só na tela.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, comunicação apenas via `preload` com canais IPC tipados e específicos.
- Dados sensíveis (CPF, avaliações físicas) tratados conforme a LGPD: mascarar CPF na listagem, restringir avaliações a admin e instrutor.
- Chaves de API somente em `.env`. Manter um `.env.example` sem valores reais.
- Nunca inserir segredos, tokens ou senhas reais no código ou nos commits.

## Como a IA deve trabalhar

- **Passos pequenos.** Uma funcionalidade por vez, nunca o sistema inteiro de uma vez.
- **Explicar o que foi feito.** Ao final de cada tarefa, explicar cada arquivo criado ou alterado, de forma que um estudante consiga explicar a decisão na apresentação.
- **Não mexer fora da frente pedida.** Cada integrante cuida de uma parte (veja abaixo). Não editar arquivos de outra frente sem avisar.
- **Seguir o padrão existente.** Antes de criar algo novo, olhar como o `BaseRepository` e as entidades já feitas estão organizados.
- **Em caso de dúvida, perguntar** em vez de inventar requisitos.
- Não adicionar dependências sem justificar o motivo.

## Divisão do grupo

| Integrante | Frente |
|---|---|
| Miguel G. | Base, banco e migrations, login, perfis e segurança |
| Davi Rodrigues | Alunos, planos, matrículas e ViaCEP |
| Vitor Meneghin | Pagamentos, inadimplência, notificações e API de mensagens |
| Julio Isidoro | Instrutores, aulas, inscrições, avaliações, Open-Meteo e API própria |

## Regras de Git

- Uma branch por funcionalidade: `feat/alunos`, `feat/clima`, `fix/validacao-cpf`.
- Commits pequenos e frequentes, com mensagem no padrão `feat:`, `fix:`, `docs:`, `chore:`.
- Cada integrante commita **com o próprio usuário do Git**. A IA não deve commitar em nome de outra pessoa.
- Ler o `git diff` antes de cada commit.
- Mudanças entram na `main` por Pull Request revisado por outro integrante.
