/**
 * WebDAV mínimo para o Office instalado abrir e salvar arquivos do repositório
 * sem "baixar, editar, subir".
 *
 * O portal emite `ms-word:ofe|u|https://<api>/api/dav/<token>/<nome>` (ver
 * openOfficeSession). O Word/Excel/PowerPoint então conversa com este router:
 *
 *   OPTIONS   → anuncia DAV (classe 1 e 2) e `MS-Author-Via: DAV`
 *   HEAD/GET  → o conteúdo do arquivo (pelo storage: disco ou Drive)
 *   PROPFIND  → tamanho, data, tipo e suporte a lock (do arquivo ou da "pasta")
 *   LOCK      → lock exclusivo em memória (um editor por vez; outro usuário → 423)
 *   PUT       → grava o conteúdo de volta no MESMO arquivo (saveFromOffice)
 *   UNLOCK    → libera o lock
 *   PROPPATCH → aceita e ignora (o Office tenta gravar atributos do Windows)
 *   demais    → 403
 *
 * Autenticação: o token no caminho é um JWT de escopo `dav` preso a um arquivo e
 * a um usuário (o Office não envia o Bearer do portal). NUNCA responder
 * `WWW-Authenticate`: o Office abriria uma caixa de senha que não existe.
 *
 * Montado ANTES do cors e do express.json (ver app.ts): o Office não manda
 * Origin e o corpo do PUT é binário.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Request, Response, Router } from 'express';
import { storage } from '../../services/storage/index.js';
import {
  FileErro, fileForOffice, officeDavPath, saveFromOffice, verifyOfficeToken, type OfficeTokenPayload,
} from './files.service.js';

const DAV_HEADERS: Record<string, string> = {
  DAV: '1,2',
  'MS-Author-Via': 'DAV',
  Allow: 'OPTIONS, GET, HEAD, PUT, PROPFIND, PROPPATCH, LOCK, UNLOCK',
  'Cache-Control': 'no-cache, no-store',
};

/** Lock exclusivo por arquivo. Expira sozinho; o Office renova enquanto o documento está aberto. */
interface Lock { token: string; owner: string; ownerName: string; until: number }
const locks = new Map<string, Lock>();
const LOCK_MAX_SECONDS = 3600;

function lockAtivo(fileId: string): Lock | null {
  const l = locks.get(fileId);
  if (!l) return null;
  if (l.until <= Date.now()) { locks.delete(fileId); return null; }
  return l;
}

/** Para testes: zera os locks em memória. */
export function resetDavLocks(): void { locks.clear(); }

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setDavHeaders(res: Response): void {
  for (const [k, v] of Object.entries(DAV_HEADERS)) res.setHeader(k, v);
}

function timeoutPedido(req: Request): number {
  const m = /Second-(\d+)/i.exec(String(req.headers.timeout ?? ''));
  const s = m ? Number(m[1]) : LOCK_MAX_SECONDS;
  return Math.min(Math.max(s, 60), LOCK_MAX_SECONDS);
}

function etagDe(file: { id: string; sizeBytes: number; lastEditedAt: Date | null; uploadedAt: Date }): string {
  const base = `${file.id}:${file.sizeBytes}:${(file.lastEditedAt ?? file.uploadedAt).getTime()}`;
  return `"${crypto.createHash('sha1').update(base).digest('hex').slice(0, 16)}"`;
}

function propArquivo(href: string, file: { originalName: string; sizeBytes: number; mimeType: string; lastEditedAt: Date | null; uploadedAt: Date; id: string }, lock: Lock | null): string {
  const mod = (file.lastEditedAt ?? file.uploadedAt).toUTCString();
  return `<D:response><D:href>${xmlEscape(href)}</D:href><D:propstat><D:prop>` +
    `<D:displayname>${xmlEscape(file.originalName)}</D:displayname>` +
    `<D:getcontentlength>${file.sizeBytes}</D:getcontentlength>` +
    `<D:getcontenttype>${xmlEscape(file.mimeType)}</D:getcontenttype>` +
    `<D:getlastmodified>${mod}</D:getlastmodified>` +
    `<D:creationdate>${file.uploadedAt.toISOString()}</D:creationdate>` +
    `<D:getetag>${etagDe(file)}</D:getetag>` +
    `<D:resourcetype/>` +
    `<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>` +
    `<D:lockdiscovery>${lock ? activeLock(lock, href) : ''}</D:lockdiscovery>` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function propPasta(href: string): string {
  return `<D:response><D:href>${xmlEscape(href)}</D:href><D:propstat><D:prop>` +
    `<D:displayname>portal</D:displayname><D:resourcetype><D:collection/></D:resourcetype>` +
    `<D:getlastmodified>${new Date().toUTCString()}</D:getlastmodified>` +
    `<D:supportedlock/>` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function activeLock(lock: Lock, href: string): string {
  const resta = Math.max(1, Math.round((lock.until - Date.now()) / 1000));
  return `<D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope>` +
    `<D:depth>0</D:depth><D:owner><D:href>${xmlEscape(lock.ownerName)}</D:href></D:owner>` +
    `<D:timeout>Second-${resta}</D:timeout>` +
    `<D:locktoken><D:href>${lock.token}</D:href></D:locktoken>` +
    `<D:lockroot><D:href>${xmlEscape(href)}</D:href></D:lockroot></D:activelock>`;
}

function multistatus(res: Response, corpo: string): void {
  setDavHeaders(res);
  res.status(207).type('application/xml; charset=utf-8')
    .send(`<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${corpo}</D:multistatus>`);
}

function recusar(res: Response, err: unknown): void {
  setDavHeaders(res);
  if (err instanceof FileErro) {
    res.status(err.status).type('text/plain; charset=utf-8').send(err.message);
    return;
  }
  console.error('[dav] erro:', err);
  res.status(500).type('text/plain; charset=utf-8').send('Erro interno');
}

/** Token do caminho → payload, ou 403 já respondido. */
function autenticar(req: Request, res: Response): OfficeTokenPayload | null {
  try {
    return verifyOfficeToken(String(req.params.token ?? ''));
  } catch (err) {
    recusar(res, err);
    return null;
  }
}

const router = Router();

// Caixa de pergunta do Office: "este servidor fala DAV?" — vale para a pasta e para o arquivo.
router.options(['/:token', '/:token/:name'], (_req, res) => {
  setDavHeaders(res);
  res.status(200).end();
});

// A "pasta" do token: o Office faz PROPFIND no pai do arquivo antes de abrir.
router.all('/:token', async (req, res) => {
  const payload = autenticar(req, res);
  if (!payload) return;
  if (req.method !== 'PROPFIND') {
    setDavHeaders(res);
    res.status(403).type('text/plain; charset=utf-8').send('Operação não permitida');
    return;
  }
  try {
    const file = await fileForOffice(payload);
    const hrefPasta = `/api/dav/${req.params.token}/`;
    const profundo = String(req.headers.depth ?? '1') !== '0';
    let corpo = propPasta(hrefPasta);
    if (profundo) corpo += propArquivo(officeDavPath(String(req.params.token), file.originalName), file, lockAtivo(file.id));
    multistatus(res, corpo);
  } catch (err) {
    recusar(res, err);
  }
});

router.all('/:token/:name', async (req, res) => {
  const payload = autenticar(req, res);
  if (!payload) return;
  const token = String(req.params.token);

  try {
    const file = await fileForOffice(payload);
    const href = officeDavPath(token, file.originalName);

    switch (req.method) {
      case 'HEAD':
      case 'GET': {
        if (!(await storage.exists(file.storageKey))) throw new FileErro('Arquivo ausente no armazenamento', 410);
        setDavHeaders(res);
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Length', String(file.sizeBytes));
        res.setHeader('Last-Modified', (file.lastEditedAt ?? file.uploadedAt).toUTCString());
        res.setHeader('ETag', etagDe(file));
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
        if (req.method === 'HEAD') { res.status(200).end(); return; }
        const stream = storage.createReadStream(file.storageKey);
        stream.on('error', (e) => { console.error('[dav] erro ao ler o arquivo:', e); res.destroy(e); });
        stream.pipe(res);
        return;
      }

      case 'PROPFIND':
        multistatus(res, propArquivo(href, file, lockAtivo(file.id)));
        return;

      case 'PROPPATCH':
        // O Office tenta gravar atributos do Windows (Win32LastModifiedTime etc.). Aceita e ignora.
        multistatus(res, `<D:response><D:href>${xmlEscape(href)}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`);
        return;

      case 'LOCK': {
        const atual = lockAtivo(file.id);
        if (atual && atual.owner !== payload.sub) {
          setDavHeaders(res);
          res.status(423).type('text/plain; charset=utf-8').send(`Arquivo em edição por ${atual.ownerName}.`);
          return;
        }
        const segundos = timeoutPedido(req);
        const lock: Lock = {
          token: atual?.token ?? `opaquelocktoken:${crypto.randomUUID()}`,
          owner: payload.sub,
          ownerName: payload.name,
          until: Date.now() + segundos * 1000,
        };
        locks.set(file.id, lock);
        setDavHeaders(res);
        res.setHeader('Lock-Token', `<${lock.token}>`);
        res.status(200).type('application/xml; charset=utf-8')
          .send(`<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery>${activeLock(lock, href)}</D:lockdiscovery></D:prop>`);
        return;
      }

      case 'UNLOCK': {
        const atual = lockAtivo(file.id);
        if (atual && atual.owner === payload.sub) locks.delete(file.id);
        setDavHeaders(res);
        res.status(204).end();
        return;
      }

      case 'PUT': {
        const atual = lockAtivo(file.id);
        if (atual && atual.owner !== payload.sub) {
          setDavHeaders(res);
          res.status(423).type('text/plain; charset=utf-8').send(`Arquivo em edição por ${atual.ownerName}.`);
          return;
        }
        const tmp = path.join(os.tmpdir(), `csp-dav-${crypto.randomUUID()}`);
        let bytes = 0;
        try {
          req.on('data', (c: Buffer) => { bytes += c.length; });
          await pipeline(req, fs.createWriteStream(tmp));
          const salvo = await saveFromOffice(payload, tmp, bytes);
          setDavHeaders(res);
          res.setHeader('ETag', etagDe(salvo));
          res.status(204).end();
        } finally {
          await fsp.rm(tmp, { force: true });
        }
        return;
      }

      default:
        setDavHeaders(res);
        res.status(403).type('text/plain; charset=utf-8').send('Operação não permitida');
    }
  } catch (err) {
    recusar(res, err);
  }
});

export default router;
