# Consulta de matrículas

Esta etapa oferece apenas leitura de matrículas existentes: listagem paginada, detalhes e filtros combináveis por ID de aluno, ID de plano e situação. A tela mostra os nomes atuais do aluno e do plano e o valor e as datas registrados na matrícula. Não cria nem altera matrículas, pagamentos ou notificações.

A tabela e suas chaves estrangeiras já existiam; não houve migration. A consulta usa SQL parametrizado e uma transação de leitura para manter contagem e página coerentes. A validação zod limita tamanho de página, IDs e situações, e verifica o offset. O processo main valida origem, sessão e identidade; somente administrador e recepção podem consultar. A ponte expõe somente os métodos `listar` e `obter`.

Para conferir, execute `npm run dev`, entre como administrador ou recepção e abra **Matrículas**. Informe os IDs do aluno e/ou do plano e escolha uma situação, ou deixe os filtros vazios. Use **Filtrar**, **Anterior**, **Próxima** e **Detalhes**. Uma instalação sem matrículas apresentará lista vazia: o cadastro ainda não foi implementado. Para um ensaio completo sem dados reais, `npm run test:matriculas` cria dados sintéticos em banco temporário e verifica também a interface.

A política de sobreposição depende do grupo; alterações de situação, exclusão e os efeitos de cancelamento em pagamentos e notificações não fazem parte desta etapa e dependem das decisões correspondentes.
