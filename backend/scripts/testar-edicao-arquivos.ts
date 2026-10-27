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
} from '../src/modules/files/files.service.js';

// ---------- mocks de storage ----------

class DriveMock implements EditableStorageProvider {
  perms = new Map<string, Set<string>>();
  info = new Map<string, StorageFileInfo>();
  shareCalls: Array<{ key: string; email: string }> = [];
  falharCom: StorageError | null = null;

  async save(key: string): Promise<string> { return key; }
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

const localMock: StorageProvider = {
  async save(key) { return key; },
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
}

main()
  .catch((err) => { falhas++; console.error('\nERRO FORA DOS TESTES:', err); })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
    console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
    process.exit(falhas === 0 ? 0 : 1);
  });
