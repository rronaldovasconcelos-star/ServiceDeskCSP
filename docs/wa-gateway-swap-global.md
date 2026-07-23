# wa-gateway — Swap Global (estado e como retomar)

> Última atualização: 2026-07-22. Documento de handoff: registra onde paramos, como
> validar, como reverter e o que falta. **Repositório público — nenhum segredo aqui.**
> Segredos (chaves, senha root, apikey) ficam em `.deploy.env` local, na config do
> Coolify e no gerenciador de segredos — nunca neste arquivo.

## O problema que isso resolve
Os números WhatsApp da Evolution (Baileys / WhatsApp Web não-oficial) eram banidos com
frequência. Causa: número frio + disparo em rajada + volume. Agravado no portal por um
loop de lembretes sem intervalo. Solução: um **gateway único na frente da Evolution** que
aplica pacing, fila, warmup e kill-switch, e por onde **todos os projetos** passam.

Design detalhado: [`wa-gateway-design.md`](./wa-gateway-design.md).
Código do gateway: repo separado `github.com/rronaldovasconcelos-star/wa-gateway` (branch `master`).

## Estado atual (2026-07-22): SWAP GLOBAL CONCLUÍDO ✅
- O domínio **`evolution.iainteligencia.com` agora passa pelo gateway** (flip via Traefik).
  Todos os clientes (n8n, Chatwoot, todos os bots) estão protegidos **sem nenhuma mudança
  neles** — a autenticação de chave dupla aceita a apikey da Evolution que já enviam.
- O gateway intercepta `/message/sendText/:instance` e `/message/sendMedia/:instance`
  (faixa transacional: pacing + kill-switch + teto anti-loop). Todo o resto é proxy
  transparente para a Evolution interna.
- Domínio próprio do gateway: `wa-gateway.iainteligencia.com` (usado pelo backend do CSP
  via `EVOLUTION_API_URL`).
- Validado em produção: 5 mensagens do portal saíram pelo gateway com 0 falhas.

### ⛔ Bloqueio aberto (2026-07-22)
O número dedicado que estava no `csp-portal` **foi queimado (banido pela Meta)**, com pedido
de avaliação/apelação em curso. **Não enviar por ele durante a apelação** (mais atividade
piora a análise). Próxima decisão pendente (ver abaixo): migrar o CSP para **WhatsApp Cloud
API oficial** (durável) ou conectar **chip novo** com warmup (rápido, mas segue no Baileys).

## Como funciona a proteção (resumo)
1. **Pacing** por número (balde de tokens): ~1 msg / 3s, folga de 3. Segura rajada/loop.
2. **Duas faixas**: transacional (reativo, sai na hora com pacing) vs **bulk** (fila com
   drip aleatório de 8–20s entre mensagens). CSP usa bulk nos lembretes/campanhas.
3. **Warmup** (teto diário por idade da instância): 20 → 40 → 80 → 160 → 320 → 500/dia.
4. **Teto anti-loop** na faixa transacional (alto, ~5000/dia) só pra conter loop desgovernado.
5. **Kill-switch**: após ~5 falhas seguidas ou sinal de ban (HTTP 4xx), **pausa a instância**
   automaticamente e (se configurado) alerta o admin.
6. **Isolamento por número** + auditoria (`SendLog`).

**NÃO resolve** prospecção fria em massa — pra isso, só WhatsApp Cloud API oficial.

## Infra (onde as coisas estão)
- **VPS**: Hostinger KVM4, Ubuntu 24.04, IP `2.24.115.74`, id Hostinger `1689607`.
  SSH: `ssh root@2.24.115.74` (senha em `.deploy.env` / gerenciador — **rotacionar**).
- **Coolify**: `https://coolify.iainteligencia.com`. App do gateway uuid
  `bsnbixaah8ohzo82wfw1aqnv`, projeto `secretaria-escola`, env `production`.
  Build pack = **dockercompose**, arquivo `/docker-compose.yml`.
- **Gateway**: `https://wa-gateway.iainteligencia.com` (health em `/health`, admin em `/gw/*`).
- **Evolution** (standalone, fora do Coolify): container `evolution_api`, porta interna 8080,
  redes `agente-pessoal-net` + `insurance-bot_insurance_net`. Não publica no host.
- **Traefik** = `coolify-proxy` (nas redes `coolify` e `agente-pessoal-net`), providers docker
  (`exposedbydefault=false`, sem constraint) + file (`/traefik/dynamic/`).

## Como o flip foi feito (Traefik)
O `docker-compose.yml` do repo do gateway declara redes externas `coolify` +
`agente-pessoal-net` e as labels dos routers:
- `wa-evo` → `Host(evolution.iainteligencia.com)`, **priority 1000** (a Evolution não define
  prioridade, então perde). É o flip.
- `wa-gw` → `Host(wa-gateway.iainteligencia.com)`, priority 1000 (domínio próprio, usado pelo CSP).
- Ambos apontam pro service `wa-evo-svc` (porta 8090).
Env `EVOLUTION_URL` = `http://evolution_api:8080` (interno — se apontar pro domínio público,
o gateway chama a si mesmo em loop).

> Após cada deploy, o Traefik leva ~1 min pra registrar o container novo; nesse intervalo o
> domínio cai temporariamente pra Evolution real (comportamento seguro).

## Como validar que está no ar
```bash
# 1) domínio próprio (CSP) responde o gateway
curl -s https://wa-gateway.iainteligencia.com/health           # -> {"ok":true}

# 2) FLIP: domínio da Evolution responde o gateway (apikey = GW_API_KEY ou apikey Evolution)
curl -s -H "apikey: <CHAVE>" https://evolution.iainteligencia.com/gw/status   # -> {"instances":[...]}

# 3) cliente segue funcionando através do flip
curl -s -H "apikey: <CHAVE>" https://evolution.iainteligencia.com/instance/connectionState/<instancia>
```
Se o passo 2 devolver `404 Cannot GET /gw/status` no formato da Evolution, o flip **não** está
ativo (domínio ainda na Evolution real).

## Rollback (reverter o flip)
Remover as labels `wa-evo` do `docker-compose.yml` do gateway (ou baixar a `priority`) e
redeployar. O Traefik volta a rotear `evolution.iainteligencia.com` pra Evolution na hora.
Nada nos clientes precisa mudar.

## Operação do gateway (rotas admin)
- `GET  /gw/status` — estado por instância (pausa, warmup, teto, fila).
- `POST /gw/instances/:instance/pause` — pausa manual.
- `POST /gw/instances/:instance/resume` — despausa (e zera falhas).
Todas exigem header `apikey` (GW_API_KEY ou apikey da Evolution).

## Pendências (retomar aqui)
1. **[BLOQUEIO] Número do csp-portal queimado / apelação Meta.** Decidir o rumo:
   - **Cloud API oficial** (recomendado p/ portal de escola — durável, não queima), OU
   - **chip novo** no Evolution com warmup (rápido, segue no Baileys).
   Enquanto isso: **pausar o csp-portal no gateway** (`POST /gw/instances/csp-portal/pause`)
   pra não enviar durante a apelação.
2. **Ligar alertas do kill-switch**: setar `ALERT_INSTANCE` + `ALERT_TO` na env do Coolify
   (depende de ter um número são conectado).
3. **Volume persistente**: `wa-gateway-data` é recriado a cada troca grande de deploy; garantir
   que o storage do Coolify persiste (senão warmup/fila zeram no redeploy).
4. **🔒 Segurança — rotacionar credenciais que passaram por chat/reset**: token do Coolify,
   senha root do VPS e apikey da Evolution.
5. **Estabilidade da sessão**: número caía de `open` pra `close` (sintoma do ban, não do gateway).

## Integração do CSP com o gateway (neste repo)
- `backend/src/services/whatsapp/EvolutionProvider.ts` — envia; marca `X-WA-Priority: bulk` quando `opts.bulk`.
- `backend/src/services/whatsapp/index.ts` — `sendWhatsAppBulk()` para lembretes/campanhas.
- `backend/src/modules/reminders/reminders.service.ts` — usa o envio bulk.
- Config: `EVOLUTION_API_URL=https://wa-gateway.iainteligencia.com` e `EVOLUTION_API_KEY=<chave do gateway>`
  no `.env.production` (deploy via `update.py`).
