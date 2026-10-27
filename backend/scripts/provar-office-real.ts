/**
 * Prova com o Office DE VERDADE: registra uma cópia de um arquivo local no
 * repositório (storage em disco, banco local) e imprime o link ms-word:ofe|u|…
 * apontando para um backend já em execução. Depois é só abrir o link, editar e
 * salvar no Word; `--conferir <fileId>` mostra o que o portal gravou.
 *
 *   npx tsx scripts/provar-office-real.ts "C:\caminho\arquivo.docx" http://localhost:3199
 *   npx tsx scripts/provar-office-real.ts --conferir <fileId>
 *   npx tsx scripts/provar-office-real.ts --limpar
 *
 * Tudo com prefixo "PROVA-OFFICE"; `--limpar` remove.
 */
import 'dotenv/config';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { LOCAL_ROOT } from '../src/services/storage/LocalDiskProvider.js';
import { issueOfficeToken, officeAppFor, officeDavPath } from '../src/modules/files/files.service.js';

const PREFIXO = 'PROVA-OFFICE';
const EMAIL = 'prova-office@gmail.com';

const MIME: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

async function limpar() {
  await prisma.fileChangeLog.deleteMany({ where: { fileName: { startsWith: PREFIXO } } });
  await prisma.file.deleteMany({ where: { originalName: { startsWith: PREFIXO } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await fsp.rm(path.join(LOCAL_ROOT, 'prova-office'), { recursive: true, force: true });
}

async function conferir(fileId: string) {
  const f = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
  const emDisco = await fsp.stat(path.join(LOCAL_ROOT, f.storageKey));
  const logs = await prisma.fileChangeLog.findMany({ where: { fileId }, orderBy: { createdAt: 'asc' } });
  console.log(JSON.stringify({
    originalName: f.originalName, mimeType: f.mimeType, sizeBytesBanco: f.sizeBytes, sizeBytesDisco: emDisco.size,
    storageKey: f.storageKey, lastEditedAt: f.lastEditedAt, lastEditedByName: f.lastEditedByName,
    logs: logs.map((l) => ({ action: l.action, actor: l.actorName, oldSize: l.oldSize, newSize: l.newSize, em: l.createdAt })),
  }, null, 2));
}

async function registrar(origem: string, base: string) {
  const ext = path.extname(origem).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`Extensão ${ext} não é do Office`);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { name: `${PREFIXO} Gestor`, email: EMAIL, passwordHash: 'x', role: 'GESTOR' },
  });
  const storedName = `prova-${Date.now()}${ext}`;
  const key = `prova-office/${storedName}`;
  await fsp.mkdir(path.join(LOCAL_ROOT, 'prova-office'), { recursive: true });
  await fsp.copyFile(origem, path.join(LOCAL_ROOT, key));
  const size = (await fsp.stat(origem)).size;
  const file = await prisma.file.create({
    data: {
      originalName: `${PREFIXO} ${path.basename(origem)}`, storedName, mimeType: mime, sizeBytes: size,
      storageKey: key, ownerId: user.id,
    },
  });
  const token = issueOfficeToken(file.id, { sub: user.id, email: user.email, role: user.role, name: user.name });
  const davUrl = `${base.replace(/\/+$/, '')}${officeDavPath(token, file.originalName)}`;
  const app = officeAppFor(mime)!;
  const scheme = app === 'word' ? 'ms-word' : app === 'excel' ? 'ms-excel' : 'ms-powerpoint';
  console.log(JSON.stringify({ fileId: file.id, sizeBytes: size, davUrl, url: `${scheme}:ofe|u|${davUrl}` }));
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === '--limpar') return limpar();
  if (a === '--conferir') return conferir(b);
  if (!a) throw new Error('uso: provar-office-real.ts <arquivo> [baseUrl] | --conferir <fileId> | --limpar');
  return registrar(path.resolve(a), b ?? 'http://localhost:3199');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
