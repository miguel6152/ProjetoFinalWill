# Entrega da frente do Julio — etapas 1 a 7

Branch para revisão do grupo: `feat/julio-aulas-relatorios`. A integração na main depende da revisão de outro integrante. Dados dos testes são fictícios e ficam em bancos temporários.

## Relatórios integrados

Na navegação, Evolução física está disponível para admin e instrutor; Frequência também para recepção. Informe o ID do aluno e as datas na evolução. Na frequência, aluno e aula são filtros opcionais. Os IDs correspondem aos cadastros existentes; o aluno não deve ser confundido com usuário ou instrutor.

Evolução mostra datas em ordem cronológica, peso em kg, altura e medidas em cm; ausência de medida permanece distinta de zero. Frequência mostra presentes, ausentes, não registradas e percentual com duas casas decimais. Sem presentes nem ausentes, exibe “Sem presença registrada (sem denominador)”. Datas da frequência incluem o dia inteiro em America/Sao_Paulo; a conversão usa HorarioAula e recusa horários inexistentes/ambíguos. O limite permanece 366 dias e mil resultados.

Fluxo: RelatoriosTela → preload → RelatorioHandler → RelatorioService → HTTP loopback → ServidorRelatorios → ConsultaRelatorioService → RelatorioRepository. O cliente não possui consulta SQLite alternativa. Credenciais e endereço ficam no Main. Falhas limpam os resultados anteriores e permitem tentar novamente; logout e navegação impedem respostas antigas de repovoar a tela. Mudanças de perfil durante HTTP também impedem a entrega do resultado.

## Arquivos e funções, em linguagem de apresentação

| Arquivo | Responsabilidade |
|---|---|
| src/renderer/telas/RelatoriosTela.ts | mostrar cria o formulário; carregar pede o relatório e apresenta tabela, vazio ou erro; encerrar impede atualizações antigas |
| src/services/RelatorioService.ts | consultar valida os filtros, chama a API por HTTP e confere sessão e resposta |
| src/services/ConsultaRelatorioService.ts | mantém as regras de consulta da etapa 6, no lado servidor |
| src/main/ipc/RelatorioHandler.ts | aceita apenas os dois canais conhecidos e confere remetente e sessão |
| src/shared/tipos/Relatorio.ts e shared/ipc/ContratoIpc.ts | definem os dados que podem atravessar a ponte |
| src/preload/PonteAcademia.ts | expõe somente evolucao e frequencia, sem token ou URL |
| src/main/Composicao.ts | conecta o cliente, servidor e ciclo de vida do desktop |
| src/api/CredenciaisRelatorios.ts | permite reutilização interna da credencial válida em consultas simultâneas, sem ampliar seu prazo |
| src/api/ServidorRelatorios.ts | utiliza o serviço de consulta renomeado |
| src/renderer/AplicacaoRenderer.ts | acrescenta navegação por perfil e encerra relatórios ao sair da tela |
| src/renderer/telas/AvaliacoesTela.ts | corrige o texto de confirmação de avaliação excluída |
| tools/VerificarIntegracaoJulio.ts | executa fluxo completo pelo Electron e compara relatórios com SQL independente |
| tools/VerificarAvaliacoes.ts | acrescenta recusa de exclusão por outro instrutor |
| tools/VerificarApiRelatorios.ts | acompanha a separação entre cliente HTTP e serviço de consulta |
| tools/BaseRepository.test-d.ts, VerificarInfraestrutura.ts, VerificarAutenticacaoIpc.ts e VerificarSegurancaAutenticacao.ts | atualizam a lista fechada de capacidades e canais permitidos |
| package.json | acrescenta test:integracao-julio; nenhuma dependência nova nesta etapa |

## Quadro de requisitos e evidências

| Requisito | Evidência executável | Resultado e limites |
|---|---|---|
| Instrutores: criar, listar/buscar, obter, editar e excluir | VerificarInstrutores e VerificarInterfaceInstrutores | Aprovado; exclusão sem vínculo permitida, com aulas/avaliações bloqueada; conta ativa, perfil e UNIQUE verificados |
| Aulas: criar, listar, obter, editar/cancelar/concluir e excluir | VerificarAulas e VerificarInterfaceAulas | Aprovado; exclusão livre permitida, vínculo bloqueado, escopo de origem/destino e capacidade conferidos |
| Inscrições: CRUD, cancelamento, reinscrição e chamada | VerificarInscricoes | Aprovado; remoção sem chamada permitida, histórico registrado/concluído protegido; disputa real entre duas conexões pela última vaga |
| Avaliações: CRUD, medidas, autoria e histórico | VerificarAvaliacoes e VerificarInterfaceAvaliacoes | Aprovado; exclusão própria permitida, outro autor/recepção recusados; sem bloqueio genérico de admin por vínculo, pois não há entidade dependente no schema |
| Previsão externa | VerificarClima, VerificarClimaIpc, VerificarInterfaceClima | Aprovado com transporte simulado; zero, limites, fuso, cache, timeout e retorno parcial; não comprova disponibilidade ao vivo da Open-Meteo |
| API própria e autorização HTTP | VerificarApiRelatorios | HTTP real em loopback; 400/401/403, logout, escopo, período vazio, porta ocupada e encerramento aprovados |
| Fluxo completo das etapas | VerificarIntegracaoJulio | Instrutor → aula externa → clima simulado explícito → matrícula válida/inscrição → chamada → conclusão → duas avaliações → telas dos relatórios |
| Valores da tela versus banco | VerificarIntegracaoJulio | 70 e 68 kg em ordem; 2 presentes, 1 ausente e 1 não registrada = 66,67%; comparação SQL independente |
| API desligada, nova tentativa e privacidade | VerificarIntegracaoJulio | Erro visível sem fallback, botão liberado, recepção recusada na evolução, sessão trocada durante HTTP real e consultas simultâneas |
| Regressão geral | Todos os verificadores dos scripts test:* de package.json | 40 verificadores executados; duas expectativas antigas de capacidades foram atualizadas e suas suítes reexecutadas com sucesso |
| Tipagem e distribuição | npm run typecheck; npm run build | Aprovados; isolamento e CSP do Electron preservados, sem migration nesta etapa |

## Roteiro curto da apresentação

1. Com dados fictícios, entre como admin, associe um usuário instrutor ativo ao cadastro do instrutor e explique os dois IDs.
2. Agende uma aula externa com coordenadas, consulte a previsão e identifique a origem mostrada. Uma demonstração ao vivo depende do provedor; a suíte usa simulação identificada e relógio controlado para a previsão.
3. Inscreva aluno com matrícula válida no dia da aula. Depois do início da aula, registre a chamada e conclua a aula. Não altere relógio ou regras para antecipar presença: para demonstrar imediatamente use a suíte com ocorrência histórica fictícia.
4. Cadastre duas avaliações do mesmo aluno, abra Evolução física e confira peso, altura, medidas e ordem das datas.
5. Abra Frequência no período da aula. Mostre as três contagens e explique que não registradas ficam fora do denominador. A suíte demonstra 66,67% e o caso sem denominador.
6. Execute npm run test:integracao-julio para repetir o cenário automatizado e comprovar erro com API desligada e recusa de acesso. Execute npm run test:api-relatorios para demonstrar as regras HTTP.

## Pendências coletivas e limites

- Revisão da branch e merge por outro integrante; não foi feito merge automático.
- Validar limiar definitivo de chuva com o grupo; o limiar atual é demonstrativo configurável. Chamadas externas de Open-Meteo, ViaCEP e Telegram nas suítes usam mocks. A API própria usa HTTP real local.
- Homologar conectividade dos provedores e configuração/consentimento do Telegram no ambiente da apresentação, sem expor credenciais.
- Definir as regras comerciais de periodicidade financeira já documentadas na frente do Vitor. Esta entrega não muda cobrança ou matrículas.
- A suíte integrada usa operações IPC reais para os cadastros e a navegação/formulários reais para relatórios; as suítes de interface específicas cobrem os formulários das quatro entidades. Não representa teste manual com usuários finais.
