import { Request, Response } from 'express';
import { env } from '../../config/env.js';

const BASE = env.evolutionApiUrl;
const HEADERS = { apikey: env.evolutionApiKey, 'Content-Type': 'application/json' };

async function evolutionRequest(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function formatPhone(ownerJid?: string): string | null {
  if (!ownerJid) return null;
  // ownerJid: "5531984367833@s.whatsapp.net" → "+55 31 98436-7833"
  const digits = ownerJid.replace(/@.*/, '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Brasil: 55 + DD(2) + número(8 ou 9)
  const ddi = digits.slice(0, 2);
  const dd  = digits.slice(2, 4);
  const num = digits.slice(4);
  const formatted = num.length === 9
    ? `${num.slice(0, 5)}-${num.slice(5)}`
    : `${num.slice(0, 4)}-${num.slice(4)}`;
  return `+${ddi} ${dd} ${formatted}`;
}

/**
 * Cria os handlers de gestão de conexão para uma instância Evolution específica.
 * Usado tanto pela instância de notificações (csp-portal) quanto pelo bot de
 * suporte (csp-suporte), que compartilham a mesma lógica.
 */
export function makeWhatsappControllers(instance: string) {
  async function getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const [stateData, instanceData] = await Promise.allSettled([
        evolutionRequest(`/instance/connectionState/${instance}`),
        evolutionRequest(`/instance/fetchInstances?instanceName=${instance}`),
      ]);

      const state =
        stateData.status === 'fulfilled'
          ? (stateData.value?.instance?.state ?? stateData.value?.state ?? 'unknown')
          : 'unknown';

      let phone: string | null = null;
      if (instanceData.status === 'fulfilled') {
        const arr = Array.isArray(instanceData.value) ? instanceData.value : [instanceData.value];
        const inst = arr.find((i: Record<string, unknown>) => i.name === instance || i.instanceName === instance) ?? arr[0];
        phone = formatPhone(inst?.ownerJid as string | undefined);
      }

      res.json({ state, phone });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao consultar Evolution API' });
    }
  }

  async function getQrCode(_req: Request, res: Response): Promise<void> {
    try {
      const data = await evolutionRequest(`/instance/connect/${instance}`);
      if (data?.base64) {
        res.json({ qrcode: data.base64, state: 'connecting' });
      } else {
        const state = data?.instance?.state ?? 'open';
        res.json({ qrcode: null, state });
      }
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao gerar QR code' });
    }
  }

  async function disconnectInstance(_req: Request, res: Response): Promise<void> {
    try {
      await evolutionRequest(`/instance/logout/${instance}`, 'DELETE');
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao desconectar' });
    }
  }

  async function restartInstance(_req: Request, res: Response): Promise<void> {
    try {
      await evolutionRequest(`/instance/restart/${instance}`, 'PUT');
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao reiniciar instância' });
    }
  }

  return { getStatus, getQrCode, disconnectInstance, restartInstance };
}

// Handlers da instância de notificações (csp-portal) — preservam a API existente.
const portal = makeWhatsappControllers(env.evolutionInstance);
export const getStatus = portal.getStatus;
export const getQrCode = portal.getQrCode;
export const disconnectInstance = portal.disconnectInstance;
export const restartInstance = portal.restartInstance;
