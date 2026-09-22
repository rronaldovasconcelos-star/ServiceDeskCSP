/**
 * Integração com a pasta "Holerites" do Google Drive do portal.
 *
 * Fluxo: o RH salva o TXT exportado da folha na pasta; o portal lista os
 * arquivos .txt, importa os que ainda não entraram (dedupe pelo id do arquivo
 * no Drive) e cada colaborador baixa o próprio PDF pelo portal.
 *
 * Usa as mesmas credenciais OAuth2 do Repositório/Backups (STORAGE_PROVIDER=google-drive).
 */
import { google, drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { HoleriteParseError } from './holerite.parser.js';
import { importarArquivo, HoleriteErro, type Ator, type ResultadoImportacao } from './holerites.service.js';

let cachedDrive: drive_v3.Drive | null = null;
let cachedFolderId: string | null = null;

export function isHoleriteDriveConfigured(): boolean {
  return Boolean(
    env.storageProvider === 'google-drive' &&
    env.googleOauthClientId &&
    env.googleOauthClientSecret &&
    env.googleOauthRefreshToken,
  );
}

function getDrive(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;
  if (!isHoleriteDriveConfigured()) {
    throw new HoleriteErro('Google Drive não configurado neste ambiente.', 409);
  }
  const oauth2 = new google.auth.OAuth2(env.googleOauthClientId, env.googleOauthClientSecret);
  oauth2.setCredentials({ refresh_token: env.googleOauthRefreshToken });
  cachedDrive = google.drive({ version: 'v3', auth: oauth2 });
  return cachedDrive;
}

/** Retorna (ou cria) a pasta de holerites dentro da raiz do portal no Drive. */
async function getOrCreateFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const drive = getDrive();
  const parent = env.googleDriveRootFolderId || 'root';
  const nome = env.holeriteDriveFolder.replace(/'/g, "\\'");
  const q = [
    `name = '${nome}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parent}' in parents`,
    'trashed = false',
  ].join(' and ');
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  let id = list.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name: env.holeriteDriveFolder, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
      fields: 'id',
    });
    id = created.data.id!;
  }
  cachedFolderId = id;
  return id;
}

export interface ArquivoDrive {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedTime: string;
  /** Já foi importado (registro em HoleriteImportacao com este fileId). */
  importadoEm: string | null;
}

/** Lista os .txt da pasta, do mais recente para o mais antigo, marcando os já importados. */
export async function listarArquivosDrive(): Promise<ArquivoDrive[]> {
  const drive = getDrive();
  const folderId = await getOrCreateFolder();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id,name,size,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 200,
  });
  const arquivos = (res.data.files ?? []).filter((f) => /\.txt$/i.test(f.name ?? ''));
  const ids = arquivos.map((f) => f.id!).filter(Boolean);
  const importados = ids.length
    ? await prisma.holeriteImportacao.findMany({ where: { driveFileId: { in: ids } }, select: { driveFileId: true, createdAt: true } })
    : [];
  const quando = new Map(importados.map((i) => [i.driveFileId!, i.createdAt.toISOString()]));
  return arquivos.map((f) => ({
    id: f.id!,
    name: f.name ?? '',
    sizeBytes: Number(f.size ?? 0),
    modifiedTime: f.modifiedTime ?? '',
    importadoEm: quando.get(f.id!) ?? null,
  }));
}

async function baixarArquivo(fileId: string): Promise<{ nome: string; conteudo: Buffer }> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: 'name' });
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return { nome: meta.data.name ?? fileId, conteudo: Buffer.from(res.data as ArrayBuffer) };
}

export interface ResultadoDrive {
  importados: ResultadoImportacao[];
  erros: Array<{ arquivo: string; erro: string }>;
  ignorados: number; // já importados antes
}

/** Importa um arquivo específico do Drive. */
export async function importarDoDrive(fileId: string, ator: Ator): Promise<ResultadoImportacao> {
  const { nome, conteudo } = await baixarArquivo(fileId);
  return importarArquivo(conteudo, { arquivo: nome, origem: 'DRIVE', driveFileId: fileId, ator });
}

/** Importa todos os .txt da pasta que ainda não entraram. Erros não interrompem os demais. */
export async function importarNovosDoDrive(ator: Ator): Promise<ResultadoDrive> {
  const arquivos = await listarArquivosDrive();
  const resultado: ResultadoDrive = { importados: [], erros: [], ignorados: 0 };
  for (const a of arquivos) {
    if (a.importadoEm) { resultado.ignorados++; continue; }
    try {
      resultado.importados.push(await importarDoDrive(a.id, ator));
    } catch (err) {
      const msg = err instanceof HoleriteParseError || err instanceof HoleriteErro
        ? err.message
        : (err instanceof Error ? err.message : String(err));
      resultado.erros.push({ arquivo: a.name, erro: msg });
    }
  }
  return resultado;
}
