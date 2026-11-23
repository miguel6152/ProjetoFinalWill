# API local de relatórios

O Main inicia Express em 127.0.0.1. A porta padrão é escolhida pelo sistema operacional. Defina API_RELATORIOS_PORTA para usar uma porta fixa. Se estiver ocupada, estadoRelatorios() informa indisponibilidade e o desktop continua funcionando. O encerramento fecha conexões HTTP e invalida as credenciais antes de fechar o banco.

Express e @types/express foram adicionados ao lockfile para implementar o servidor solicitado e sua tipagem. A API usa ConsultaRelatorioService e a conexão SQLite administrada pelo Main. RelatorioService é o cliente HTTP da integração com as telas. RelatorioRepository reutiliza as regras de leitura de alunos autorizados de AvaliacaoRepository.

## Autenticação

Componentes internos do Main obtêm endereço e credencial por acessoRelatorios(contexto). O token aleatório dura cinco minutos e fica associado à sessão exata da janela. Uma nova emissão para a janela substitui a anterior. O consumidor usa Authorization com o esquema Bearer. Logout, expiração, troca de sessão, exclusão, desativação ou troca de credencial invalidam o acesso. O servidor relê perfil e escopo a cada requisição.

Credenciais ficam no Main. A etapa 7 consome HTTP no Main e devolve somente os relatórios ao renderer através de IPC tipada. Consulte ENTREGA_JULIO.md para demonstração, testes e limites.

## Rotas e filtros

GET /relatorios/evolucao exige aluno_id, inicio e fim. Datas civis usam YYYY-MM-DD e os dois extremos são inclusivos. Admin e instrutor autorizado ao aluno recebem pontos cronológicos com peso_kg, altura_cm e medidas opcionais em cm. Valores ausentes permanecem null.

GET /relatorios/frequencia exige inicio e fim como instantes ISO 8601 com fuso, por exemplo 2026-01-01T00:00:00-03:00. Os extremos são inclusivos e filtram o início da aula. aluno_id e aula_id são opcionais. Para montar URLs, use URLSearchParams, que também codifica corretamente o sinal de offsets positivos.

Frequência considera inscrições ativas em aulas concluídas. Instrutores recebem apenas suas aulas. Admin e recepção consultam todas. A agregação ocorre por aluno e usa relações de chave primária para evitar duplicação. O percentual é presentes / (presentes + ausentes) vezes 100. Sem chamadas registradas, retorna null.

O período máximo é 366 dias. O limite é mil avaliações ou mil alunos agregados. Exceder o limite retorna 400, permitindo solicitar um período menor. Filtros desconhecidos, repetidos ou inválidos também retornam 400. Falta ou revogação de credencial retorna 401 e perfil ou aluno sem permissão retorna 403. Intervalos válidos sem resultados retornam listas vazias.

## Demonstração

Execute npm run test:api-relatorios. O teste autentica usuários fictícios, solicita credenciais no Main e chama HTTP real em loopback. Mostra duas presenças, uma ausência e uma chamada não registrada, com 66,67% formatados em português. Também verifica evolução cronológica, recusa da recepção, isolamento dos instrutores, logout, intervalo vazio, porta ocupada e fechamento do servidor.
