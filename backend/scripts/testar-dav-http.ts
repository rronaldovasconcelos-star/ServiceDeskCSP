/**
 * Testa o WebDAV do Office de ponta a ponta, por HTTP, contra o app real subido
 * numa porta livre (storage em disco, banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-dav-http.ts
 *
 * Simula a conversa do Word: OPTIONS → PROPFIND (pasta e arquivo) → LOCK → GET →
 * PUT → UNLOCK, e as recusas: token de login no lugar do token dav (403), token
 * de outro usuário (403), lock de outro usuário (423), método proibido (403),
 * PUT vazio (400). Tudo com prefixo "TESTE-DAV"; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { LOCAL_ROOT } from '../src/services/storage/LocalDiskProvider.js';
import { resetDavLocks } from '../src/modules/files/files.dav.js';
import { issueOfficeToken, officeDavPath } from '../src/modules/files/files.service.js';
import type { AuthPayload } from '../src/middlewares/authenticate.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PREFIXO_EMAIL = 'teste-dav-';
const PREFIXO_NOME = 'TESTE-DAV';

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  await prisma.fileChangeLog.deleteMany({ where: { fileName: { startsWith: PREFIXO_NOME } } });
  await prisma.file.deleteMany({ where: { originalName: { startsWith: PREFIXO_NOME } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
  await fsp.rm(path.join(LOCAL_ROOT, 'teste-dav'), { recursive: true, force: true });
}

async function criarUsuario(sufixo: string, role: string): Promise<AuthPayload> {
  const u = await prisma.user.create({
    data: { name: `${PREFIXO_NOME} ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`, passwordHash: 'x', role },
  });
  return { sub: u.id, email: u.email, role: u.role, name: u.name };
}

async function main() {
  if (env.storageProvider !== 'local') throw new Error('Este teste exige STORAGE_PROVIDER=local');
  await limpar();
  resetDavLocks();

  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const dono = await criarUsuario('dono', 'USER');
  const outro = await criarUsuario('outro', 'USER');
  const gestor = await criarUsuario('gestor', 'GESTOR');

  const conteudo = Buffer.from('PK\u0003\u0004 conteudo original do docx de teste '.repeat(50));
  const key = 'teste-dav/original.docx';
  await fsp.mkdir(path.join(LOCAL_ROOT, 'teste-dav'), { recursive: true });
  await fsp.writeFile(path.join(LOCAL_ROOT, key), conteudo);
  const file = await prisma.file.create({
    data: {
      originalName: `${PREFIXO_NOME} prova 3º ano.docx`, storedName: 'original.docx', mimeType: DOCX,
      sizeBytes: conteudo.length, storageKey: key, ownerId: dono.sub,
    },
  });

  const tokenDono = issueOfficeToken(file.id, dono);
  const urlArq = `${base}${officeDavPath(tokenDono, file.originalName)}`;
  const urlPasta = `${base}/api/dav/${tokenDono}`;
  const req = (url: string, method: string, init: RequestInit = {}) => fetch(url, { method, ...init });

  try {
    console.log('\nConversa do Word');
    await teste('OPTIONS na raiz, na pasta e no arquivo anunciam DAV 1,2 e MS-Author-Via sem WWW-Authenticate', async () => {
      for (const u of [`${base}/`, urlPasta, urlArq]) {
        const r = await req(u, 'OPTIONS');
        assert.equal(r.status, 200, u);
        assert.equal(r.headers.get('dav'), '1,2', u);
        assert.equal(r.headers.get('ms-author-via'), 'DAV', u);
        assert.ok(r.headers.get('allow')?.includes('PROPFIND'), u);
        assert.equal(r.headers.get('www-authenticate'), null, u);
      }
    });

    await teste('PROPFIND na pasta (Depth 1) lista a coleção e o arquivo; no arquivo devolve tamanho, mime e supportedlock', async () => {
      const rp = await req(urlPasta, 'PROPFIND', { headers: { Depth: '1' } });
      assert.equal(rp.status, 207);
      const xp = await rp.text();
      assert.ok(xp.includes('<D:collection/>'), xp);
      assert.ok(xp.includes(encodeURIComponent(file.originalName)), 'o arquivo aparece como membro');
      const r = await req(urlArq, 'PROPFIND', { headers: { Depth: '0' } });
      assert.equal(r.status, 207);
      assert.ok(r.headers.get('content-type')?.includes('xml'));
      const x = await r.text();
      assert.ok(x.includes(`<D:getcontentlength>${conteudo.length}</D:getcontentlength>`), x);
      assert.ok(x.includes(`<D:getcontenttype>${DOCX}</D:getcontenttype>`), x);
      assert.ok(x.includes('<D:supportedlock>'), x);
      assert.ok(x.includes('<D:displayname>TESTE-DAV prova 3º ano.docx</D:displayname>'), x);
      assert.ok(!x.includes('<D:collection/>'), 'o arquivo não é coleção');
    });

    await teste('HEAD e GET entregam o conteúdo com Content-Length, ETag e Last-Modified', async () => {
      const h = await req(urlArq, 'HEAD');
      assert.equal(h.status, 200);
      assert.equal(h.headers.get('content-length'), String(conteudo.length));
      assert.ok(h.headers.get('etag'));
      assert.ok(h.headers.get('last-modified'));
      const g = await req(urlArq, 'GET');
      assert.equal(g.status, 200);
      assert.equal(g.headers.get('content-type'), DOCX);
      const b = Buffer.from(await g.arrayBuffer());
      assert.equal(b.length, conteudo.length);
      assert.ok(b.equals(conteudo), 'bytes idênticos');
    });

    let lockToken = '';
    await teste('LOCK devolve Lock-Token e lockdiscovery; renovar devolve o MESMO token', async () => {
      const body = '<?xml version="1.0" encoding="utf-8"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner>Word</D:owner></D:lockinfo>';
      const r = await req(urlArq, 'LOCK', { headers: { Timeout: 'Second-3600', 'Content-Type': 'text/xml' }, body });
      assert.equal(r.status, 200);
      lockToken = r.headers.get('lock-token') ?? '';
      assert.ok(/^<opaquelocktoken:[0-9a-f-]+>$/.test(lockToken), lockToken);
      const x = await r.text();
      assert.ok(x.includes('<D:lockdiscovery>') && x.includes('<D:exclusive/>'), x);
      assert.ok(x.includes('Second-3600'), x);
      const r2 = await req(urlArq, 'LOCK', { headers: { Timeout: 'Second-3600', If: `(${lockToken})` } });
      assert.equal(r2.status, 200);
      assert.equal(r2.headers.get('lock-token'), lockToken, 'renovação mantém o token');
      const pf = await (await req(urlArq, 'PROPFIND', { headers: { Depth: '0' } })).text();
      assert.ok(pf.includes('<D:activelock>'), 'PROPFIND mostra o lock ativo');
    });

    await teste('outro usuário com acesso (GESTOR) recebe 423 no LOCK e no PUT enquanto o dono edita', async () => {
      const urlGestor = `${base}${officeDavPath(issueOfficeToken(file.id, gestor), file.originalName)}`;
      const l = await req(urlGestor, 'LOCK', { headers: { Timeout: 'Second-600' } });
      assert.equal(l.status, 423);
      assert.ok((await l.text()).includes(dono.name));
      const p = await req(urlGestor, 'PUT', { body: Buffer.from('x'.repeat(100)) });
      assert.equal(p.status, 423);
      const g = await req(urlGestor, 'GET');
      assert.equal(g.status, 200, 'ler continua liberado');
    });

    const novo = Buffer.from('PK\u0003\u0004 CONTEUDO NOVO salvo pelo Word '.repeat(80));
    await teste('PUT grava o conteúdo novo no MESMO arquivo: GET devolve os bytes novos, banco com tamanho e log SAVED_OFFICE', async () => {
      const p = await req(urlArq, 'PUT', { headers: { 'Content-Type': DOCX, If: `(${lockToken})` }, body: novo });
      assert.equal(p.status, 204, await p.text());
      assert.ok(p.headers.get('etag'));
      const g = await req(urlArq, 'GET');
      assert.equal(g.headers.get('content-length'), String(novo.length));
      assert.ok(Buffer.from(await g.arrayBuffer()).equals(novo));
      const emDisco = await fsp.readFile(path.join(LOCAL_ROOT, key));
      assert.ok(emDisco.equals(novo), 'o storage tem o conteúdo novo na mesma chave');
      const f = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
      assert.equal(f.sizeBytes, novo.length);
      assert.equal(f.storageKey, key);
      assert.equal(f.lastEditedByName, dono.name);
      const logs = await prisma.fileChangeLog.findMany({ where: { fileId: file.id, action: 'SAVED_OFFICE' } });
      assert.equal(logs.length, 1);
      assert.equal(logs[0].oldSize, conteudo.length);
      assert.equal(logs[0].newSize, novo.length);
    });

    await teste('PROPPATCH é aceito (207); UNLOCK libera (204) e o GESTOR consegue o LOCK em seguida', async () => {
      const pp = await req(urlArq, 'PROPPATCH', { headers: { 'Content-Type': 'text/xml' }, body: '<D:propertyupdate xmlns:D="DAV:"/>' });
      assert.equal(pp.status, 207);
      const u = await req(urlArq, 'UNLOCK', { headers: { 'Lock-Token': lockToken } });
      assert.equal(u.status, 204);
      const urlGestor = `${base}${officeDavPath(issueOfficeToken(file.id, gestor), file.originalName)}`;
      const l = await req(urlGestor, 'LOCK', { headers: { Timeout: 'Second-600' } });
      assert.equal(l.status, 200);
      await req(urlGestor, 'UNLOCK', { headers: { 'Lock-Token': l.headers.get('lock-token') ?? '' } });
    });

    console.log('\nRecusas');
    await teste('token de LOGIN no lugar do token dav → 403, sem WWW-Authenticate; token inválido → 403', async () => {
      const login = jwt.sign({ sub: dono.sub, email: dono.email, role: dono.role, name: dono.name }, env.jwtSecret, { expiresIn: '1h' });
      const r = await req(`${base}${officeDavPath(login, file.originalName)}`, 'GET');
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('www-authenticate'), null);
      assert.equal((await req(`${base}/api/dav/lixo/arquivo.docx`, 'PROPFIND')).status, 403);
      assert.equal((await req(`${base}/api/dav/lixo`, 'PROPFIND')).status, 403);
    });

    await teste('token de USER alheio (válido, mas sem acesso ao arquivo) → 403 em GET e PUT; nada gravado', async () => {
      const urlOutro = `${base}${officeDavPath(issueOfficeToken(file.id, outro), file.originalName)}`;
      assert.equal((await req(urlOutro, 'GET')).status, 403);
      assert.equal((await req(urlOutro, 'PUT', { body: Buffer.from('invasao') })).status, 403);
      assert.ok((await fsp.readFile(path.join(LOCAL_ROOT, key))).equals(novo));
    });

    await teste('DELETE/MOVE/MKCOL → 403; PUT vazio → 400 e o conteúdo fica intacto', async () => {
      for (const m of ['DELETE', 'MOVE', 'MKCOL', 'COPY']) {
        assert.equal((await req(urlArq, m)).status, 403, m);
      }
      const p = await req(urlArq, 'PUT', { body: Buffer.alloc(0) });
      assert.equal(p.status, 400);
      assert.ok((await fsp.readFile(path.join(LOCAL_ROOT, key))).equals(novo));
    });

    await teste('edit-local (rota do portal) exige Bearer: 401 sem token; com token de login devolve o link ms-word', async () => {
      const sem = await req(`${base}/api/files/${file.id}/edit-local`, 'POST');
      assert.equal(sem.status, 401);
      const login = jwt.sign({ sub: dono.sub, email: dono.email, role: dono.role, name: dono.name }, env.jwtSecret, { expiresIn: '1h' });
      const com = await req(`${base}/api/files/${file.id}/edit-local`, 'POST', { headers: { Authorization: `Bearer ${login}` } });
      const texto = await com.text();
      assert.equal(com.status, 200, texto);
      const j = JSON.parse(texto) as { url: string; app: string };
      assert.equal(j.app, 'word');
      assert.ok(j.url.startsWith(`ms-word:ofe|u|${base}/api/dav/`), j.url);
      const cap = await (await req(`${base}/api/files/capabilities`, 'GET', { headers: { Authorization: `Bearer ${login}` } })).json() as { editInOffice: boolean; editInDrive: boolean };
      assert.equal(cap.editInOffice, true);
      assert.equal(cap.editInDrive, false);
    });
  } finally {
    server.close();
  }
}

main()
  .catch((err) => { falhas++; console.error('\nERRO FORA DOS TESTES:', err); })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
    console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
    process.exit(falhas === 0 ? 0 : 1);
  });
