import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { google, drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

export interface BackupFile {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string; // ISO
}

const FOLDER_NAME = 'Backups CSP';

let cachedDrive: drive_v3.Drive | null = null;
let cachedFolderId: string | null = null;

/** Indica se o Google Drive está configurado para receber os backups. */
export function isBackupConfigured(): boolean {
  return Boolean(
    env.storageProvider === 'google-drive' &&
    env.googleOauthClientId &&
    env.googleOauthClientSecret &&
    env.googleOauthRefreshToken,
  );
}

function getDrive(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;
  if (!isBackupConfigured()) {
    throw new Error('Backup indisponível: Google Drive (OAuth2) não configurado.');
  }
  const oauth2 = new google.auth.OAuth2(env.googleOauthClientId, env.googleOauthClientSecret);
  oauth2.setCredentials({ refresh_token: env.googleOauthRefreshToken });
  cachedDrive = google.drive({ version: 'v3', auth: oauth2 });
  return cachedDrive;
}

/** Retorna (ou cria) a pasta "Backups CSP" dentro da raiz do portal no Drive. */
async function getOrCreateFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const drive = getDrive();
  const parent = env.googleDriveRootFolderId || 'root';

  const q = [
    `name = '${FOLDER_NAME}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parent}' in parents`,
    `trashed = false`,
  ].join(' and ');

  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (list.data.files?.length) {
    cachedFolderId = list.data.files[0].id!;
    return cachedFolderId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: 'id',
  });
  cachedFolderId = created.data.id!;
  return cachedFolderId;
}

/** Carimbo de data legível e seguro para nome de arquivo (horário local do servidor). */
function timestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
}

/**
 * Gera um snapshot consistente do banco SQLite via `VACUUM INTO` (não trava o
 * banco em uso), compacta com gzip e devolve o caminho do arquivo .db.gz temporário.
 * Retorna também uma função de limpeza dos temporários.
 */
async function makeSnapshot(): Promise<{ gzPath: string; name: string; cleanup: () => Promise<void> }> {
  const stamp = timestamp();
  const base = path.join(os.tmpdir(), `csp-backup-${stamp}`);
  const rawPath = `${base}.db`;
  const gzPath = `${base}.db.gz`;

  // VACUUM INTO exige que o destino não exista previamente.
  await fsp.rm(rawPath, { force: true });
  await fsp.rm(gzPath, { force: true });

  // Snapshot atômico do banco para um arquivo novo. Normaliza separadores para
  // '/' (aceito pelo SQLite no Linux e no Windows) e escapa aspas simples.
  const dest = rawPath.replace(/\\/g, '/').replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dest}'`);

  // Compacta para reduzir o tamanho no Drive.
  await pipeline(
    fs.createReadStream(rawPath),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(gzPath),
  );

  return {
    gzPath,
    name: `csp-backup-${stamp}.db.gz`,
    cleanup: async () => {
      await fsp.rm(rawPath, { force: true });
      await fsp.rm(gzPath, { force: true });
    },
  };
}

/** Mantém apenas os `keep` backups mais recentes, removendo os excedentes. */
async function prune(keep: number): Promise<void> {
  if (keep <= 0) return;
  const all = await listBackups();
  for (const old of all.slice(keep)) {
    try {
      await getDrive().files.delete({ fileId: old.id });
    } catch (err) {
      console.error(`[backup] falha ao remover backup antigo ${old.name}:`, err);
    }
  }
}

/**
 * Gera o backup e faz upload para o Drive. Aplica a retenção configurada.
 * Retorna os metadados do arquivo criado.
 */
export async function createBackup(): Promise<BackupFile> {
  const drive = getDrive();
  const folderId = await getOrCreateFolder();
  const snap = await makeSnapshot();

  try {
    const res = await drive.files.create({
      requestBody: { name: snap.name, parents: [folderId] },
      media: { mimeType: 'application/gzip', body: fs.createReadStream(snap.gzPath) },
      fields: 'id,name,size,createdTime',
    });
    await prune(env.backupRetention);
    return {
      id: res.data.id!,
      name: res.data.name ?? snap.name,
      sizeBytes: Number(res.data.size ?? 0),
      createdAt: res.data.createdTime ?? new Date().toISOString(),
    };
  } finally {
    await snap.cleanup();
  }
}

/** Lista os backups existentes no Drive, do mais recente para o mais antigo. */
export async function listBackups(): Promise<BackupFile[]> {
  const drive = getDrive();
  const folderId = await getOrCreateFolder();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,size,createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 1000,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? 'backup',
    sizeBytes: Number(f.size ?? 0),
    createdAt: f.createdTime ?? new Date(0).toISOString(),
  }));
}

/** Abre o stream de download de um backup e devolve nome + tamanho. */
export async function getBackupStream(
  fileId: string,
): Promise<{ stream: Readable; name: string; sizeBytes: number }> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: 'name,size' });
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return {
    stream: res.data as Readable,
    name: meta.data.name ?? 'backup.db.gz',
    sizeBytes: Number(meta.data.size ?? 0),
  };
}

/** Remove um backup do Drive (idempotente para 404). */
export async function deleteBackup(fileId: string): Promise<void> {
  try {
    await getDrive().files.delete({ fileId });
  } catch (err: unknown) {
    const status = (err as { status?: number; code?: number })?.status
      ?? (err as { status?: number; code?: number })?.code;
    if (status !== 404) throw err;
  }
}
