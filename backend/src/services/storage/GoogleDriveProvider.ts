import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { google, drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { StorageProvider } from './types.js';

export class GoogleDriveProvider implements StorageProvider {
  private drive: drive_v3.Drive;
  // Cache em memória de caminho cumulativo ("Seg1/Seg2/...") → folderId no Drive.
  private folderCache = new Map<string, string>();
  // Dedupe de criações de pasta em voo (evita pastas irmãs duplicadas em uploads concorrentes).
  private inFlight = new Map<string, Promise<string>>();

  constructor() {
    const oauth2 = new google.auth.OAuth2(
      env.googleOauthClientId,
      env.googleOauthClientSecret,
    );
    // Refresh token obtido uma única vez via scripts/google-drive-auth.ts
    oauth2.setCredentials({ refresh_token: env.googleOauthRefreshToken });
    this.drive = google.drive({ version: 'v3', auth: oauth2 });
  }

  // Encontra (ou cria) UMA pasta de nome `name` dentro de `parentId`. Memoiza por
  // caminho cumulativo e deduplica chamadas concorrentes para o mesmo caminho.
  private getOrCreateOne(parentId: string, name: string, cumPath: string): Promise<string> {
    const cached = this.folderCache.get(cumPath);
    if (cached) return Promise.resolve(cached);
    const pending = this.inFlight.get(cumPath);
    if (pending) return pending;

    const task = (async () => {
      const safe = name.replace(/'/g, "\\'"); // escapa aspas simples no q
      const q = [
        `name = '${safe}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        `'${parentId}' in parents`,
        `trashed = false`,
      ].join(' and ');

      const list = await this.drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
      let id = list.data.files?.[0]?.id;
      if (!id) {
        const created = await this.drive.files.create({
          requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
          },
          fields: 'id',
        });
        id = created.data.id!;
      }
      this.folderCache.set(cumPath, id);
      return id;
    })();

    this.inFlight.set(cumPath, task);
    task.finally(() => this.inFlight.delete(cumPath));
    return task;
  }

  // Caminha (criando o que faltar) a árvore de pastas a partir da raiz do portal.
  private async getOrCreateFolderPath(segments: string[]): Promise<string> {
    let parentId = env.googleDriveRootFolderId;
    const acc: string[] = [];
    for (const seg of segments) {
      acc.push(seg);
      parentId = await this.getOrCreateOne(parentId, seg, acc.join('/'));
    }
    return parentId;
  }

  /**
   * Faz upload do arquivo para o Drive espelhando a árvore acadêmica da chave
   * ({Ano}/{Segmento}/.../{Tipo}/{storedName}).
   * Retorna o ID do arquivo no Drive (usado como storageKey no banco).
   * O arquivo temporário é removido do servidor após o upload.
   */
  async save(key: string, sourcePath: string, mimeType?: string): Promise<string> {
    const segments = key.split('/');
    const filename = segments.pop()!;
    const folderId = await this.getOrCreateFolderPath(segments);

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
