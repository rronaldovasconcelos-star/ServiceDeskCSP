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

/**
 * Forma canônica de um número BR para comparação tolerante ao "nono dígito":
 * garante DDI 55 e remove o 9 de celular após o DDD (13 → 12 dígitos). Assim
 * 5531988031221 e 553188031221 são considerados o mesmo número.
 */
function canonicalBr(input: string): string {
  let d = input.replace(/\D/g, '');
  if (!d.startsWith('55')) d = '55' + d;
  if (d.length === 13 && d[4] === '9') d = d.slice(0, 4) + d.slice(5);
  return d;
}

// Conjunto de números ignorados (outros bots), em forma canônica.
const ignoredCanon = new Set(env.botIgnoredNumbers.map(canonicalBr));

// Assinaturas de mensagens emitidas pelo PRÓPRIO sistema (notificações de chamado,
// cadastro, etc.). Quando a linha do bot também é de um admin, esses textos chegam
// como mensagem de entrada e gerariam um loop — então são ignorados.
const SYSTEM_SIGNATURES = [
  'Seu chamado foi aberto',
  'Novo chamado aberto',
  'Status do seu chamado',
  'Seu chamado foi atribuído',
  'responsável pelo seu chamado',
  'Nova mensagem no chamado',
  'Novo cadastro',
  'código de verificação',
  'sua senha do Portal CSP',
  'Chamado aberto com sucesso',
  'Vou abrir este chamado',
];
function looksLikeSystemMessage(text: string): boolean {
  return SYSTEM_SIGNATURES.some((sig) => text.includes(sig));
}

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

    // Ignora notificações do próprio sistema que possam ter chegado à linha do bot
    // (evita loop quando o número do bot também recebe alertas de chamado/cadastro).
    if (looksLikeSystemMessage(text)) {
      console.log('[Bot] mensagem ignorada (notificação do próprio sistema)');
      return;
    }

    const rawNumber = remoteJid.split('@')[0] ?? '';
    const phone = normalizeBrazilPhone(rawNumber);
    if (!phone) {
      console.error('[Bot] remetente com número inválido:', remoteJid);
      return;
    }

    // Ignora outros bots (evita loop bot-a-bot, ex: Sofia). Tolerante ao 9º dígito.
    if (ignoredCanon.has(canonicalBr(phone))) {
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
