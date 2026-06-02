import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { handleIncomingMessage } from './bot.conversation.js';

/** Extrai o texto de uma mensagem Evolution (conversation ou extendedTextMessage). */
function extractText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  if (typeof message.conversation === 'string') return message.conversation;
  const ext = message.extendedTextMessage as { text?: unknown } | undefined;
  if (ext && typeof ext.text === 'string') return ext.text;
  return null;
}

// Dedupe de entregas duplicadas do Baileys/Evolution (mesmo message.id chega 2x+).
// Set em memória com janela limitada — suficiente para um único container.
const seenIds: string[] = [];
const seenSet = new Set<string>();
function alreadySeen(id: string): boolean {
  if (seenSet.has(id)) return true;
  seenSet.add(id);
  seenIds.push(id);
  if (seenIds.length > 1000) {
    const old = seenIds.shift();
    if (old) seenSet.delete(old);
  }
  return false;
}

// Conjunto de números ignorados (outros bots), normalizado só com dígitos.
const ignoredDigits = new Set(env.botIgnoredNumbers);

/**
 * Webhook do Evolution (evento `messages.upsert`) para o bot de suporte.
 * Responde 200 imediatamente e processa a mensagem de forma assíncrona, para
 * não estourar o timeout do Evolution nem provocar reentregas.
 */
export function botWebhook(req: Request, res: Response): void {
  // Valida o segredo na URL e se o bot está habilitado.
  if (!env.botEnabled || !env.botWebhookSecret || req.params.secret !== env.botWebhookSecret) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  // Reconhece o recebimento imediatamente.
  res.status(200).json({ ok: true });

  try {
    const body = req.body as {
      event?: string;
      data?: {
        key?: { remoteJid?: string; fromMe?: boolean; id?: string };
        message?: Record<string, unknown>;
      };
    };

    const event = body.event ?? '';
    if (event && event !== 'messages.upsert') return; // ignora outros eventos

    const data = body.data;
    const key = data?.key;
    if (!key || key.fromMe) return; // ignora mensagens enviadas por nós
    const remoteJid = key.remoteJid ?? '';
    if (!remoteJid || remoteJid.endsWith('@g.us')) return; // ignora grupos

    // Dedupe: a mesma mensagem pode ser entregue várias vezes (Baileys).
    if (key.id && alreadySeen(key.id)) return;

    const text = extractText(data?.message);
    if (!text || !text.trim()) return; // ignora mensagens sem texto (mídia, etc.)

    const rawNumber = remoteJid.split('@')[0] ?? '';
    const phone = normalizeBrazilPhone(rawNumber);
    if (!phone) {
      console.error('[Bot] remetente com número inválido:', remoteJid);
      return;
    }

    // Ignora outros bots (evita loop bot-a-bot, ex: Sofia).
    if (ignoredDigits.has(phone.replace(/\D/g, ''))) {
      console.log('[Bot] número ignorado (lista de bots):', phone);
      return;
    }

    // Processamento assíncrono — erros são apenas logados.
    void handleIncomingMessage(phone, text.trim()).catch((err) => {
      console.error('[Bot] erro ao processar mensagem:', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.error('[Bot] webhook payload inválido:', err instanceof Error ? err.message : err);
  }
}
