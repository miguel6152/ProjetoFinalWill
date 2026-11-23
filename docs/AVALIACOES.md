# Avaliações físicas

Admin e instrutor acessam **Avaliações físicas**. A recepção recebe recusa também ao chamar diretamente os canais do processo principal.

O administrador informa o ID do instrutor responsável. Para instrutores, o processo principal deriva o autor da conta autenticada e rejeita um autor diferente. O aluno precisa estar vinculado a uma aula do instrutor ou a uma avaliação já realizada por ele. O histórico desse aluno inclui avaliações de outros autores, mas cada instrutor só altera ou exclui as próprias. A edição verifica também o aluno de destino.

Informe data civil, peso em kg e altura em cm. Cintura, quadril, braço, coxa e observações são opcionais. Campos vazios ficam ausentes no banco, representados por NULL. Medidas preenchidas precisam ser positivas. A data usa YYYY-MM-DD, e os filtros inicial e final são inclusivos.

A lista apresenta ordem cronológica e aceita filtros por ID do aluno e período. A variação de peso e altura compara avaliações consecutivas do mesmo aluno na página visível. As demais medidas aparecem nos detalhes com suas unidades.

Para demonstrar, use um aluno fictício e registre duas avaliações com peso de 70 kg e 68 kg, altura de 175 cm e datas diferentes. Confira a variação de -2 kg. Abra os detalhes para verificar as medidas ausentes. Para excluir um registro de teste, clique em Excluir e confirme.

Execute `npm run test:avaliacoes` para verificar o serviço pelo IPC real e o formulário do Electron, usando SQLite temporário.
