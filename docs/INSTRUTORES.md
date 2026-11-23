# Cadastro de instrutores

Em **Usuários**, o administrador cria uma conta ativa com perfil instrutor e consulta o ID nos detalhes. Em **Instrutores → Novo instrutor**, informa esse ID, nome, e-mail, telefone e especialidade. O banco gera outro identificador para o cadastro profissional. Aulas e avaliações usam o ID do instrutor. O login usa a conta vinculada.

Para demonstrar, crie uma conta fictícia, cadastre a instrutora Ana com especialidade Dança, edite a especialidade para Funcional e abra **Detalhes**. Confira os dois IDs. Entre com a conta de Ana e abra **Instrutores** para ver apenas seu cadastro.

Recepção pode pesquisar e consultar. Somente administradores criam, editam e confirmam exclusões. Aulas ou avaliações vinculadas impedem a exclusão. O campo ativo do cadastro permite desativar o instrutor preservando seu histórico. Enquanto houver vínculo, o módulo de usuários protege a conta contra desativação e troca para perfil incompatível.

Execute `npm run test:instrutores` para verificar as regras e repetir o fluxo pela interface em um banco temporário.
