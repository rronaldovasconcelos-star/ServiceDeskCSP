# WhatsApp Cloud API — migração do canal do portal

> **28/10/2026:** o bot de suporte (entrada de mensagens, `bot.cloudWebhook.ts`, `/api/bot/*`, ponte `/api/bot-bridge`) e o painel do agente foram REMOVIDOS do portal por decisão do Ronaldo. Deste documento continua valendo só a parte de SAÍDA (provider da Cloud API e templates das notificações). Trechos sobre webhook de entrada são históricos.

> Última atualização: 2026-07-30. **Repositório público — nenhum segredo aqui.**
> Token, phone_number_id e afins ficam no `.env.production` local e na env do servidor.

---

## ⏸️ RETOMAR AQUI (handoff de 2026-07-30)

**Onde paramos:** todo o código está pronto, testado e commitado
(`9b2b3ce` envio, `a155296` recebimento + ferramentas). **Nenhuma linha precisa mudar.**
O que falta é inteiramente do lado da Meta — burocracia de conta, não desenvolvimento.

**Estado hoje:** o portal está **sem WhatsApp desde 23/07** (número banido, 403). O canal
segue em `WHATSAPP_PROVIDER=evolution` com a instância `csp-portal` pausada no gateway e
8 mensagens presas na fila. Ninguém recebe OTP de cadastro, lembrete nem aviso de chamado.

### Checklist para ligar (nesta ordem)

- [ ] **1. Business Manager verificado** para o Colégio Santa Paula (CNPJ + comprovante).
      É o passo mais lento — de horas a alguns dias. Comece por ele.
- [ ] **2. WABA criada** e **número novo** adicionado.
      ⚠️ **NÃO use o 31 99547-8946** — está banido; levá-lo para a conta oficial arrasta o problema.
- [ ] **3. Token permanente** de *system user* (token de usuário comum expira em 24h e não serve).
- [ ] **4. Preencher no `.env.production`**: `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_TOKEN`,
      `WHATSAPP_CLOUD_WABA_ID`, `WHATSAPP_CLOUD_APP_SECRET` — **sem** trocar `WHATSAPP_PROVIDER` ainda.
- [ ] **5. Criar os templates**: `cd backend && npm run whatsapp:templates -- --criar`
- [ ] **6. Esperar a aprovação** (minutos a horas). Conferir: `npm run whatsapp:templates`
- [ ] **7. Configurar o webhook** no painel da Meta (seção 5 abaixo) — sem isso o bot não recebe.
- [ ] **8. `npm run whatsapp:check -- <seu numero>`** → precisa sair ✅ verde.
- [ ] **9. Virar a chave**: `WHATSAPP_PROVIDER=cloud` no `.env.production` → `python update.py`.
      Conferir no log do boot: `[WhatsApp] canal oficial (Cloud API) ativo`.
- [ ] **10.** Abrir um chamado de teste e confirmar que a notificação chega.

**Rollback a qualquer momento:** `WHATSAPP_PROVIDER=evolution` + `update.py`. Volta tudo ao
canal antigo sem tocar em código.

### Armadilha ao mexer localmente
O `backend/.env` local aponta para a **Evolution de produção**. Subir `npx tsx src/server.ts`
liga os schedulers e **enfileira lembrete de verdade** no wa-gateway (aconteceu em 30/07: a
fila do `csp-portal` foi de 7 para 8). Ao testar local, use
`WHATSAPP_PROVIDER=mock` ou `REMINDER_SCHEDULER_ENABLED=false`.

### Fora do escopo deste doc, mas aberto
Pendências do gateway em [`wa-gateway-swap-global.md`](./wa-gateway-swap-global.md): alertas
do kill-switch (teriam avisado do ban no dia 23), persistência do volume `wa-gateway-data` e
a **rotação das credenciais** (token do Coolify, senha root do VPS, apikey da Evolution — esta
última está em texto puro no `.env.production`).

---

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

**O código está pronto e testado. O que falta é só do lado da Meta** — credencial e
aprovação dos templates. Nenhuma linha precisa mudar para virar a chave.

| Peça | Arquivo |
|---|---|
| Envio (Graph API) | `backend/src/services/whatsapp/CloudApiProvider.ts` |
| Catálogo das mensagens (texto + template) | `backend/src/services/whatsapp/templates.ts` |
| Corpo dos templates (fonte única) | `backend/src/services/whatsapp/templates.definitions.ts` |
| Recebimento (webhook da Meta) | `backend/src/modules/bot/bot.cloudWebhook.ts` |
| Provisionar templates | `npm run whatsapp:templates -- --criar` |
| Diagnóstico de prontidão | `npm run whatsapp:check` |

Os 16 pontos de envio do portal já emitem template. O canal Baileys segue funcionando sem
nenhuma mudança de comportamento — é só trocar `WHATSAPP_PROVIDER`.

Já validado localmente: payload de template no formato da Meta, achatamento de quebras de
linha nos parâmetros, normalização de telefone, handshake `hub.challenge`, validação de
assinatura, dedupe por `wamid` e descarte de eventos de status.

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
WHATSAPP_CLOUD_WABA_ID=<waba id>          # p/ gerenciar templates
WHATSAPP_CLOUD_APP_SECRET=<app secret>    # valida a assinatura do webhook
# opcionais (defaults abaixo)
WHATSAPP_CLOUD_API_VERSION=v23.0
WHATSAPP_CLOUD_TEMPLATE_LANG=pt_BR
```
As envs `EVOLUTION_*` podem ficar: elas voltam a valer se `WHATSAPP_PROVIDER=evolution`.
O rollback para o canal antigo é trocar essa única variável e reiniciar.

> **Deixe `WHATSAPP_PROVIDER=evolution` até os templates estarem aprovados.** Virar a
> chave antes disso deixa o portal mudo: sem template aprovado, a Meta recusa todo aviso.

### 4. Cadastrar os templates

**Pelo script (recomendado)** — a partir de `backend/`, com `WHATSAPP_CLOUD_WABA_ID` e
`WHATSAPP_CLOUD_TOKEN` no `.env`:
```bash
npm run whatsapp:templates            # mostra o status de cada um
npm run whatsapp:templates -- --criar # cria os que faltam
```
É idempotente — rodar de novo só reporta. Os corpos vêm de
`src/services/whatsapp/templates.definitions.ts`, a mesma fonte que o código usa, então
não há risco de o template cadastrado divergir dos parâmetros enviados.

**À mão**, se preferir: *WhatsApp Manager > Modelos de mensagem > Criar modelo*, para cada
um abaixo, categoria **Utilidade**, idioma **Português (BR)**. Cole o corpo **exatamente**
como está — a ordem das variáveis é a que o código envia.

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

### 5. Webhook de entrada (bot de suporte)

Sem isso o bot para de receber: o formato da Meta não tem nada a ver com o do Evolution.
Em *App > WhatsApp > Configuration > Webhook*:

- **Callback URL**: `https://api.servicedeskcsp.com.br/api/bot/webhook/cloud/<BOT_WEBHOOK_SECRET>`
- **Verify token**: o mesmo `BOT_WEBHOOK_SECRET`
- **Webhook fields**: assinar **messages**

A Meta faz um GET de verificação ao salvar; o backend devolve o `hub.challenge`
automaticamente. O POST valida `X-Hub-Signature-256` quando `WHATSAPP_CLOUD_APP_SECRET`
está setado (recomendado — a URL vaza em log de proxy, a assinatura não).

O endpoint antigo (`/api/bot/webhook/<secret>`, formato Evolution) continua ativo: os dois
canais podem conviver durante a transição.

### 6. Validar
```bash
npm run whatsapp:check                    # confere envs, número, templates
npm run whatsapp:check -- 5531984367833   # + envia um template de teste
```
O script responde objetivamente se dá para virar a chave, e sai com código ≠ 0 se não.

Depois, pelo portal: peça uma redefinição de senha para um usuário de teste e confira o
log do backend. Erros comuns da Meta: `132001` = template não existe/não aprovado no
idioma; `132000` = número de parâmetros diferente do cadastrado; `131047` = janela de 24h
fechada (é o caso de mandar texto livre sem template); `190` = token expirado (você gerou
um token de usuário em vez do de system user).

### 7. Virar a chave
Com o check verde: `WHATSAPP_PROVIDER=cloud` no `.env.production` → `python update.py`.
O backend loga `[WhatsApp] canal oficial (Cloud API) ativo` no boot; se faltar env, ele
avisa em vez de falhar silenciosamente para o mock.

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
