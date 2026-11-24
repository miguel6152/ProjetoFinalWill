# Entrega dos avisos pelo Telegram

## Executar em simulação

Use Node 24 e a instalação do Electron descrita no README. A simulação manual é o padrão. Para a apresentação em PowerShell, abra o projeto e execute:

```powershell
$env:MENSAGENS_MODO = 'simulado'
$env:MENSAGENS_AUTOMATICAS = 'false'
npm run dev
```

A aplicação lê o ambiente ao iniciar. `.env.example` serve como referência; editar esse arquivo não altera o processo em execução.

| Variável | Efeito |
|---|---|
| `MENSAGENS_MODO` | `simulado` registra a tentativa localmente. O valor exato `telegram` habilita o cliente real. |
| `MENSAGENS_AUTOMATICAS` | Somente `true` habilita o processamento automático ao abrir e a cada minuto. Em ambos os modos, administrador e recepção também podem processar um aviso elegível pela central. |
| `TELEGRAM_BOT_TOKEN` | Credencial privada necessária no modo Telegram. Configure no ambiente de quem inicia o desktop. O processo principal captura o valor antes de abrir as janelas. |

## Preparar um destinatário real

1. O responsável cria o bot no **@BotFather** com `/newbot` e guarda o token em local privado. Use um bot e um destinatário de teste para a primeira validação. [Tutorial oficial](https://core.telegram.org/bots/tutorial)
2. O aluno abre uma **conversa privada** com esse bot, toca em **Iniciar** e envia uma frase de conferência combinada diretamente com o operador. O operador identifica o aluno pelo cadastro e confere essa frase na mensagem recebida. O ID a registrar é o `message.chat.id` dessa conversa privada. Telefone e nome exibido pelo Telegram não comprovam o vínculo.
3. Para um bot de teste sem webhook, o responsável pode obter as atualizações com `getUpdates` no próprio computador. Com o token já configurado no ambiente, o exemplo abaixo mostra somente conversas privadas. Use em sessão privada e feche-a depois. Um bot com webhook ativo recebe as atualizações pelo webhook. [Documentação de getUpdates](https://core.telegram.org/bots/api#getupdates)

```powershell
try {
  $updates = Invoke-RestMethod -Method Post -Uri ('https://api.telegram.org/bot' + $env:TELEGRAM_BOT_TOKEN + '/getUpdates') -ErrorAction Stop
  $updates.result | ForEach-Object {
    if ($_.message.chat.type -eq 'private') {
      [pscustomobject]@{ Chat = $_.message.chat.id; Conferencia = $_.message.text }
    }
  }
} catch { Write-Host 'Falha na consulta privada das atualizações do bot.' }
```

4. Em **Avisos → Vínculo e preferência do aluno**, consulte o ID da ficha e confira o nome retornado. Informe o ID do chat privado, confirme a conferência e marque a autorização apenas quando o aluno tiver concordado. Um chat só pode estar associado a um aluno. A mesma seção permite registrar a preferência desativada ou remover o vínculo e a autorização. Os dados completos do chat não são devolvidos na consulta de preferência.
5. Para uma validação real autorizada, reinicie em `MENSAGENS_MODO=telegram`, com o token do próprio bot e o automático desligado. Escolha um aviso novo para o destinatário de teste, abra **Entrega** e confirme o envio. Avisos já simulados têm histórico terminal. A validação desta implementação usou transporte simulado e testes automatizados, sem envio a uma conta real.

## Como a entrega funciona

- **Origem.** O aviso interno da etapa 3 fornece ID, matrícula, data-alvo e marco. Ler um aviso é independente de entregá-lo. O texto enviado identifica a academia e a data de término do plano.
- **Elegibilidade.** Antes de reservar cada tentativa, o processo principal confere matrícula ativa, data-alvo atual, marco vigente, aluno ativo, chat privado, consentimento e configuração. A tela **Entrega** mostra o motivo de inelegibilidade. Revogar a preferência cancela entregas pendentes da matrícula. Um pedido que já chegou ao provedor pode ser entregue mesmo após uma revogação.
- **Reserva.** O SQLite registra a tentativa em transação de escrita. Um índice único permite apenas uma tentativa em processamento por aviso. O HTTP é executado após a reserva. A migração 005 preserva as notificações existentes e acrescenta o histórico de tentativas.
- **Confirmação.** O cliente usa HTTPS, `POST sendMessage`, texto simples e timeout de oito segundos. Para registrar **enviado**, exige resposta de sucesso com ID da mensagem e o mesmo chat privado. A simulação registra **simulado**, deixa vazios o ID externo e a data de envio e não chama a API. [Documentação de sendMessage](https://core.telegram.org/bots/api#sendmessage)
- **Falhas.** O histórico registra modo, número, início, fim, resultado, motivo, espera e ID externo quando disponível. Uma falha temporária confirmada permite até três tentativas por aviso, incluindo a inicial. As esperas antes da segunda e da terceira são de pelo menos um e dois minutos. Para limite de requisições, prevalece o maior prazo entre essa espera e `retry_after`, observado também pelas outras entregas Telegram do banco local. Erros permanentes exigem correção do vínculo, desbloqueio do bot ou ajuste da credencial e confirmação manual dentro do limite. [Parâmetros oficiais de resposta](https://core.telegram.org/bots/api#responseparameters)
- **Resultado incerto.** Timeout, resposta incompleta ou confirmação incompatível podem ocorrer depois de o Telegram aceitar a mensagem. O sistema registra **incerto** e bloqueia uma nova tentativa desse aviso. Uma reserva sem confirmação por dois minutos também passa a incerta na recuperação ao abrir ou no ciclo seguinte. Esse intervalo evita tomar de imediato uma reserva de outra instância ainda em execução. Não há garantia de entrega exatamente uma vez.
- **Disponibilidade.** A fila usa o SQLite e o aplicativo desktop aberto. Depois de reabrir, o gerador atualiza os marcos e o processador reavalia as pendências elegíveis. A entrega automática depende da configuração explícita.

## Roteiro das quatro etapas

1. Entre como recepção ou administrador. Use uma matrícula ativa de teste com término em três dias. Em **Mensalidades**, lance R$ 100,00 com vencimento anterior a hoje.
2. Em **Inadimplência**, filtre pelo aluno, confira os R$ 100,00 e abra **Receber**. Registre a quitação integral e confira a saída da lista.
3. Em **Avisos**, clique em **Verificar agora**. O aviso de término continua elegível mesmo após a quitação. Marque-o como lido e abra **Entrega**.
4. Em modo simulado, configure um vínculo sintético e consentimento de teste. Abra **Entrega → Simular entrega**. Confira a tentativa marcada como **simulado**, sem ID externo. Abrir o histórico de novo não cria outra tentativa.

## Testes

`npm run typecheck`, `npm run build`, `npm run test:entregas` e `npm run test:pagamentos`. A primeira suíte de entrega usa SQLite temporário e respostas controladas no lugar da rede. A suíte de pagamentos também percorre a interface do Electron, o vínculo, a autorização, o histórico e a simulação após a quitação. As demais suítes do projeto cobrem os módulos existentes.
