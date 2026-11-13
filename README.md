# Sistema de Gestão para Academia de Ginástica

Projeto final da disciplina **DAD (Desenvolvimento de Aplicações Desktop)**.
Aplicação desktop em **Electron + TypeScript** para gerenciar uma academia de bairro: alunos, planos, mensalidades, aulas, instrutores e avaliações físicas.

> Status: em desenvolvimento.

## Integrantes

| Nome | Frente principal |
|---|---|
| Miguel G. | Base do projeto, banco de dados, login, perfis e segurança |
| Davi Rodrigues | Alunos, planos, matrículas e integração ViaCEP |
| Vitor Meneghin | Pagamentos, inadimplência, avisos e API de mensagens |
| Julio Isidoro | Instrutores, aulas, inscrições, avaliações físicas, Open-Meteo e API própria |

## O problema (pedido do cliente)

O dono da academia precisa de um sistema que:

- cadastre alunos e seus planos (mensal, trimestral e anual);
- cadastre instrutores e as aulas que cada um dá (musculação, funcional, dança);
- registre avaliações físicas (peso, medidas) e mostre a evolução do aluno;
- controle as mensalidades e mostre quem está atrasado;
- avise quando vai chover no horário de uma aula ao ar livre;
- envie mensagem automática ao aluno quando o plano estiver perto de vencer.

## Tecnologias

- Electron
- TypeScript (toda a lógica da aplicação, sem JavaScript)
- SQLite (`better-sqlite3`)
- Express + TypeScript (API própria)
- bcrypt (hash de senhas)
- zod (validação de entradas)

## Banco de dados

Mais de 6 tabelas relacionadas por chaves estrangeiras:
`usuarios`, `alunos`, `planos`, `matriculas`, `pagamentos`, `instrutores`, `aulas`, `inscricoes_aula`, `avaliacoes_fisicas`, `notificacoes`.

O diagrama completo ficará em `docs/ARQUITETURA.md`.

## Consumo de APIs

| # | API | Finalidade no sistema |
|---|---|---|
| 1 | ViaCEP | Preencher o endereço no cadastro de alunos |
| 2 | Open-Meteo | Alertar chuva em aulas ao ar livre |
| 3 | API de mensagens (Telegram Bot ou e-mail) | Avisar o aluno sobre vencimento do plano |
| 4 | API própria (Express + TypeScript) | Relatórios de evolução física e frequência |

## Segurança

As decisões de segurança e suas justificativas para o contexto de uma academia (dados de saúde e CPF, LGPD) ficarão em `SEGURANCA.md`. Resumo:

- senhas com hash bcrypt, nunca em texto puro;
- controle de acesso por perfil (admin, recepção, instrutor);
- validação de entradas com zod;
- queries parametrizadas (contra SQL injection);
- chaves de API em `.env`, fora do repositório;
- Electron com `contextIsolation: true`, `nodeIntegration: false` e comunicação via preload/IPC.

## Uso de IA, MCP e RAG

Usamos IA generativa para apoiar a arquitetura e o desenvolvimento, e todos os integrantes revisam e entendem o código que commitam.

- **MCP:** não utilizado, pois o sistema não precisa se conectar a serviços externos específicos além das APIs acima.
- **RAG:** não utilizado, pois não há documentos do domínio que a IA precise consultar.

## Estrutura de pastas (prevista)

```
src/
  main/          processo principal do Electron
  preload/       ponte segura entre main e renderer
  renderer/      telas
  models/        entidades
  repositories/  acesso ao banco
  services/      regras de negócio
  api/           API própria (Express)
  database/      conexão e migrations
docs/
```

## Como rodar

```bash
git clone https://github.com/miguel6152/ProjetoFinalWill.git
cd ProjetoFinalWill
npm install
cp .env.example .env   # preencha as chaves
npm run dev
```

> Os comandos serão ajustados conforme a base do projeto ficar pronta.

## Fluxo de trabalho no Git

- Uma branch por funcionalidade (`feat/alunos`, `feat/clima`...).
- Pull Request revisado por outro integrante antes do merge.
- Commits pequenos e frequentes, no padrão `feat:`, `fix:`, `docs:`, `chore:`.
- Cada integrante commita com o próprio usuário do GitHub.
