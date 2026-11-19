# Central de avisos de vencimento

## Qual data gera o aviso

A central acompanha o término da vigência de matrículas ativas (`matriculas.data_fim`), inclusive de alunos com plano gratuito ou sem mensalidade em aberto. O vínculo com o aluno vem da matrícula. O vencimento de uma cobrança pertence ao módulo de inadimplência.

O processo principal usa a data civil de São Paulo (`America/Sao_Paulo`), a mesma do relatório de inadimplência. Os marcos estão centralizados em `AvisosService`:

| Dias que faltam até o término | Marco gerado se ainda faltar esse registro |
|---|---|
| Mais de 7 | Nenhum |
| 7 a 4 | 7 dias antes |
| 3 a 1 | 3 dias antes |
| 0 | No dia do término |
| Após o término | Nenhum. Os avisos dessa vigência passam ao histórico. |

**Exemplo.** Uma matrícula termina em 10/12. O aplicativo ficou fechado nos dias 03/12 e 07/12. Ao abrir em 08/12, gera apenas o aviso do marco de três dias, com data-alvo 10/12 e criação registrada em 08/12. A coluna *Antecedência prevista* identifica o marco da política.

## Execução e histórico

A verificação acontece na inicialização, a cada 30 minutos de aplicativo aberto e pelo botão **Verificar agora**. Com o aplicativo fechado, o processamento aguarda a próxima abertura. Administrador e recepção podem consultar, verificar e marcar como lido. A leitura é compartilhada pela equipe.

Cada verificação roda em uma transação de escrita do SQLite. A chave única combina categoria, matrícula, término e marco. Reiniciar ou clicar novamente preserva o registro já criado. Quando chega um marco mais recente, o anterior passa ao histórico. Mudanças de data final, cancelamento ou encerramento invalidam os avisos antigos da matrícula na própria transação da alteração. Uma nova data de término pode gerar avisos próprios quando entrar na janela. O filtro **Invalidados** permite consultar o histórico, inclusive a leitura anterior. O filtro **Lidos** inclui avisos lidos posteriormente invalidados.

## Ponto de integração da etapa de mensagens

`AvisosService.verificar` identifica eventos de vigência. O contrato TypeScript `EventoVencimento` contém matrícula, tipo, data-alvo e antecedência. `NotificacaoRepository.registrar` persiste o evento idempotentemente. A migração 004 acrescenta campos anuláveis e preserva os registros existentes. Registros antigos sem data-alvo continuam no banco e ficam fora da central.

Para a etapa 4, a origem são os eventos internos válidos de `notificacoes` com `canal='interno'`, `invalidado_em IS NULL`, data-alvo preenchida e situação de entrega pendente. O ID e a chave de deduplicação identificam o evento para a futura entrega. A etapa de mensagens deverá revalidar vigência, consentimento e destino antes de reservar ou enviar. A leitura usa exclusivamente `lido_em`. A situação de entrega, as tentativas, a confirmação externa e `enviada_em` têm campos próprios. A etapa atual não aciona provedor.

## Demonstração

1. Entre como administrador ou recepção. Em **Matrículas**, use uma matrícula ativa de teste com término em três dias. Pode ser um aluno sem dívida.
2. Abra **Avisos → Verificar agora**. Filtre pelo nome e confira o término do plano e o marco de três dias. Clique novamente e confira **Novos avisos: 0**.
3. Clique em **Marcar como lido** e selecione **Lidos → Filtrar**.
4. Para demonstrar o histórico, cancele a matrícula de teste. Volte à central e consulte **Invalidados**.

`npm run test:avisos` cobre migração, concorrência com duas conexões, reinício, dias perdidos, marcos, data alterada, cancelamento, leitura e ciclo do timer. `npm run test:pagamentos` também exercita a central pelo Electron, incluindo verificação manual, restrição de perfil e leitura sem envio.
