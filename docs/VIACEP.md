# Integração ViaCEP — frente do Davi

O formulário de cadastro e edição de alunos oferece **Consultar CEP**. A consulta valida o CEP antes de acessar a rede, preenche os dados disponíveis e permite correção/preenchimento manual em qualquer resultado. Não há migration nem dependência nova. A integração usa o `fetch` nativo no Main; os testes injetam transporte simulado sem mudar o comportamento da aplicação instalada.

## Fluxo e segurança

`AlunosTela → ConsultaCepFormulario → preload → endereco:consultar-cep → EnderecoHandler → ViaCepService → HTTPS`.

O canal aceita exclusivamente `{ cep: string }`. São aceitos oito dígitos ou a apresentação `00000-000`, com trim; o serviço normaliza para oito dígitos. URL e opções HTTP não vêm do renderer. Somente o CEP é enviado a `https://viacep.com.br/ws/{cep}/json/`, sem nome, CPF, contato, chaves ou tokens. Redirecionamentos são recusados.

`EnderecoHandler` reutiliza as verificações de janela/origem/frame existentes e exige admin ou recepção. Conferências de sessão, instância/geração, identidade, versão de credencial e perfil são repetidas após HTTP, inclusive em falhas. Logout, redefinição de senha, perda de perfil e encerramento não permitem publicar uma resposta antiga. Instrutor não consulta o ViaCEP.

O prazo padrão é **8 segundos**, incluindo leitura do JSON. `AbortController` cancela a requisição e `Promise.race` garante retorno no prazo mesmo se um transporte de teste ignorar o sinal. O temporizador é liberado ao concluir. Os erros públicos distinguem CEP inválido (`VALIDACAO`), inexistente (`NAO_ENCONTRADO`) e falhas de conexão/HTTP/timeout/resposta (`REDE`), com mensagens claras e sem detalhes internos. Não há repetição automática.

A resposta passa por Zod: CEP deve corresponder ao consultado, campos precisam ter tipos/tamanhos válidos e UF precisa ser válida quando preenchida. `localidade` é mapeada para `cidade`; metadados externos são descartados. `erro: true` (ou a representação textual `"true"`) significa não encontrado. JSON inesperado, UF inválida ou CEP divergente não são usados como endereço.

Contrato externo conferido na [documentação oficial do ViaCEP](https://viacep.com.br/): oito dígitos antes da consulta, resposta de inexistência e nomes dos campos JSON. Dados indisponíveis não são inventados.

## Comportamento do formulário

- Clique em **Consultar CEP** após informar o CEP. Não há consultas automáticas ao digitar ou perder foco.
- Logradouro, bairro, cidade e UF são preenchidos somente quando retornados com conteúdo. Campos ausentes/vazios preservam o valor já informado.
- Número e complemento permanecem sob controle do usuário. O complemento da API não substitui o complemento individual cadastrado.
- Todos os campos continuam editáveis. Salvar e cancelar não dependem da consulta; uma falha não impede cadastro/edição manual.
- Alterar o CEP durante uma consulta faz a interface ignorar seu retorno antigo. Campos editados manualmente durante a espera também não são sobrescritos.
- Se o formulário for salvo, cancelado ou substituído, a resposta pendente não repopula a tela.
- A consulta apenas sugere valores. Persistência acontece pelo CRUD existente, ao clicar em **Salvar**.

## Arquivos

| Arquivo | Motivo |
|---|---|
| `src/shared/tipos/Endereco.ts` | DTO serializável de endereço. |
| `src/services/ViaCepService.ts` | Validação de entrada/resposta, HTTPS fixo, timeout e mapeamento. |
| `src/services/ErroEndereco.ts` | Códigos e mensagens públicas para falhas de CEP. |
| `src/main/ipc/EnderecoHandler.ts` | Canal específico protegido por origem, sessão e perfil, com revalidação após rede. |
| `src/main/Composicao.ts` | Registra/encerra o handler; permite injetar o serviço nos testes exclusivamente pelo Main. |
| `src/shared/ipc/ContratoIpc.ts` | Contrato tipado `endereco:consultar-cep` e capacidade `endereco.consultarCep`. |
| `src/preload/PonteAcademia.ts` | Expõe apenas a consulta específica; não expõe HTTP genérico. |
| `src/renderer/componentes/ConsultaCepFormulario.ts` | Consulta sem bloquear salvamento, preservação de edições manuais e descarte de respostas antigas. |
| `src/renderer/telas/AlunosTela.ts` | Botão e mensagens nos formulários de cadastro/edição. |
| `src/renderer/AplicacaoRenderer.ts` | Passa a capacidade de endereço para a tela de alunos. |
| `tools/TransporteViaCepTeste.ts` | Transporte simulado compartilhado pelas suítes, sem internet. |
| `tools/VerificarViaCep.ts` | Casos do serviço: sucesso, parcial, inválido, inexistente, rede, HTTP, resposta e timeout. |
| `tools/VerificarViaCepIpc.ts` | IPC/preload reais, permissões, erros e revogações durante consulta. |
| `tools/VerificarViaCepInterface.ts` | Formulários reais, correção e persistência manual, falhas e consultas pendentes. |
| `package.json` | Scripts `test:viacep` e `test:viacep-interface`. |
| `tools/BaseRepository.test-d.ts`, `tools/VerificarInfraestrutura.ts`, `tools/VerificarAutenticacaoIpc.ts`, `tools/VerificarSegurancaAutenticacao.ts` | Atualizam as listas explícitas de canais/capacidades para reconhecer a integração. |
| `README.md`, `docs/ARQUITETURA.md`, `docs/ALUNOS.md`, `SEGURANCA.md`, `docs/VIACEP.md` | Registram a integração e os seus limites. |

## Testar e conferir

```powershell
npm run typecheck
npm run build
npm run test:viacep
npm run test:viacep-interface
npm run dev
```

Entre como admin ou recepção, abra **Alunos → Novo aluno** (ou **Editar**), informe `01001-000` e clique em **Consultar CEP**. Confira logradouro/bairro/cidade/UF, complete número/complemento e altere algum campo manualmente antes de salvar. Verifique o endereço persistido em **Detalhes**. O resultado real depende da disponibilidade e dos dados atuais do provedor.

Para conferir o tratamento manual, tente um CEP incompleto: não deve haver consulta. Em caso de CEP inexistente ou indisponibilidade, confira a mensagem e complete o endereço manualmente. Os testes automatizados reproduzem esses cenários sem depender de uma falha real de internet.

As suítes usam respostas sintéticas, SQLite temporário e janelas Electron ocultas. Não abrem `userData` nem acessam a API pública. O timeout de testes é reduzido por injeção no Main; o padrão de produção permanece em 8 segundos. Elas incluem leitura de corpo travada, recuperação após falha, preservação de número/complemento, campos parcialmente retornados, alteração de CEP/edições durante consulta e salvamento sem esperar a rede.

Validação em 17/11/2026: `npm run typecheck`, `npm run build`, `git diff --check` e os **19 scripts `test:*`** do `package.json` passaram com código 0. A rodada inclui as duas suítes novas de ViaCEP e todas as 17 anteriores. Os testes da API externa usaram respostas simuladas; não houve verificação de disponibilidade ao vivo do provedor.

Limites: endereço retornado é uma sugestão; o sistema não comprova residência nem a atualidade do cadastro postal. Planos e matrículas continuam fora desta etapa. Commit e push dependem de autorização separada.
