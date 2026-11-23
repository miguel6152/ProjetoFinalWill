# Previsão para aulas externas

Em **Aulas**, clique em **Previsão de chuva** na linha de uma ocorrência externa. A tela informa probabilidade em %, precipitação em mm, intervalo horário, instante da consulta e origem. Dados ausentes aparecem como indisponíveis.

O Main recebe somente `{ id }` pelo canal `clima:consultar-aula`. Reutiliza as permissões de consulta de aulas, lê coordenadas e horários no banco e confere novamente a sessão e a versão da aula após a consulta. Admin e recepção consultam todas. Instrutor consulta as próprias aulas.

O endereço é `https://api.open-meteo.com/v1/forecast`, com `hourly=precipitation_probability,precipitation`, `precipitation_unit=mm`, `timezone=UTC`, `timeformat=unixtime` e `forecast_days=16`. O renderer apresenta os horários em America/Sao_Paulo.

Ambos os valores horários representam a hora anterior ao timestamp do provedor. A implementação seleciona cada intervalo que cruza a aula. Uma aula das 09h30 às 10h30 exibe os intervalos 09h–10h e 10h–11h, com seus valores completos, sem estimar frações de chuva.

O limiar demonstrativo é 60%, configurável no ambiente do Main por `CLIMA_LIMIAR_PERCENTUAL` entre 0 e 100. O alerta aparece quando qualquer intervalo completo atinge o limiar. Se faltar um valor, o alerta fica indisponível. A consulta informa risco sem modificar a situação da aula.

O cache dura cinco minutos e armazena até cem consultas completas, por coordenadas e intervalo exato da aula. A origem exibida é provedor, cache, simulação ou local. O prazo de consulta é oito segundos. Datas fora dos dezesseis dias UTC solicitados retornam indisponibilidade, e a resposta também precisa conter todas as horas necessárias.

A simulação só é injetada pelos testes no Main. `npm run test:clima` verifica regras, IPC e formulário. A demonstração automatizada apresenta uma aula externa com 80% e 2 mm, identificada como simulação. Para demonstrar dados reais, cadastre uma aula externa dentro do horizonte, consulte e repita a consulta para conferir o cache.

Documentação oficial consultada em 22/11/2026. [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
