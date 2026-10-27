/**
 * Testes da edição on-line do repositório de arquivos — roda contra o banco
 * local (prisma/dev.db), sem credencial do Google: o Drive é um mock em memória.
 *
 *   npx tsx scripts/testar-edicao-arquivos.ts
 *
 * Cobre: mapa mime → editor, permissão (dono/ADMIN/GESTOR sim, outro USER não),
 * tipo não editável (415), provider sem edição (409), idempotência do
 * compartilhamento, e-mail sem conta Google (422), sincronização de metadados
 * (tamanho/mime/quem editou + log MODIFIED), baseline e cenário pós-substituição.
 *
 * Os dados são FICTÍCIOS e ficam com prefixo "TESTE-EDICAO"; tudo é removido ao
 * final, inclusive quando um teste falha. Sai com código ≠ 0 se algo falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { prisma } from '../src/lib/prisma.js';
import type { AuthPayload } from '../src/middlewares/authenticate.js';
import {
  EditableStorageProvider, StorageError, StorageFileInfo, StorageProvider,
} from '../src/services/storage/types.js';
import {
  FileErro, editorKindFor, canAccessFile, openEditSession, syncFileMetadata, storageSupportsEdit,
  extensionForMime, renameForMime, isLegacyOffice, officeAppFor,
  issueOfficeToken, verifyOfficeToken, openOfficeSession, fileForOffice, saveFromOffice,
} from '../src/modules/files/files.service.js';
import jwt from 'jsonwebtoken';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../src/config/env.js';

// ---------- mocks de storage ----------

class DriveMock implements EditableStorageProvider {
  perms = new Map<string, Set<string>>();
  info = new Map<string, StorageFileInfo>();
  shareCalls: Array<{ key: string; email: string }> = [];
  overwriteCalls: Array<{ key: string; bytes: number; mime?: string }> = [];
  falharCom: StorageError | null = null;

  async save(key: string): Promise<string> { return key; }
  async overwrite(key: string, sourcePath: string, mime?: string): Promise<void> {
    const bytes = (await fsp.stat(sourcePath)).size;
    this.overwriteCalls.push({ key, bytes, mime });
    await fsp.rm(sourcePath, { force: true });
    // Como o Drive: o conteúdo novo muda tamanho e modifiedTime.
    const i = this.info.get(key);
    if (i) this.info.set(key, { ...i, sizeBytes: bytes, modifiedTime: new Date(Date.now() + 1000) });
  }
  createReadStream(): Readable { return Readable.from([]); }
  async delete(): Promise<void> { /* nada */ }
  async exists(key: string): Promise<boolean> { return this.info.has(key); }

  async shareForEdit(key: string, email: string): Promise<{ webViewLink: string }> {
    this.shareCalls.push({ key, email });
    if (this.falharCom) throw this.falharCom;
    if (!this.perms.has(key)) this.perms.set(key, new Set());
    this.perms.get(key)!.add(email.toLowerCase());
    return { webViewLink: `https://docs.google.com/mock/${key}/edit` };
  }

  async getInfo(key: string): Promise<StorageFileInfo> {
    const i = this.info.get(key);
    if (!i) throw new StorageError('Arquivo ausente no armazenamento', 410);
    return { ...i };
  }
}

const localOverwrites: Array<{ key: string; bytes: number }> = [];
const localMock: StorageProvider = {
  async save(key) { return key; },
  async overwrite(key, sourcePath) {
    localOverwrites.push({ key, bytes: (await fsp.stat(sourcePath)).size });
    await fsp.rm(sourcePath, { force: true });
  },
  createReadStream() { return Readable.from([]); },
  async delete() { /* nada */ },
  async exists() { return true; },
};

// ---------- helpers ----------

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${nome}`);
  } catch (err) {
    falhas++;
    console.log(`  ✗ ${nome}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function esperaErro(fn: () => Promise<unknown> | unknown, status: number, trecho: string) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof FileErro, `esperava FileErro, veio ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
    assert.equal(err.status, status, `esperava status ${status}, veio ${err.status} (${err.message})`);
    assert.ok(err.message.includes(trecho), `mensagem "${err.message}" não contém "${trecho}"`);
    return;
  }
  assert.fail(`esperava FileErro ${status} com "${trecho}", mas não lançou`);
}

const PREFIXO_EMAIL = 'teste-edicao-';
const PREFIXO_NOME = 'TESTE-EDICAO';

async function limpar() {
  await prisma.fileChangeLog.deleteMany({ where: { fileName: { startsWith: PREFIXO_NOME } } });
  await prisma.file.deleteMany({ where: { originalName: { startsWith: PREFIXO_NOME } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

async function criarUsuario(sufixo: string, role: string): Promise<AuthPayload> {
  const u = await prisma.user.create({
    data: {
      name: `${PREFIXO_NOME} ${sufixo}`,
      email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`,
      passwordHash: 'x',
      role,
    },
  });
  return { sub: u.id, email: u.email, role: u.role, name: u.name };
}

async function criarArquivo(ownerId: string, nome: string, mime: string, key: string, sizeBytes = 1000) {
  return prisma.file.create({
    data: {
      originalName: `${PREFIXO_NOME} ${nome}`,
      storedName: `${key}.bin`,
      mimeType: mime,
      sizeBytes,
      storageKey: key,
      ownerId,
    },
  });
}

async function logsDe(fileId: string, action?: string) {
  return prisma.fileChangeLog.findMany({ where: { fileId, ...(action ? { action } : {}) }, orderBy: { createdAt: 'asc' } });
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// ---------- testes ----------

async function main() {
  await limpar();
  const drive = new DriveMock();
  const deps = { storage: drive };

  const dono = await criarUsuario('dono', 'USER');
  const outro = await criarUsuario('outro', 'USER');
  const gestor = await criarUsuario('gestor', 'GESTOR');
  const admin = await criarUsuario('admin', 'ADMIN');

  const t0 = new Date('2026-10-27T10:00:00Z');
  const infoBase = (over: Partial<StorageFileInfo> = {}): StorageFileInfo => ({
    sizeBytes: 1000, mimeType: DOCX, modifiedTime: t0, webViewLink: null,
    lastModifiedByName: null, lastModifiedByEmail: null, ...over,
  });

  const docx = await criarArquivo(dono.sub, 'relatorio.docx', DOCX, 'drive-teste-edicao-1');
  drive.info.set('drive-teste-edicao-1', infoBase());
  const pdf = await criarArquivo(dono.sub, 'apostila.pdf', 'application/pdf', 'drive-teste-edicao-2');
  drive.info.set('drive-teste-edicao-2', infoBase({ mimeType: 'application/pdf' }));

  console.log('\nMapa mime → editor');
  await teste('docx/doc → docs, xlsx/xls → sheets, pptx/ppt → slides, demais → null', () => {
    assert.equal(editorKindFor(DOCX), 'docs');
    assert.equal(editorKindFor('application/msword'), 'docs');
    assert.equal(editorKindFor(XLSX), 'sheets');
    assert.equal(editorKindFor('application/vnd.ms-excel'), 'sheets');
    assert.equal(editorKindFor(PPTX), 'slides');
    assert.equal(editorKindFor('application/vnd.ms-powerpoint'), 'slides');
    for (const m of ['application/pdf', 'application/zip', 'video/mp4', 'image/png', 'application/octet-stream']) {
      assert.equal(editorKindFor(m), null, m);
    }
  });

  console.log('\nAbrir para edição');
  await teste('dono abre .docx: url do editor, share com o e-mail do dono, log EDIT e baseline gravada', async () => {
    const r = await openEditSession(docx.id, dono, deps);
    assert.equal(r.editor, 'docs');
    assert.ok(r.url.startsWith('https://docs.google.com/'), r.url);
    assert.equal(drive.shareCalls.length, 1);
    assert.equal(drive.shareCalls[0].email, dono.email);
    const logs = await logsDe(docx.id, 'EDIT');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actorId, dono.sub);
    assert.equal(logs[0].oldSize, 1000);
    assert.equal(logs[0].newSize, null);
    const f = await prisma.file.findUniqueOrThrow({ where: { id: docx.id } });
    assert.equal(f.driveModifiedTime?.getTime(), t0.getTime());
  });

  await teste('GESTOR e ADMIN abrem arquivo alheio; USER alheio recebe 403', async () => {
    await openEditSession(docx.id, gestor, deps);
    await openEditSession(docx.id, admin, deps);
    assert.ok(drive.perms.get('drive-teste-edicao-1')!.has(gestor.email));
    assert.ok(drive.perms.get('drive-teste-edicao-1')!.has(admin.email));
    await esperaErro(() => openEditSession(docx.id, outro, deps), 403, 'Acesso negado');
    assert.ok(!drive.perms.get('drive-teste-edicao-1')!.has(outro.email), 'não deve compartilhar com quem não pode');
    assert.equal(canAccessFile({ ownerId: dono.sub }, outro), false);
    assert.equal(canAccessFile({ ownerId: dono.sub }, gestor), true);
  });

  await teste('PDF → 415; id inexistente → 404', async () => {
    await esperaErro(() => openEditSession(pdf.id, dono, deps), 415, 'não pode ser editado on-line');
    await esperaErro(() => openEditSession('nao-existe', dono, deps), 404, 'não encontrado');
    assert.equal((await logsDe(pdf.id)).length, 0, 'não deve logar EDIT em recusa');
  });

  await teste('provider sem edição (disco local) → 409 e storageSupportsEdit false', async () => {
    await esperaErro(() => openEditSession(docx.id, dono, { storage: localMock }), 409, 'Google Drive');
    assert.equal(storageSupportsEdit({ storage: localMock }), false);
    assert.equal(storageSupportsEdit(deps), true);
  });

  await teste('abrir duas vezes é idempotente: e-mail uma vez nas permissões, um log EDIT por abertura', async () => {
    const antes = (await logsDe(docx.id, 'EDIT')).length;
    await openEditSession(docx.id, dono, deps);
    await openEditSession(docx.id, dono, deps);
    const emails = [...drive.perms.get('drive-teste-edicao-1')!].filter((e) => e === dono.email);
    assert.equal(emails.length, 1);
    assert.equal((await logsDe(docx.id, 'EDIT')).length, antes + 2);
  });

  await teste('e-mail sem conta Google: StorageError 422 vira FileErro 422 com o e-mail na mensagem', async () => {
    drive.falharCom = new StorageError(`O e-mail ${dono.email} não é uma conta Google; não foi possível liberar a edição.`, 422);
    try {
      const antes = (await logsDe(docx.id, 'EDIT')).length;
      await esperaErro(() => openEditSession(docx.id, dono, deps), 422, dono.email);
      assert.equal((await logsDe(docx.id, 'EDIT')).length, antes, 'não deve logar EDIT quando o share falha');
    } finally {
      drive.falharCom = null;
    }
  });

  console.log('\nSincronização');
  await teste('Drive mais novo: atualiza tamanho/mime/quem editou e grava log MODIFIED; sem mudança, nada', async () => {
    const t1 = new Date(t0.getTime() + 60_000);
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 1234, modifiedTime: t1, lastModifiedByName: 'Professor Teste', lastModifiedByEmail: dono.email }));
    const r = await syncFileMetadata(docx.id, deps);
    assert.equal(r.changed, true);
    assert.equal(r.file.sizeBytes, 1234);
    assert.equal(r.file.lastEditedByName, 'Professor Teste');
    assert.equal(r.file.lastEditedAt?.getTime(), t1.getTime());
    assert.equal(r.file.driveModifiedTime?.getTime(), t1.getTime());
    const mods = await logsDe(docx.id, 'MODIFIED');
    assert.equal(mods.length, 1);
    assert.equal(mods[0].oldSize, 1000);
    assert.equal(mods[0].newSize, 1234);
    assert.equal(mods[0].actorName, 'Professor Teste');
    assert.equal(mods[0].actorEmail, dono.email);

    const r2 = await syncFileMetadata(docx.id, deps);
    assert.equal(r2.changed, false);
    assert.equal((await logsDe(docx.id, 'MODIFIED')).length, 1);
  });

  await teste('Drive sem lastModifyingUser: o ator do MODIFIED vem do último EDIT', async () => {
    const t2 = new Date(t0.getTime() + 120_000);
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 1300, modifiedTime: t2 }));
    const r = await syncFileMetadata(docx.id, deps);
    assert.equal(r.changed, true);
    const mods = await logsDe(docx.id, 'MODIFIED');
    const ultimo = mods[mods.length - 1];
    assert.equal(ultimo.actorId, dono.sub); // último EDIT foi do dono
    assert.equal(ultimo.actorEmail, dono.email);
  });

  await teste('sync com provider sem edição: changed false, sem erro, sem log', async () => {
    const antes = (await logsDe(docx.id)).length;
    const r = await syncFileMetadata(docx.id, { storage: localMock });
    assert.equal(r.changed, false);
    assert.equal((await logsDe(docx.id)).length, antes);
  });

  await teste('sync de arquivo sem baseline grava a baseline sem log MODIFIED', async () => {
    const xlsx = await criarArquivo(dono.sub, 'notas.xlsx', XLSX, 'drive-teste-edicao-3', 500);
    drive.info.set('drive-teste-edicao-3', infoBase({ mimeType: XLSX, sizeBytes: 777 }));
    const r = await syncFileMetadata(xlsx.id, deps);
    assert.equal(r.changed, false);
    assert.equal(r.file.driveModifiedTime?.getTime(), t0.getTime());
    assert.equal(r.file.sizeBytes, 777, 'baseline corrige o tamanho sem contar como edição');
    assert.equal((await logsDe(xlsx.id)).length, 0);
  });

  await teste('pós-substituição (baseline zerada): abrir recria a baseline sem log MODIFIED', async () => {
    await prisma.file.update({ where: { id: docx.id }, data: { driveModifiedTime: null, lastEditedAt: null, lastEditedByName: null } });
    const t3 = new Date(t0.getTime() + 300_000);
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 2000, modifiedTime: t3 }));
    const modsAntes = (await logsDe(docx.id, 'MODIFIED')).length;
    await openEditSession(docx.id, dono, deps);
    const f = await prisma.file.findUniqueOrThrow({ where: { id: docx.id } });
    assert.equal(f.driveModifiedTime?.getTime(), t3.getTime());
    assert.equal((await logsDe(docx.id, 'MODIFIED')).length, modsAntes);
  });

  await teste('abrir quando o Drive já está mais novo que a baseline sincroniza antes (log MODIFIED)', async () => {
    const t4 = new Date(t0.getTime() + 600_000);
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 2100, modifiedTime: t4, lastModifiedByName: 'Alguém no Drive' }));
    const modsAntes = (await logsDe(docx.id, 'MODIFIED')).length;
    await openEditSession(docx.id, gestor, deps);
    const mods = await logsDe(docx.id, 'MODIFIED');
    assert.equal(mods.length, modsAntes + 1);
    assert.equal(mods[mods.length - 1].actorName, 'Alguém no Drive');
    const f = await prisma.file.findUniqueOrThrow({ where: { id: docx.id } });
    assert.equal(f.sizeBytes, 2100);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nAjuste 1 — o Google converteu .doc → .docx: a extensão acompanha');
  await teste('extensionForMime / renameForMime: só troca quando o mime tem extensão conhecida e diferente', () => {
    assert.equal(extensionForMime(DOCX), '.docx');
    assert.equal(extensionForMime('application/msword'), '.doc');
    assert.equal(extensionForMime('application/octet-stream'), null);
    assert.equal(renameForMime('prova.doc', DOCX), 'prova.docx');
    assert.equal(renameForMime('prova.DOC', DOCX), 'prova.docx');
    assert.equal(renameForMime('prova.docx', DOCX), 'prova.docx');
    assert.equal(renameForMime('planilha.xls', XLSX), 'planilha.xlsx');
    assert.equal(renameForMime('nome.com.pontos.ppt', PPTX), 'nome.com.pontos.pptx');
    assert.equal(renameForMime('sem-extensao', DOCX), 'sem-extensao.docx');
    assert.equal(renameForMime('prova.doc', 'application/octet-stream'), 'prova.doc', 'mime desconhecido não mexe');
    assert.equal(renameForMime('foto.jpg', 'image/jpeg'), 'foto.jpg');
  });

  await teste('sync detecta mime novo no Drive e renomeia originalName e storedName (.doc → .docx), com log MODIFIED', async () => {
    const doc = await criarArquivo(dono.sub, 'atividade.doc', 'application/msword', 'drive-teste-edicao-doc', 586240);
    await prisma.file.update({ where: { id: doc.id }, data: { storedName: 'uuid-1234.doc' } });
    drive.info.set('drive-teste-edicao-doc', infoBase({ mimeType: 'application/msword', sizeBytes: 586240 }));
    await openEditSession(doc.id, dono, deps); // grava a baseline
    // O Google abriu, converteu e salvou: mime e tamanho novos, data mais nova.
    drive.info.set('drive-teste-edicao-doc', infoBase({ mimeType: DOCX, sizeBytes: 1004247, modifiedTime: new Date(t0.getTime() + 5000) }));
    const r = await syncFileMetadata(doc.id, deps);
    assert.equal(r.changed, true);
    assert.equal(r.file.originalName, `${PREFIXO_NOME} atividade.docx`);
    assert.equal(r.file.storedName, 'uuid-1234.docx');
    assert.equal(r.file.mimeType, DOCX);
    const mods = await logsDe(doc.id, 'MODIFIED');
    assert.equal(mods.length, 1);
    assert.equal(mods[0].oldMime, 'application/msword');
    assert.equal(mods[0].newMime, DOCX);
    assert.equal(mods[0].fileName, `${PREFIXO_NOME} atividade.docx`);
  });

  await teste('sync sem mudança de mime não mexe no nome', async () => {
    const t9 = new Date(t0.getTime() + 900_000);
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 2200, modifiedTime: t9 }));
    const r = await syncFileMetadata(docx.id, deps);
    assert.equal(r.file.originalName, `${PREFIXO_NOME} relatorio.docx`);
  });

  console.log('\nAjuste 2 — formato antigo: o portal avisa que o Google converte');
  await teste('isLegacyOffice: doc/xls/ppt sim; docx/xlsx/pptx/pdf não', () => {
    assert.equal(isLegacyOffice('application/msword'), true);
    assert.equal(isLegacyOffice('application/vnd.ms-excel'), true);
    assert.equal(isLegacyOffice('application/vnd.ms-powerpoint'), true);
    assert.equal(isLegacyOffice(DOCX), false);
    assert.equal(isLegacyOffice(XLSX), false);
    assert.equal(isLegacyOffice(PPTX), false);
    assert.equal(isLegacyOffice('application/pdf'), false);
  });

  await teste('edit-session devolve converts=true para .doc e false para .docx', async () => {
    const doc = await criarArquivo(dono.sub, 'antigo.doc', 'application/msword', 'drive-teste-edicao-doc2');
    drive.info.set('drive-teste-edicao-doc2', infoBase({ mimeType: 'application/msword' }));
    assert.equal((await openEditSession(doc.id, dono, deps)).converts, true);
    assert.equal((await openEditSession(docx.id, dono, deps)).converts, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nOffice instalado (Word/Excel/PowerPoint) pelo WebDAV');
  await teste('officeAppFor: docx/doc → word, xlsx/xls → excel, pptx/ppt → powerpoint, demais → null', () => {
    assert.equal(officeAppFor(DOCX), 'word');
    assert.equal(officeAppFor('application/msword'), 'word');
    assert.equal(officeAppFor(XLSX), 'excel');
    assert.equal(officeAppFor(PPTX), 'powerpoint');
    assert.equal(officeAppFor('application/pdf'), null);
    assert.equal(officeAppFor('image/png'), null);
  });

  await teste('token: escopo dav preso ao arquivo e ao usuário; o JWT de login é recusado (403); expirado é recusado', () => {
    const tk = issueOfficeToken(docx.id, dono);
    const p = verifyOfficeToken(tk);
    assert.equal(p.scope, 'dav');
    assert.equal(p.fid, docx.id);
    assert.equal(p.sub, dono.sub);
    assert.equal(p.email, dono.email);
    const login = jwt.sign({ sub: dono.sub, email: dono.email, role: dono.role, name: dono.name }, env.jwtSecret, { expiresIn: '1h' });
    assert.throws(() => verifyOfficeToken(login), (e: unknown) => e instanceof FileErro && e.status === 403);
    const vencido = jwt.sign({ scope: 'dav', fid: docx.id, sub: dono.sub }, env.jwtSecret, { expiresIn: -10 });
    assert.throws(() => verifyOfficeToken(vencido), (e: unknown) => e instanceof FileErro && e.status === 403 && e.message.includes('expirado'));
    assert.throws(() => verifyOfficeToken('lixo'), (e: unknown) => e instanceof FileErro && e.status === 403);
    const outroSegredo = jwt.sign({ scope: 'dav', fid: docx.id, sub: dono.sub }, 'outro-segredo');
    assert.throws(() => verifyOfficeToken(outroSegredo), (e: unknown) => e instanceof FileErro && e.status === 403);
  });

  await teste('dono abre no Word: link ms-word:ofe|u|<api>/api/dav/<token>/<nome>, log EDIT_OFFICE; funciona com disco E Drive', async () => {
    const r = await openOfficeSession(docx.id, dono, 'https://api.exemplo.com/', { storage: localMock });
    assert.equal(r.app, 'word');
    assert.ok(r.url.startsWith('ms-word:ofe|u|https://api.exemplo.com/api/dav/'), r.url);
    assert.ok(r.url.endsWith(`/${encodeURIComponent(`${PREFIXO_NOME} relatorio.docx`)}`), r.url);
    assert.ok(!r.url.includes('com//api'), 'barra final da base não duplica');
    const token = r.davUrl.split('/api/dav/')[1].split('/')[0];
    assert.equal(verifyOfficeToken(token).fid, docx.id);
    const logs = await logsDe(docx.id, 'EDIT_OFFICE');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actorId, dono.sub);
    const r2 = await openOfficeSession(docx.id, gestor, 'https://api.exemplo.com', deps);
    assert.equal(r2.app, 'word');
    assert.equal((await logsDe(docx.id, 'EDIT_OFFICE')).length, 2);
  });

  await teste('Excel e PowerPoint usam o esquema certo; PDF → 415; USER alheio → 403; inexistente → 404', async () => {
    const xlsx = await criarArquivo(dono.sub, 'notas2.xlsx', XLSX, 'drive-teste-edicao-xlsx');
    const pptx = await criarArquivo(dono.sub, 'aula.pptx', PPTX, 'drive-teste-edicao-pptx');
    assert.ok((await openOfficeSession(xlsx.id, dono, 'http://x', { storage: localMock })).url.startsWith('ms-excel:ofe|u|'));
    assert.ok((await openOfficeSession(pptx.id, dono, 'http://x', { storage: localMock })).url.startsWith('ms-powerpoint:ofe|u|'));
    await esperaErro(() => openOfficeSession(pdf.id, dono, 'http://x', { storage: localMock }), 415, 'Office');
    await esperaErro(() => openOfficeSession(docx.id, outro, 'http://x', { storage: localMock }), 403, 'Acesso negado');
    await esperaErro(() => openOfficeSession('nao-existe', dono, 'http://x', { storage: localMock }), 404, 'não encontrado');
    assert.equal((await logsDe(pdf.id, 'EDIT_OFFICE')).length, 0);
  });

  await teste('fileForOffice confere o acesso de novo: token de USER alheio → 403 mesmo com token válido', async () => {
    const tk = verifyOfficeToken(issueOfficeToken(docx.id, outro));
    await esperaErro(() => fileForOffice(tk, { storage: localMock }), 403, 'Acesso negado');
    const ok = await fileForOffice(verifyOfficeToken(issueOfficeToken(docx.id, dono)), { storage: localMock });
    assert.equal(ok.id, docx.id);
  });

  async function tmpCom(bytes: number): Promise<string> {
    const p = path.join(os.tmpdir(), `teste-edicao-${Date.now()}-${Math.random()}`);
    await fsp.writeFile(p, Buffer.alloc(bytes, 7));
    return p;
  }

  await teste('PUT do Word (disco): overwrite na MESMA chave, tamanho e lastEditedBy atualizados, log SAVED_OFFICE', async () => {
    const antes = await prisma.file.findUniqueOrThrow({ where: { id: docx.id } });
    const tmp = await tmpCom(4321);
    const payload = verifyOfficeToken(issueOfficeToken(docx.id, gestor));
    const salvo = await saveFromOffice(payload, tmp, 4321, { storage: localMock });
    assert.equal(localOverwrites.length, 1);
    assert.equal(localOverwrites[0].key, antes.storageKey);
    assert.equal(localOverwrites[0].bytes, 4321);
    assert.equal(salvo.storageKey, antes.storageKey, 'a chave não muda (não é REPLACE)');
    assert.equal(salvo.sizeBytes, 4321);
    assert.equal(salvo.lastEditedByName, gestor.name);
    assert.ok(salvo.lastEditedAt && salvo.lastEditedAt.getTime() > Date.now() - 10_000);
    const logs = await logsDe(docx.id, 'SAVED_OFFICE');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actorId, gestor.sub);
    assert.equal(logs[0].oldSize, antes.sizeBytes);
    assert.equal(logs[0].newSize, 4321);
    assert.equal(await fsp.access(tmp).then(() => true, () => false), false, 'temporário removido');
  });

  await teste('PUT do Word (Drive): regrava a baseline, e a sincronização seguinte NÃO conta como MODIFIED', async () => {
    drive.info.set('drive-teste-edicao-1', infoBase({ sizeBytes: 4321, modifiedTime: new Date(t0.getTime() + 1_000_000) }));
    await syncFileMetadata(docx.id, deps); // alinha a baseline do Drive mock
    const modsAntes = (await logsDe(docx.id, 'MODIFIED')).length;
    const tmp = await tmpCom(5000);
    const payload = verifyOfficeToken(issueOfficeToken(docx.id, dono));
    const salvo = await saveFromOffice(payload, tmp, 5000, deps);
    assert.equal(drive.overwriteCalls.length, 1);
    assert.equal(drive.overwriteCalls[0].key, 'drive-teste-edicao-1');
    assert.equal(drive.overwriteCalls[0].mime, DOCX);
    assert.equal(salvo.sizeBytes, 5000);
    const info = drive.info.get('drive-teste-edicao-1')!;
    assert.equal(salvo.driveModifiedTime?.getTime(), info.modifiedTime?.getTime(), 'baseline = modifiedTime após o PUT');
    const r = await syncFileMetadata(docx.id, deps);
    assert.equal(r.changed, false);
    assert.equal((await logsDe(docx.id, 'MODIFIED')).length, modsAntes, 'a gravação do Word não vira MODIFIED do Google');
  });

  await teste('PUT vazio → 400; PUT de USER alheio → 403 e nada gravado', async () => {
    const n = localOverwrites.length;
    const tmp = await tmpCom(0);
    await esperaErro(() => saveFromOffice(verifyOfficeToken(issueOfficeToken(docx.id, dono)), tmp, 0, { storage: localMock }), 400, 'vazio');
    const tmp2 = await tmpCom(10);
    await esperaErro(() => saveFromOffice(verifyOfficeToken(issueOfficeToken(docx.id, outro)), tmp2, 10, { storage: localMock }), 403, 'Acesso negado');
    assert.equal(localOverwrites.length, n);
    await fsp.rm(tmp, { force: true }); await fsp.rm(tmp2, { force: true });
  });
}

main()
  .catch((err) => { falhas++; console.error('\nERRO FORA DOS TESTES:', err); })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
    console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
    process.exit(falhas === 0 ? 0 : 1);
  });
