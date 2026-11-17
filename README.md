# Sistema de Gestão para Academia de Ginástica

Projeto final da disciplina **DAD (Desenvolvimento de Aplicações Desktop)**.
Aplicação desktop em **Electron + TypeScript** para gerenciar uma academia de bairro: alunos, planos, mensalidades, aulas, instrutores e avaliações físicas.

> Status: em desenvolvimento. A [consulta de matrículas](docs/MATRICULAS.md) está disponível para administrador e recepção; cadastro e alterações de matrículas ainda não foram implementados.

A frente do Miguel implementa infraestrutura, banco, autenticação, provisionamento inicial e interface administrativa de usuários. A frente do Davi acrescenta o [CRUD de alunos](docs/ALUNOS.md), a [consulta ViaCEP](docs/VIACEP.md), o [CRUD de planos](docs/PLANOS.md) e a [consulta de matrículas](docs/MATRICULAS.md), integrados ao Electron. As operações de escrita de matrículas, financeiro/notificações, aulas/avaliações e as outras três integrações de API ainda dependem das próximas entregas. Isso impede considerar o projeto completo pronto. A matriz histórica da infraestrutura está em [docs/ENCERRAMENTO.md](docs/ENCERRAMENTO.md).

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
- Express + TypeScript (API própria prevista, ainda não implementada)
- Argon2id (hash de senhas, decisão da etapa 4.2)
- zod (validação de entradas)

## Banco de dados

Mais de 6 tabelas relacionadas por chaves estrangeiras:
`usuarios`, `alunos`, `planos`, `matriculas`, `pagamentos`, `instrutores`, `aulas`, `inscricoes_aula`, `avaliacoes_fisicas`, `notificacoes`.

O diagrama completo está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). As migrations 002/003 acrescentam campos técnicos de identidade e versão de credencial à tabela de usuários, sem mudar a migration 001 publicada.

## Consumo de APIs

| # | API prevista | Finalidade no sistema | Estado |
|---|---|---|---|
| 1 | ViaCEP | Preencher o endereço no cadastro de alunos | Implementado — Davi; consulta opcional com preenchimento manual |
| 2 | Open-Meteo | Alertar chuva em aulas ao ar livre | Pendente — Julio |
| 3 | API de mensagens (Telegram Bot ou e-mail) | Avisar o aluno sobre vencimento do plano | Pendente — Vitor |
| 4 | API própria (Express + TypeScript) | Relatórios de evolução física e frequência | Pendente — Julio |

## Segurança

As decisões de segurança e suas justificativas estão em [SEGURANCA.md](SEGURANCA.md). Controles de dados pessoais dos módulos ainda ausentes continuam pendentes com seus responsáveis. Resumo da frente implementada:

- senhas com hash Argon2id, nunca em texto puro ou log; novas credenciais têm pelo menos 15 caracteres;
- controle de acesso por perfil (admin, recepção, instrutor);
- validação de entradas com zod;
- queries parametrizadas (contra SQL injection);
- chaves de API em `.env`, fora do repositório;
- Electron com `contextIsolation: true`, `nodeIntegration: false` e comunicação via preload/IPC.
- sessões em memória com prazo, limites de tentativas e revogação persistente após redefinição de senha;
- identidade de conta independente do ID numérico, protegendo sessões e operações pendentes contra reutilização de IDs.

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

A base Electron/TypeScript está descrita em [docs/INFRAESTRUTURA.md](docs/INFRAESTRUTURA.md), e a conexão SQLite com migrations em [docs/BANCO.md](docs/BANCO.md). Use Node 24 LTS (`.nvmrc`: 24; engines: >=24 <25). Electron permanece em 45.3.2 e usa seu próprio runtime; não é necessário substituir a instalação global para executar o desktop já preparado.

```bash
git clone https://github.com/miguel6152/ProjetoFinalWill.git
cd ProjetoFinalWill
npm install
npm run setup:electron
npm run dev
```

Na primeira abertura de um banco vazio, cadastre o administrador pelo formulário local. Não existe senha padrão. Depois, entre e use a tela de usuários para criar, listar, buscar, editar, redefinir senhas e excluir contas. Recepção/instrutor autenticam, mas não administram usuários. Exclusão própria, remoção do último admin e exclusão de usuários referenciados são recusadas. A redefinição encerra sessões anteriores; redefinir a própria senha volta à tela de login.

O banco fica em `app.getPath('userData')/academia.sqlite3`. Não armazene bancos reais no repositório. O aplicativo não apaga o banco para contornar falha de migration. Faça backup do arquivo com o aplicativo fechado antes de atualizar uma instalação com dados importantes.

Para verificar: `npm run typecheck`, `npm run build` e os scripts `test:infra`, `test:banco`, `test:contratos`, `test:leituras`, `test:escritas`, `test:auth-contratos`, `test:auth`, `test:auth-banco`, `test:sessoes`, `test:auth-ipc`, `test:auth-seguranca`, `test:usuarios`, `test:inicializacao`, `test:politicas` e `test:interface`; execute também `npm audit` e `git diff --check`. Os testes usam exclusivamente memória e arquivos temporários.

As opções não sensíveis estão em [.env.example](.env.example): 30 minutos de inatividade, 8 horas de duração máxima, 30 logins por minuto/janela, 120 por processo e quatro logins concorrentes. A aplicação lê variáveis do ambiente do processo; não carrega `.env` automaticamente. Por exemplo, `$env:SESSAO_INATIVIDADE_MS='1800000'` no PowerShell antes de `npm start`. Valores inválidos impedem a inicialização com erro controlado. Credenciais/chaves das futuras APIs não foram criadas.

## Fluxo de trabalho no Git

- Uma branch por funcionalidade (`feat/alunos`, `feat/clima`...).
- Pull Request revisado por outro integrante antes do merge.
- Commits pequenos e frequentes, no padrão `feat:`, `fix:`, `docs:`, `chore:`.
- Cada integrante commita com o próprio usuário do GitHub.
