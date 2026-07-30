# WhatsApp Cloud API — migração do canal do portal

> Última atualização: 2026-07-30. **Repositório público — nenhum segredo aqui.**
> Token, phone_number_id e afins ficam no `.env.production` local e na env do servidor.

## Por que migrar

O número do portal (`csp-portal`, chip 31 99547-8946) foi **banido pela Meta em 23/07/2026**
(`disconnectionReasonCode: 403`). Era um número Baileys — WhatsApp Web não-oficial, via
Evolution. O `wa-gateway` continua fazendo seu papel (pausou a instância e reteve 7 mensagens
em vez de queimar mais), mas ele reduz o risco de ban; não o elimina. Um portal de escola que
manda OTP de cadastro e lembrete a professor não pode depender de um canal que some.

A **Cloud API é o canal oficial da Meta**: o número não é banido por uso legítimo, não cai por
`device_removed`, e não precisa de celular pareado. O preço é a burocracia — WABA verificada e
**todo aviso iniciado por nós exige template aprovado**.

| | Baileys (Evolution) | Cloud API |
|---|---|---|
| Risco de ban | alto | ~nulo em uso legítimo |
| Texto livre iniciado por nós | sim | **não** (só template) |
| Resposta em até 24h | sim | sim, texto livre |
| Passa pelo wa-gateway | sim | não (quem controla o ritmo é a Meta) |
| Custo | zero | por conversa iniciada |

## Estado da implementação (2026-07-30)

Código **pronto e compilando**; falta credencial e aprovação dos templates.

- `backend/src/services/whatsapp/CloudApiProvider.ts` — envio via Graph API.
- `backend/src/services/whatsapp/templates.ts` — catálogo das mensagens (texto + template).
- `backend/src/services/whatsapp/types.ts` — `WhatsAppMessage` carrega as duas formas.
- Os 16 pontos de envio do portal já emitem template. O canal Baileys segue funcionando
  sem nenhuma mudança de comportamento — é só trocar `WHATSAPP_PROVIDER`.

## Passo a passo da implantação

### 1. Meta Business + WABA
1. Business Manager verificado para o **Colégio Santa Paula** (CNPJ, comprovante de endereço).
   A verificação leva de horas a alguns dias.
2. Em *WhatsApp > Introdução*, criar a **WhatsApp Business Account (WABA)**.
3. Adicionar um número de telefone **que não esteja em uso em nenhum WhatsApp** (nem comum
   nem Business). Um número novo, ou o antigo após remover a conta — mas **não use o
   31 99547-8946**: ele está banido e arrastaria o problema para a conta oficial.
4. Anotar o **Phone Number ID** (não é o telefone — é um id numérico) e o **WABA ID**.

### 2. Token permanente
Token de usuário expira em 24h e **não serve**. Gere um token de System User:
1. *Business Settings > Users > System Users* → criar um system user com papel **Admin**.
2. *Add Assets* → dar acesso à WABA (controle total).
3. *Generate New Token* → escolher o app, marcar `whatsapp_business_messaging` e
   `whatsapp_business_management`, **sem expiração**.

### 3. Envs (adicionar no `.env.production`)
```
WHATSAPP_PROVIDER=cloud
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_CLOUD_TOKEN=<token do system user>
# opcionais (defaults abaixo)
WHATSAPP_CLOUD_API_VERSION=v23.0
WHATSAPP_CLOUD_TEMPLATE_LANG=pt_BR
```
As envs `EVOLUTION_*` podem ficar: elas voltam a valer se `WHATSAPP_PROVIDER=evolution`.
O rollback para o canal antigo é trocar essa única variável e reiniciar.

### 4. Cadastrar os templates
Em *WhatsApp Manager > Modelos de mensagem > Criar modelo*, para cada um abaixo:
categoria **Utilidade**, idioma **Português (BR)**. Cole o corpo **exatamente** como está —
a ordem das variáveis é a que o código envia.

> Regras da Meta que os corpos abaixo já respeitam: o texto não pode começar nem terminar
> com variável, as variáveis são numeradas em sequência, e o parâmetro enviado nunca contém
> quebra de linha (o provider achata antes de mandar).

#### `csp_chamado_aberto` — confirmação para o solicitante
```
Seu chamado foi aberto com sucesso no Portal de Chamados.

Chamado: {{1}}
Categoria: {{2}}
Urgência: {{3}}

Você será avisado a cada atualização.
```
Exemplos: `Impressora da secretaria travando` · `TI` · `ALTA`

#### `csp_chamado_novo_gestor` — alerta para admins/gestores
```
Um novo chamado foi aberto no Portal de Chamados.

Chamado: {{1}}
Categoria: {{2}}
Urgência: {{3}}
Solicitante: {{4}}

Acesse o portal para atribuir um responsável.
```
Exemplos: `Impressora da secretaria travando` · `TI` · `ALTA` · `Maria Silva`

#### `csp_chamado_status` — mudança de status
```
Houve uma atualização no seu chamado.

Chamado: {{1}}
Status: {{2}}

{{3}}
```
Exemplos: `Impressora da secretaria travando` · `Concluído` · `Qualquer dúvida, abra um novo chamado.`

#### `csp_chamado_atribuido` — responsável definido
```
Seu chamado teve o responsável atualizado.

Chamado: {{1}}
Responsável: {{2}}

Acompanhe o andamento pelo portal.
```
Exemplos: `Impressora da secretaria travando` · `Carlos Souza`

#### `csp_chamado_comentario` — nova mensagem no chamado
```
Há uma nova mensagem no seu chamado.

Chamado: {{1}}
De: {{2}}
Mensagem: {{3}}

Responda pelo portal.
```
Exemplos: `Impressora da secretaria travando` · `Carlos Souza` · `Passamos aí ainda hoje.`

#### `csp_lembrete_material` — lembrete de envio de material
```
Olá, {{1}}! Este é um lembrete do Portal de Chamados.

Consta que ainda não recebemos: {{2}}

Envie pelo portal, em "Meus Arquivos".
```
Exemplos: `Maria` · `Plano de aula de Matemática — Fundamental I / 3º ano`

#### `csp_codigo_acesso` — OTP de cadastro e de redefinição de senha
```
Seu código de acesso ao Portal de Chamados é {{1}}.

Ele expira em {{2}} minutos. Se você não solicitou, ignore esta mensagem.
```
Exemplos: `123456` · `10`

#### `csp_aviso_portal` — avisos operacionais (suprimentos, manutenção, cadastro pendente)
```
Aviso do Portal de Chamados.

Assunto: {{1}}
Detalhe: {{2}}

Acesse o portal para mais informações.
```
Exemplos: `Novo pedido de suprimento` · `Papel A4 (10 resmas) — urgência ALTA, solicitado por Maria Silva`

### 5. Validar
Com as envs no lugar e ao menos um template **aprovado**:
```bash
# envio direto pela API da Meta (troca <> pelos seus valores)
curl -s -X POST "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"5531984367833","type":"template",
       "template":{"name":"csp_codigo_acesso","language":{"code":"pt_BR"},
       "components":[{"type":"body","parameters":[
         {"type":"text","text":"123456"},{"type":"text","text":"10"}]}]}}'
```
Depois, pelo portal: peça uma redefinição de senha para um usuário de teste e confira o
log do backend. Erro `132001` = template não existe/não aprovado no idioma; `132000` =
número de parâmetros diferente do cadastrado; `131047` = janela de 24h fechada (é o caso
de mandar texto livre sem template).

## O que muda no dia a dia

- **Bot de suporte** (`BOT_ENABLED`): responde a quem escreveu, dentro da janela de 24h —
  segue usando texto livre, sem template. Só que o número passa a ser o mesmo das
  notificações; se o suporte precisar de número próprio, é preciso um segundo phone_number_id.
- **Liz** e demais bots em n8n continuam na Evolution/gateway — esta migração é só do portal.
- **wa-gateway**: sai do caminho do portal. Continua protegendo todo o resto.
- **Custo**: a Meta cobra por conversa iniciada pelo negócio (utilidade). O volume do portal
  é baixo, mas passa a existir uma fatura — vale acompanhar no primeiro mês.

## Pendências relacionadas

Ver `wa-gateway-swap-global.md` para o estado do gateway. Continuam abertas:
alertas do kill-switch, persistência do volume `wa-gateway-data` e a **rotação das
credenciais** (token do Coolify, senha root do VPS, apikey da Evolution).
