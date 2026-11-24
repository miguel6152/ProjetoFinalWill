# Controle de inadimplência

## Quando uma mensalidade entra na lista

No processo principal, `InadimplenciaService.consultar` lê o relógio do computador e determina a data civil no fuso `America/Sao_Paulo`. Essa é a data de referência exibida na tela. Uma mensalidade entra em atraso no dia seguinte ao vencimento se continuar pendente, com valor positivo e sem recebimento registrado. Uma cobrança que vence hoje pode ser recebida durante todo o dia sem aparecer como atrasada.

`PagamentoRepository.vencidas` compara o vencimento da própria cobrança com a data de referência. Calcula os dias de atraso pela diferença entre as duas datas civis no SQLite. Por exemplo, entre 31/12 e 01/01 há um dia de atraso, independentemente do horário da consulta. Cobranças pagas, canceladas ou de valor zero ficam fora. Encerrar ou cancelar uma matrícula preserva suas dívidas históricas pendentes.

O relatório agrupa os lançamentos pelo ID do aluno, mesmo quando ele tem mais de uma matrícula. Cada lançamento entra uma vez na soma em centavos. A quantidade, o valor devido, o vencimento mais antigo e o detalhamento de cada aluno usam as mesmas linhas que o resumo geral.

## Como consultar e receber

1. Entre como administrador ou recepção e abra **Inadimplência**. A busca aceita parte do nome ou o ID do aluno. Preencha um ou ambos os limites do período de vencimento e clique em **Consultar**. As datas inicial e final são inclusivas.
2. Escolha **Maior atraso** para ver primeiro o aluno com a cobrança mais antiga, ou **Maior valor** para ordenar pelo total devido por aluno. O resumo mostra a quantidade de alunos e o valor vencido dentro dos filtros aplicados.
3. Expanda o nome do aluno. Cada linha identifica a matrícula, a competência, o vencimento, os dias em atraso e o valor devido.
4. Clique em **Receber** na mensalidade desejada. Confira os dados, escolha a data e o meio e confirme o recebimento integral. O formulário é o mesmo da etapa de mensalidades. Ao confirmar, a tela volta aos filtros usados e recalcula os totais. Para ver baixas feitas em outra janela, clique em **Consultar**.

## Demonstração

Em **Mensalidades**, lance duas cobranças de competências distintas para o mesmo aluno de teste, ambas com vencimento anterior a hoje. Use R$ 100,00 e R$ 150,00. Abra **Inadimplência** e filtre pelo ID desse aluno. Se forem as únicas cobranças vencidas dele, o resumo mostrará um devedor e R$ 250,00. Receba a de R$ 100,00 e confira o saldo de R$ 150,00. Após receber a segunda, o resumo deverá mostrar zero alunos e R$ 0,00.

## Verificações

`npm run test:inadimplencia` usa um SQLite em memória e controla o instante antes e depois da meia-noite de Ano-Novo em São Paulo. Cobre ontem, hoje, amanhã, duas dívidas de um aluno, ausência de dívida, matrícula inativa, registros pagos e cancelados, busca, período, ordenação, soma e atualização após quitação.

`npm run test:pagamentos` exercita o acesso financeiro pelo IPC e o fluxo no Electron, incluindo recusa para instrutor e sessão ausente, validação dos filtros, entrada no formulário de recebimento e retorno ao relatório atualizado.
