# Inscrições e chamada

Em **Inscrições e chamada**, informe os IDs da aula e do aluno. A matrícula precisa estar ativa e abranger a data de início da aula em America/Sao_Paulo. As datas inicial e final são inclusivas. A aula deve estar agendada e o aluno ativo.

O SQLite reserva a escrita antes de conferir matrícula, duplicidade e vagas. Cancelar uma inscrição sem chamada libera sua vaga. Reinscrever reutiliza seu ID e volta a presença para não registrada. Alterar aula ou aluno e reativar exigem uma nova conferência de elegibilidade e capacidade.

A chamada pode ser lançada a partir do início da aula. Presente e ausente podem ser corrigidos entre si, inclusive após a conclusão. Após lançar presença, a inscrição fica protegida contra exclusão, cancelamento, troca de aula ou aluno e retorno para não registrada. Inscrições de aulas concluídas também ficam protegidas contra exclusão e mudança dos vínculos. Essas regras preservam os registros para os relatórios de frequência.

Admin e recepção operam todas as inscrições. Instrutor opera somente as inscrições das próprias aulas. Edições conferem a aula original e a de destino.

Para demonstrar, crie uma aula já iniciada com duas vagas e duas matrículas vigentes naquele dia. Inscreva os dois alunos. Em **Editar**, marque um presente e o outro ausente. Conclua a ocorrência em **Aulas**. Confira os registros em **Inscrições e chamada**.

Execute `npm run test:inscricoes`. O verificador usa SQLite temporário, dois serviços com conexões distintas disputando a última vaga e login/IPC reais do Electron.
