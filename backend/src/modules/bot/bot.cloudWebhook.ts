import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { alreadySeen, dispatchIncoming } from './bot.controller.js';

/**
 * Webhook de entrada da WhatsApp Business Cloud API.
 *
 * Formato completamente diferente do Evolution: a Meta empacota tudo em
 * `entry[].changes[].value.messages[]`, e o mesmo endpoint recebe também os
 * eventos de status de entrega (`statuses`), que ignoramos.
 *
 * Configuração no painel da Meta (App > WhatsApp > Configuration):
 * - Callback URL: `https://api.servicedeskcsp.com.br/api/bot/webhook/cloud/<BOT_WEBHOOK_SECRET>`
 * - Verify token: o mesmo `BOT_WEBHOOK_SECRET`
 * - Assinar o campo **messages**.
 */

/** Mensagem recebida, só com os campos que consumimos. */
interface CloudMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
}

/** Payload da Meta, só com o que consumimos. */
interface CloudWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: { messages?: CloudMessage[] };
    }>;
  }>;
}

/**
 * Extrai o texto de uma mensagem da Cloud API. Além do texto puro, aceita as
 * respostas de botão/lista — que chegam com o rótulo escolhido e são, para o
 * bot, equivalentes a o usuário ter digitado aquilo.
 */
function extractCloudText(msg: CloudMessage): string | null {
  if (!msg) return null;
  if (typeof msg.text?.body === 'string') return msg.text.body;
  if (typeof msg.button?.text === 'string') return msg.button.text;
  const interactive = msg.interactive;
  if (typeof interactive?.button_reply?.title === 'string') return interactive.button_reply.title;
  if (typeof interactive?.list_reply?.title === 'string') return interactive.list_reply.title;
  return null;
}

/**
 * Confere a assinatura `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com o
 * App Secret). Sem `WHATSAPP_CLOUD_APP_SECRET` configurado a checagem é pulada —
 * o segredo na URL continua sendo a barreira. Configure-o em produção: a URL
 * aparece em log de proxy, a assinatura não.
 */
function signatureValid(req: Request): boolean {
  if (!env.cloudApiAppSecret) return true;

  const header = req.get('x-hub-signature-256');
  if (!header?.startsWith('sha256=')) return false;

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;

  const expected = createHmac('sha256', env.cloudApiAppSecret).update(raw).digest();
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Handshake de verificação (GET). A Meta chama uma vez ao salvar a Callback URL
 * e espera o `hub.challenge` de volta em texto puro.
 */
export function cloudWebhookVerify(req: Request, res: Response): void {
  if (!env.botWebhookSecret || req.params.secret !== env.botWebhookSecret) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.botWebhookSecret && typeof challenge === 'string') {
    res.type('text/plain').send(challenge);
    return;
  }
  res.status(403).json({ error: 'verificação falhou' });
}

/**
 * Recebimento de mensagens (POST). Responde 200 imediatamente: se a Meta não
 * receber o 200 em poucos segundos, ela reentrega a mesma mensagem.
 */
export function cloudWebhook(req: Request, res: Response): void {
  if (!env.botEnabled || !env.botWebhookSecret || req.params.secret !== env.botWebhookSecret) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  if (!signatureValid(req)) {
    console.error('[Bot/Cloud] assinatura inválida — payload descartado');
    res.status(401).json({ error: 'assinatura inválida' });
    return;
  }

  res.status(200).json({ ok: true });

  try {
    const body = req.body as CloudWebhookBody;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // `statuses` (entregue/lido) chega no mesmo endpoint — só nos interessa `messages`.
        for (const msg of change.value?.messages ?? []) {
          // Dedupe pelo wamid: reentrega da Meta traz o mesmo id.
          if (msg.id && alreadySeen(msg.id)) continue;

          const text = extractCloudText(msg);
          if (!text?.trim()) {
            // Áudio, imagem, documento: o bot de suporte é só texto.
            console.log(`[Bot/Cloud] mensagem sem texto ignorada (tipo: ${msg.type ?? '?'})`);
            continue;
          }
          if (!msg.from) continue;

          dispatchIncoming(msg.from, text);
        }
      }
    }
  } catch (err) {
    console.error('[Bot/Cloud] payload inválido:', err instanceof Error ? err.message : err);
  }
}
