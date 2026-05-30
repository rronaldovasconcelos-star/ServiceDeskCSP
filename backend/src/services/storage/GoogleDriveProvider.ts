import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { google, drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { StorageProvider } from './types.js';

export class GoogleDriveProvider implements StorageProvider {
  private drive: drive_v3.Drive;
  // Cache em memória de ownerId → folderId no Drive (evita buscas repetidas)
  private folderCache = new Map<string, string>();

  constructor() {
    const oauth2 = new google.auth.OAuth2(
      env.googleOauthClientId,
      env.googleOauthClientSecret,
    );
    // Refresh token obtido uma única vez via scripts/google-drive-auth.ts
    oauth2.setCredentials({ refresh_token: env.googleOauthRefreshToken });
    this.drive = google.drive({ version: 'v3', auth: oauth2 });
  }

  // Retorna (ou cria) a subpasta do usuário dentro da pasta raiz do portal.
  private async getOrCreateFolder(ownerId: string): Promise<string> {
    if (this.folderCache.has(ownerId)) return this.folderCache.get(ownerId)!;

    const q = [
      `name = '${ownerId}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `'${env.googleDriveRootFolderId}' in parents`,
      `trashed = false`,
    ].join(' and ');

    const list = await this.drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    if (list.data.files?.length) {
      const id = list.data.files[0].id!;
      this.folderCache.set(ownerId, id);
      return id;
    }

    const created = await this.drive.files.create({
      requestBody: {
        name: ownerId,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [env.googleDriveRootFolderId],
      },
      fields: 'id',
    });
    const id = created.data.id!;
    this.folderCache.set(ownerId, id);
    return id;
  }

  /**
   * Faz upload do arquivo para o Drive na subpasta do dono.
   * Retorna o ID do arquivo no Drive (usado como storageKey no banco).
   * O arquivo temporário é removido do servidor após o upload.
   */
  async save(key: string, sourcePath: string, mimeType?: string): Promise<string> {
    const [ownerId, filename] = key.split('/');
    const folderId = await this.getOrCreateFolder(ownerId);

    const res = await this.drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType ?? 'application/octet-stream',
        body: fs.createReadStream(sourcePath),
      },
      fields: 'id',
    });

    // Remove arquivo temporário do disco do servidor após upload
    await fsp.rm(sourcePath, { force: true });

    return res.data.id!; // ID do Drive → storageKey persistido no banco
  }

  /**
   * Baixa o arquivo do Drive como stream.
   * Usa PassThrough para retornar o stream de forma síncrona.
   */
  createReadStream(key: string): Readable {
    const pass = new PassThrough();
    this.drive.files
      .get({ fileId: key, alt: 'media' }, { responseType: 'stream' })
      .then((res) => (res.data as Readable).pipe(pass))
      .catch((err) => pass.destroy(err instanceof Error ? err : new Error(String(err))));
    return pass;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId: key });
    } catch (err: unknown) {
      // 404 = já removido; ignora (idempotente)
      const status = (err as { status?: number; code?: number })?.status
        ?? (err as { status?: number; code?: number })?.code;
      if (status !== 404) throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.drive.files.get({ fileId: key, fields: 'id' });
      return true;
    } catch {
      return false;
    }
  }
}
