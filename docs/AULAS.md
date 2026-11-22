# Agenda de aulas

Cada registro representa uma ocorrência. Na tela **Aulas**, consulte por ID do instrutor ou por período. A agenda inclui as aulas que ocupam algum trecho do intervalo consultado. O limite final é exclusivo.

Entre como administrador ou instrutor. Em **Nova aula**, informe o ID do cadastro profissional, modalidade, horários, capacidade e local. Para demonstrar, cadastre uma aula de funcional na sala e outra de dança na praça. Marque a segunda como **Ao ar livre** e informe latitude e longitude. Zero é uma coordenada válida. As duas ocorrências aparecem na agenda e em **Detalhes**. Os horários da tela usam São Paulo e os novos registros são gravados em UTC.

Em **Editar**, altere a situação para cancelar ou concluir a ocorrência. A capacidade precisa comportar todas as inscrições ativas. Para excluir uma aula de teste sem inscrições, clique em **Excluir** e confirme. Qualquer inscrição, inclusive cancelada, preserva o vínculo e bloqueia a exclusão.

O administrador gerencia todas as aulas. A recepção consulta. O instrutor opera somente as próprias aulas. O processo principal verifica a ficha de origem e a de destino ao editar. A consulta meteorológica está prevista para a etapa 5.

Execute `npm run test:aulas` para testar os canais protegidos, o SQLite e a demonstração pela interface.
