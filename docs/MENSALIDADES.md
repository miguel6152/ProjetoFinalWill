# Mensalidades e recebimentos

## Demonstração com R$ 100,00

1. Entre como administrador ou recepção. Em **Matrículas**, consulte o ID de uma matrícula de teste. Anote também o ID do aluno.
2. Abra **Mensalidades → Lançar mensalidade**. Informe o ID da matrícula, uma competência livre, um vencimento válido e o valor `100,00`. Ao salvar, confira o nome do aluno, a situação pendente e **R$ 100,00** nos detalhes.
3. Filtre pelo ID do aluno, competência e situação pendente. Abra **Detalhes**, informe a data do recebimento, escolha Pix e clique em **Confirmar recebimento de R$ 100,00**.
4. A cobrança sai do filtro de pendentes. Selecione **Pago** e filtre novamente. Os detalhes mostram o valor, a data e o meio de pagamento. Ao fechar e reabrir o aplicativo, a quitação continua disponível para consulta.

## Regras do lançamento

A matrícula registra vigência e valor contratado. O plano registra a duração de 1, 3 ou 12 meses. O grupo ainda precisa definir se o preço cobre o período inteiro, o parcelamento e o calendário de cobrança. Por isso, cada lançamento é manual, com competência, vencimento e valor explícitos. O operador escolhe uma data existente no calendário, inclusive em fevereiro. O sistema rejeita datas impossíveis.

A tabela existente `pagamentos` representa a obrigação desde seu lançamento. O SQLite garante uma linha por matrícula e competência. O valor devido permanece em centavos inteiros, independente de mudanças no plano. Este fluxo exige valor positivo. Registros históricos, inclusive zerados e cancelados, continuam consultáveis.

Quitar significa registrar o recebimento integral da obrigação. O operador escolhe dinheiro, Pix, cartão ou transferência. A baixa altera a situação de pendente para pago e registra a data e o meio na mesma transação. A data civil informada é normalizada em `pago_em` com horário UTC 00:00 para preservar o dia escolhido; esse horário é uma convenção de armazenamento. A tela exibe o dia registrado. `atualizado_em` registra o instante efetivo da operação.

Cancelar ou encerrar a matrícula preserva os lançamentos existentes. Criar, quitar, editar ou cancelar uma mensalidade exige uma matrícula/registro existente; uma mudança de situação da matrícula não gera cobranças, estornos nem baixas automáticas. A política sobre parcelas futuras após cancelamento ou encerramento permanece pendente. Somente mensalidades pendentes podem ser editadas ou canceladas; editar exige uma referência atual do registro, e cancelar exige motivo de 5 a 500 caracteres (após trim) e grava instante e usuário responsável. Pagamentos pagos ou cancelados não podem ser alterados pelas operações disponíveis no aplicativo, nem removidos fisicamente. A política de correção ou estorno de um recebimento pago depende de definição do grupo.

## Como explicar o código

- `PagamentosTela` coleta os dados, reaproveita a conversão de reais para centavos e apresenta os resultados.
- `PonteAcademia` oferece sete métodos tipados: `inadimplentes`, `criar`, `listar`, `obter`, `quitar`, `atualizar` e `cancelar`. `PagamentoHandler` confirma a origem da chamada e devolve respostas seguras.
- `PagamentoService.executar` verifica sessão, perfil, datas, valor e matrícula antes de chamar a operação correspondente.
- `PagamentoRepository` atualiza somente uma linha pendente para edição, quitação ou cancelamento. Uma cobrança finalizada é protegida por triggers e não pode ser removida fisicamente.
- `npm run test:pagamentos` exercita o fluxo com Electron e um banco temporário, incluindo perfis, chamadas simultâneas, filtros, formulários e persistência.
