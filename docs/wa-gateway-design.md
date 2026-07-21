# WhatsApp Gateway — Design Técnico

> Camada única na frente da Evolution API, na VPS (Coolify), por onde **todos** os
> projetos passam a enviar mensagens. Objetivo: eliminar o padrão de disparo que
> banzia os números (rajada, volume, número frio) com **uma regra central**, sem
> reescrever cada projeto.

---

## 1. Princípio

Hoje cada projeto chama a Evolution direto. O gateway vira o **único ponto de saída**:

```
Portal CSP    ─┐
Bot Suporte   ─┼──►  WA-GATEWAY  ──►  Evolution API  ──►  WhatsApp
Liz / n8n     ─┤    (fila+regras)      (rede interna)
Projeto novo  ─┘
```

Integração por projeto = trocar **uma variável**: `EVOLUTION_API_URL` passa a apontar
para o gateway. O gateway **imita a API da Evolution**, então nenhum código de projeto
muda (é um proxy transparente para tudo que não é envio, e uma fila para o que é envio).

Bônus de segurança: a `apikey` real da Evolution fica **só dentro do gateway**. Os
projetos usam uma chave do gateway (`GW_API_KEY`). Se um projeto vazar, você gira a
chave dele sem tocar na Evolution.

---

## 2. Duas faixas (lanes) — o coração da regra

Nem toda mensagem tem o mesmo risco de ban. O gateway classifica:

| Faixa | Quem usa | Comportamento | Motivo |
|-------|----------|---------------|--------|
| **Transacional** (default) | Bot respondendo quem chamou, OTP, alerta de chamado | **Síncrono**: repassa na hora, sujeito só a um teto de segurança | É resposta a quem iniciou o contato → risco baixo. Precisa de resposta imediata (ex: OTP). |
| **Bulk** | Lembretes em massa, campanhas | **Assíncrono**: enfileira, responde `202` com `jobId`, e faz *drip* com jitter | É o que bane. Precisa de espaçamento, teto diário e warmup. |

**Como o gateway sabe a faixa:**
- Default = **transacional** → projetos existentes funcionam sem alteração nenhuma.
- Envio em lote **opta por bulk** com o header `X-WA-Priority: bulk` (uma linha no
  sender de lote) **ou** chamando `POST /gw/bulk/sendText/:instance`.

> Mesmo na faixa transacional existe um **teto de segurança por instância**. Se um bug
> de loop (como o do `processReminder` sem intervalo) disparar em rajada, o gateway
> segura assim mesmo. Nenhuma faixa tem passe livre.

---

## 3. Modelo de limitação (por instância)

Cada instância (cada um dos 3 bots) tem **fila, contadores e config próprios**.

### 3.1 Token bucket + jitter
- **Transacional:** ~1 msg / 3s, burst 3. Na prática, imediato; só suaviza micro-rajada.
- **Bulk:** 1 msg a cada `random(8–20s)`. Espaçamento aleatório = não parece robô.
- Garantia de **gap mínimo** entre dois envios (nunca dois no mesmo segundo).

### 3.2 Teto diário com warmup (número novo)
Número frio blastando = ban imediato. O teto **cresce com a idade** da instância:

| Idade | Teto/dia (default, configurável) |
|-------|----------------------------------|
| Dia 1 | 20 |
| Dia 2 | 40 |
| Dia 3 | 80 |
| Dia 4 | 160 |
| Dia 5 | 320 |
| Dia 6+ | 500 (teto de regime) |

- Contador reseta à meia-noite (fuso do servidor), persistido.
- `warmupStart` por instância é configurável (marca quando o número entrou em uso).
- Ao **estourar o teto**: bulk fica na fila para o dia seguinte; transacional recebe
  `429` (raro, só em abuso).

### 3.3 Kill-switch / detecção de ban
- Se a Evolution sinalizar bloqueio (`401/403`, `connectionState=close` inesperado,
  corpo de erro de logout), o gateway **pausa a fila daquela instância** e alerta
  (log + webhook/WhatsApp para o admin). Para de martelar número morrendo.
- **Circuit breaker:** N falhas seguidas → abre o circuito por um cooldown.

### 3.4 Anti-conteúdo-idêntico
- Aviso/limite quando o **mesmo texto** vai para mais de K números numa janela.
- Suporte a **spintax** simples (`{Olá|Oi|Bom dia}`) para variar a mensagem no bulk.

---

## 4. API do gateway

### Passthrough transparente (tudo que NÃO é envio)
`/instance/connect/:i`, `/instance/connectionState/:i`, `/instance/restart/:i`,
`/instance/logout/:i`, `fetchInstances`, etc. → **proxy direto** para a Evolution,
sem fila. Assim o painel de conexão de cada projeto continua funcionando igual.

### Envio
| Rota | Faixa | Resposta |
|------|-------|----------|
| `POST /message/sendText/:instance` (sem header) | Transacional | Síncrono — resposta real da Evolution |
| `POST /message/sendText/:instance` + `X-WA-Priority: bulk` | Bulk | `202 { jobId }` |
| `POST /gw/bulk/sendText/:instance` | Bulk | `202 { jobId }` |
| `POST /message/sendMedia/:instance` | idem (mesma lógica) | idem |

### Observabilidade / admin
| Rota | Função |
|------|--------|
| `GET /gw/status` | Por instância: state, enviadas hoje / teto, profundidade da fila, pausada?, último erro |
| `GET /gw/jobs/:jobId` | Status de um envio em lote |
| `POST /gw/instances/:i/pause` \| `/resume` | Controle manual da fila |
| `POST /gw/instances/:i/config` | Ajusta limites/warmup em runtime |

Autenticação: header `x-gw-key: $GW_API_KEY` em tudo. Gateway fica na **rede interna**
do Coolify; opcionalmente sem exposição pública (só n8n/projetos na mesma rede o veem).

---

## 5. Stack e persistência

- **Node + TypeScript + Express** (igual ao resto — fácil de manter).
- **Fila persistente:** recomendo começar com **SQLite (Prisma)** — throughput de
  WhatsApp é baixo por natureza (dezenas/dia, não milhares/s), então um worker único
  em processo com uma tabela `outbox` é suficiente, simples de operar e sem dependência
  nova. Caminho de escala futuro: **Redis + BullMQ** (rate-limit e retries nativos) se
  algum dia precisar de múltiplos workers.
- Tabelas: `outbox` (jobs em fila), `instance_state` (contador diário, warmup, pausa),
  `send_log` (auditoria de tudo que saiu).

---

## 6. Deploy (Coolify)

1. Novo serviço Docker `wa-gateway` no **mesmo projeto/rede** da Evolution.
2. Env do gateway:
   - `EVOLUTION_URL` (interno, ex: `http://evolution:8080`)
   - `EVOLUTION_APIKEY` (a chave real, só aqui)
   - `GW_API_KEY` (chave que os projetos usam)
   - Config de limites/warmup por instância (arquivo ou tabela)
3. Health check + volume para o SQLite.
4. **Firewall (opcional, mais forte):** restringir a Evolution para aceitar só o
   gateway — assim ninguém consegue furar a regra chamando a Evolution direto.

---

## 7. Migração (incremental, sem parar nada)

1. Deploy do gateway apontando para a Evolution.
2. Aponta **um** projeto (Portal CSP) para o gateway → valida conexão e envio.
3. Marca o sender de **lote** dos lembretes com `X-WA-Priority: bulk`.
4. Migra Liz/n8n e o 3º bot (só trocam a URL/host da Evolution).
5. (Opcional) Fecha o firewall da Evolution para só o gateway.

Rollback a qualquer momento = reverter a URL do projeto para a Evolution direta.

---

## 8. O que o gateway NÃO resolve

Ele corta o risco **comportamental** (rajada, volume, número frio, conteúdo idêntico).
Ele **não** torna segura **prospecção fria em massa** para quem não te conhece — isso,
em API não-oficial (Baileys/Evolution), bane de qualquer jeito. Para campanha fria de
verdade, o caminho sustentável é a **WhatsApp Cloud API oficial** (Meta), com templates
aprovados. O gateway e a Cloud API não são excludentes: dá para o gateway ter, no futuro,
um provider "cloud-api" além do "evolution" e rotear por faixa.

---

## 9. Decisões abertas (preciso do seu aval)

1. **Persistência:** SQLite (simples, recomendado) vs Redis/BullMQ (robusto, +1 container).
2. **Limites/warmup:** a tabela do item 3.2 é um default conservador — ajustar aos seus números?
3. **Escopo do repo:** gateway como **projeto/repo separado** (recomendado) ou pasta dentro deste?
4. **Alerta de kill-switch:** para onde? (log só, WhatsApp para seu número, e-mail?)
