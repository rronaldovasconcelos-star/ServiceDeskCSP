// lizApi — "backend" da tela Agente IA agora é o n8n (o backend Node foi descontinuado).
// Shim compatível com axios (.get/.put/.post/.delete) que mapeia /agent/* para os
// webhooks do n8n, injetando a chave de admin. Chaves sensíveis (Evolution/Pinecone/
// Supabase) ficam encapsuladas no n8n — aqui só trafega a chave do painel.

const BASE = 'https://n8nai.iainteligencia.com/webhook';
const KEY_STORAGE = 'liz_admin_key';

export const getKey = (): string => localStorage.getItem(KEY_STORAGE) || '';
export const setKey = (k: string): void => localStorage.setItem(KEY_STORAGE, k.trim());
export const hasKey = (): boolean => !!getKey();
export const clearKey = (): void => localStorage.removeItem(KEY_STORAGE);

async function call(path: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: getKey(), ...payload }),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) { const e: any = new Error('request failed'); e.response = { status: res.status, data }; throw e; }
  if (data && data.error === 'unauthorized') { const e: any = new Error('unauthorized'); e.response = { status: 401, data }; throw e; }
  return data;
}

// ---- RAG ----
export const rag = {
  list: () => call('liz-rag', { action: 'list' }),
  add: (texto: string, categoria = 'manual', fonte = 'painel') => call('liz-rag', { action: 'add', texto, categoria, fonte }),
  remove: (id: string) => call('liz-rag', { action: 'delete', id }),
  uploadPdf: (base64: string, fonte: string) => call('liz-rag', { action: 'upload-pdf', base64, fonte }),
  pendingList: () => call('liz-rag', { action: 'pending-list' }),
  pendingApprove: (id: number) => call('liz-rag', { action: 'pending-approve', id }),
  pendingReject: (id: number) => call('liz-rag', { action: 'pending-reject', id }),
};

// ---- Arquivos (documentos que a Liz pode enviar no WhatsApp) ----
export const files = {
  list: () => call('liz-files', { action: 'list' }),
  add: (base64: string, name: string, mime: string, description: string) =>
    call('liz-files', { action: 'add', base64, name, mime, description }),
  remove: (id: string) => call('liz-files', { action: 'delete', id }),
};

// Link público da página de coleta (token do formulário — só INSERE em fila, não acessa RAG)
export const FORM_LINK = 'https://servicedeskcsp.com.br/base?k=frm_56b5a7cfcd3d1c76e3f9a2b8303bb7f7';

// ---- Relatório ----
export const report = () => call('liz-admin', { action: 'report' });

// ---- Shim axios-like p/ as chamadas existentes da AgentePage ----
const api = {
  async get<T = any>(path: string): Promise<{ data: T }> {
    if (path === '/agent/status') {
      const s = await call('liz-admin', { action: 'status' });
      return { data: { ...s, uptimeSeconds: 0, sessions: s.pausados ?? 0, filesCount: 0 } as T };
    }
    if (path === '/agent/config') return { data: await call('liz-admin', { action: 'config-get' }) };
    if (path === '/agent/leads') return { data: await call('liz-admin', { action: 'leads' }) };
    if (path === '/agent/files') {
      const r = await call('liz-files', { action: 'list' });
      const arr = ((r && r.files) || []).map((f: any) => ({
        id: f.id,
        originalName: f.original_name,
        mimeType: f.mime_type,
        description: f.description ?? '',
        sizeBytes: f.bytes ?? 0,
        uploadedAt: f.created_at,
      }));
      return { data: arr as T };
    }
    if (path === '/agent/connection') return { data: await call('liz-conn', { action: 'status' }) };
    if (path === '/agent/connection/qrcode') return { data: await call('liz-conn', { action: 'qrcode' }) };
    throw new Error(`lizApi GET sem rota: ${path}`);
  },
  async put<T = any>(path: string, body: Record<string, unknown>): Promise<{ data: T }> {
    if (path === '/agent/config') return { data: await call('liz-admin', { action: 'config-set', ...body }) };
    throw new Error(`lizApi PUT sem rota: ${path}`);
  },
  async post<T = any>(path: string, _body?: unknown): Promise<{ data: T }> {
    if (path === '/agent/connection/disconnect') return { data: await call('liz-conn', { action: 'disconnect' }) };
    if (path === '/agent/connection/restart') return { data: await call('liz-conn', { action: 'restart' }) };
    if (path === '/agent/files') {
      const b = (_body || {}) as { base64: string; name: string; mime: string; description: string };
      return { data: await call('liz-files', { action: 'add', base64: b.base64, name: b.name, mime: b.mime, description: b.description }) };
    }
    throw new Error(`lizApi POST sem rota: ${path}`);
  },
  async delete<T = any>(path: string): Promise<{ data: T }> {
    const m = path.match(/^\/agent\/files\/(.+)$/);
    if (m) return { data: await call('liz-files', { action: 'delete', id: decodeURIComponent(m[1]) }) };
    const e: any = new Error('não disponível'); e.response = { status: 503 }; throw e;
  },
};

export default api;
