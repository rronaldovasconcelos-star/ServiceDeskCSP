import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { makeWhatsappControllers } from '../whatsapp/whatsapp.controller.js';

/**
 * Central de Comando da Liz — agora a Liz roda no n8n (não mais no servidor Node
 * antigo). Config (prompt/contexto) e leads vêm do webhook "Liz Admin API" do n8n;
 * a conexão WhatsApp é gerida direto na Evolution (instância da Liz). O frontend
 * (AgentePage) permanece inalterado.
 */

const ADMIN = `${env.lizAdminUrl}/liz-admin`;

function ensureConfigured(res: Response): boolean {
  if (!env.lizAdminUrl || !env.lizAdminSecret) {
    res.status(503).json({ error: 'Integração com a Liz (n8n) não configurada (LIZ_ADMIN_URL / LIZ_ADMIN_SECRET).' });
    return false;
  }
  return true;
}

/** Chama o webhook admin da Liz no n8n com uma action. */
async function adminAction(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(ADMIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.lizAdminSecret, action, ...extra }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Liz admin ${res.status}: ${text}`);
  const data = text ? JSON.parse(text) : {};
  if (data?.error) throw new Error(data.error);
  return data;
}

function fail(res: Response, err: unknown): void {
  res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao comunicar com a Liz (n8n)' });
}

export async function getStatus(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    const cfg = await adminAction('config-get');
    res.json({
      agent: 'Liz — Colégio Santa Paula',
      uptimeSeconds: 0, // a Liz roda no n8n (sempre ativo); uptime não se aplica
      sessions: 0,
      model: cfg.model ?? 'gpt-4o-mini',
      configUpdatedAt: cfg.updatedAt ?? null,
      filesCount: 0,
    });
  } catch (err) {
    fail(res, err);
  }
}

export async function getConfig(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await adminAction('config-get'));
  } catch (err) {
    fail(res, err);
  }
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    const { systemPrompt, extraContext, model } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (systemPrompt !== undefined) patch.systemPrompt = systemPrompt;
    if (extraContext !== undefined) patch.extraContext = extraContext;
    if (model !== undefined) patch.model = model;
    res.json(await adminAction('config-set', patch));
  } catch (err) {
    fail(res, err);
  }
}

export async function getLeads(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await adminAction('leads'));
  } catch (err) {
    fail(res, err);
  }
}

// ─── Arquivos: gestão ainda não migrada para o n8n ───────────────────────────
export async function listFiles(_req: Request, res: Response): Promise<void> {
  res.json([]);
}

export async function uploadFile(_req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'A gestão de arquivos da Liz ainda não foi migrada para a nova Central.' });
}

export async function deleteFile(_req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'A gestão de arquivos da Liz ainda não foi migrada para a nova Central.' });
}

// ─── Conexão WhatsApp da Liz (Evolution direto) ──────────────────────────────
const lizConn = makeWhatsappControllers(env.lizEvolutionInstance);
export const getConnection = lizConn.getStatus;
export const getConnectionQr = lizConn.getQrCode;
export const disconnect = lizConn.disconnectInstance;
export const restart = lizConn.restartInstance;
