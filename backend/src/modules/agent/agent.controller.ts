import { Request, Response } from 'express';
import { env } from '../../config/env.js';

const BASE = env.agentAdminUrl;
const SECRET = env.agentAdminSecret;

function ensureConfigured(res: Response): boolean {
  if (!BASE || !SECRET) {
    res.status(503).json({ error: 'Integração com o agente não configurada (AGENT_ADMIN_URL / AGENT_ADMIN_SECRET).' });
    return false;
  }
  return true;
}

/** Chamada JSON à API admin do bot, injetando o segredo compartilhado. */
async function agentRequest(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-admin-secret': SECRET,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Agent ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function fail(res: Response, err: unknown): void {
  res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao comunicar com o agente' });
}

export async function getStatus(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/status'));
  } catch (err) {
    fail(res, err);
  }
}

export async function getConfig(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/config'));
  } catch (err) {
    fail(res, err);
  }
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    const { systemPrompt, extraContext, model } = req.body ?? {};
    res.json(await agentRequest('/admin/config', 'PUT', { systemPrompt, extraContext, model }));
  } catch (err) {
    fail(res, err);
  }
}

export async function listFiles(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/files'));
  } catch (err) {
    fail(res, err);
  }
}

export async function uploadFile(req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }
  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    form.append('file', blob, file.originalname);
    form.append('description', (req.body?.description as string) ?? '');

    const r = await fetch(`${BASE}/admin/files`, {
      method: 'POST',
      headers: { 'x-admin-secret': SECRET },
      body: form,
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) throw new Error(`Agent ${r.status}: ${text}`);
    res.status(201).json(text ? JSON.parse(text) : {});
  } catch (err) {
    fail(res, err);
  }
}

export async function deleteFile(req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    const { id } = req.params;
    res.json(await agentRequest(`/admin/files/${id}`, 'DELETE'));
  } catch (err) {
    fail(res, err);
  }
}

// ─── Conexão WhatsApp da Sofia ───────────────────────────────────────────────

export async function getConnection(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/connection'));
  } catch (err) {
    fail(res, err);
  }
}

export async function getConnectionQr(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/connection/qrcode'));
  } catch (err) {
    fail(res, err);
  }
}

export async function disconnect(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/connection/disconnect', 'POST'));
  } catch (err) {
    fail(res, err);
  }
}

export async function restart(_req: Request, res: Response): Promise<void> {
  if (!ensureConfigured(res)) return;
  try {
    res.json(await agentRequest('/admin/connection/restart', 'POST'));
  } catch (err) {
    fail(res, err);
  }
}
