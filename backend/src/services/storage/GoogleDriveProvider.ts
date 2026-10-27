import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { google, drive_v3 } from 'googleapis';
import { env } from '../../config/env.js';
import { EditableStorageProvider, StorageError, StorageFileInfo } from './types.js';

// Papéis do Drive que já permitem editar o arquivo.
const EDIT_ROLES = new Set(['owner', 'writer', 'organizer', 'fileOrganizer']);

export class GoogleDriveProvider implements EditableStorageProvider {
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

  // ─── Edição on-line ─────────────────────────────────────────────────────────

  /**
   * Garante que `email` pode editar o arquivo (permissão `writer`, sem e-mail de
   * notificação) e devolve o link do editor do Google. Idempotente: se o e-mail
   * já é editor (ou dono — a própria conta da escola), não cria permissão nova.
   */
  async shareForEdit(key: string, email: string): Promise<{ webViewLink: string }> {
    try {
      const alvo = email.trim().toLowerCase();
      const perms = await this.drive.permissions.list({
        fileId: key,
        fields: 'permissions(id,emailAddress,role)',
      });
      const jaEdita = (perms.data.permissions ?? []).some(
        (p) => (p.emailAddress ?? '').toLowerCase() === alvo && EDIT_ROLES.has(p.role ?? ''),
      );
      if (!jaEdita) {
        await this.drive.permissions.create({
          fileId: key,
          sendNotificationEmail: false,
          requestBody: { type: 'user', role: 'writer', emailAddress: email },
        });
      }
      const meta = await this.drive.files.get({ fileId: key, fields: 'webViewLink' });
      if (!meta.data.webViewLink) throw new StorageError('O Google Drive não devolveu o link do editor.', 502);
      return { webViewLink: meta.data.webViewLink };
    } catch (err) {
      throw toStorageError(err, email);
    }
  }

  /** Metadados atuais do arquivo no Drive (para detectar edição e corrigir tamanho/mime). */
  async getInfo(key: string): Promise<StorageFileInfo> {
    try {
      const res = await this.drive.files.get({
        fileId: key,
        fields: 'size,mimeType,modifiedTime,webViewLink,lastModifyingUser(displayName,emailAddress)',
      });
      const d = res.data;
      return {
        sizeBytes: Number(d.size ?? 0),
        mimeType: d.mimeType ?? 'application/octet-stream',
        modifiedTime: d.modifiedTime ? new Date(d.modifiedTime) : null,
        webViewLink: d.webViewLink ?? null,
        lastModifiedByName: d.lastModifyingUser?.displayName ?? null,
        lastModifiedByEmail: d.lastModifyingUser?.emailAddress ?? null,
      };
    } catch (err) {
      throw toStorageError(err);
    }
  }
}

/** Traduz erros da API do Drive em StorageError com status e mensagem em português. */
function toStorageError(err: unknown, email?: string): StorageError {
  if (err instanceof StorageError) return err;
  const e = err as { status?: number; code?: number; errors?: Array<{ reason?: string }>; message?: string };
  const status = e?.status ?? e?.code;
  const reason = e?.errors?.[0]?.reason ?? '';
  if (reason === 'invalidSharingRequest' || /invalidSharingRequest/.test(e?.message ?? '')) {
    return new StorageError(
      `O e-mail ${email ?? ''} não é uma conta Google; não foi possível liberar a edição.`.replace('  ', ' '),
      422,
    );
  }
  if (status === 404) return new StorageError('Arquivo ausente no armazenamento', 410);
  console.error('[storage] erro do Google Drive:', e?.message ?? err);
  return new StorageError('Falha ao comunicar com o Google Drive.', 502);
}
