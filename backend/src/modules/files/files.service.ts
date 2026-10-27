/**
 * Edição on-line do repositório de arquivos.
 *
 * Os arquivos de produção moram no Google Drive da conta da escola. "Editar"
 * compartilha o arquivo (permissão de escrita) com o e-mail do usuário logado e
 * devolve o link do editor do Google, que salva no MESMO arquivo. Depois, a
 * sincronização consulta o Drive e corrige tamanho/mime no banco, registrando a
 * modificação no FileChangeLog.
 *
 * Regra: quem edita é quem baixa — dono do arquivo, ADMIN ou GESTOR.
 */
import { prisma } from '../../lib/prisma.js';
import type { AuthPayload } from '../../middlewares/authenticate.js';
import { storage as storagePadrao } from '../../services/storage/index.js';
import { isEditableStorage, StorageError, StorageProvider } from '../../services/storage/types.js';

export class FileErro extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'FileErro';
  }
}

export type EditorKind = 'docs' | 'sheets' | 'slides';

export interface FileDeps {
  storage: StorageProvider;
}

const depsPadrao: FileDeps = { storage: storagePadrao };

/** Mime → produto Google que abre o arquivo em modo Office. null = não editável on-line. */
export function editorKindFor(mime: string): EditorKind | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/msword' || m.includes('wordprocessingml')) return 'docs';
  if (m === 'application/vnd.ms-excel' || m.includes('spreadsheetml')) return 'sheets';
  if (m === 'application/vnd.ms-powerpoint' || m.includes('presentationml')) return 'slides';
  return null;
}

/** Mesma regra do download: dono, ADMIN ou GESTOR. */
export function canAccessFile(file: { ownerId: string }, user: AuthPayload): boolean {
  return user.role === 'ADMIN' || user.role === 'GESTOR' || file.ownerId === user.sub;
}

export function storageSupportsEdit(deps: FileDeps = depsPadrao): boolean {
  return isEditableStorage(deps.storage);
}

type FileDb = NonNullable<Awaited<ReturnType<typeof prisma.file.findUnique>>>;

async function buscar(fileId: string): Promise<FileDb> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) throw new FileErro('Arquivo não encontrado', 404);
  return file;
}

function comoFileErro(err: unknown): never {
  if (err instanceof FileErro) throw err;
  if (err instanceof StorageError) throw new FileErro(err.message, err.status);
  throw err;
}

/**
 * Compara o Drive com a baseline gravada. Se o arquivo mudou on-line, atualiza
 * tamanho/mime/quem editou e registra MODIFIED. Sem baseline, só grava a
 * baseline (não conta como edição). Provider sem edição: no-op.
 */
export async function syncFileMetadata(
  fileId: string,
  deps: FileDeps = depsPadrao,
): Promise<{ changed: boolean; file: FileDb }> {
  const file = await buscar(fileId);
  if (!isEditableStorage(deps.storage)) return { changed: false, file };

  try {
    const info = await deps.storage.getInfo(file.storageKey);

    if (!file.driveModifiedTime) {
      const atualizado = await prisma.file.update({
        where: { id: file.id },
        data: { sizeBytes: info.sizeBytes, mimeType: info.mimeType, driveModifiedTime: info.modifiedTime },
      });
      return { changed: false, file: atualizado };
    }

    if (!info.modifiedTime || info.modifiedTime.getTime() <= file.driveModifiedTime.getTime()) {
      return { changed: false, file };
    }

    // Quem modificou: o Drive informa; se não informar, assume quem abriu o editor por último.
    let ator = { actorId: '', actorName: info.lastModifiedByName ?? 'Google Drive', actorEmail: info.lastModifiedByEmail ?? '' };
    const ultimoEdit = await prisma.fileChangeLog.findFirst({
      where: { fileId: file.id, action: 'EDIT' },
      orderBy: { createdAt: 'desc' },
    });
    if (ultimoEdit) {
      ator = {
        actorId: ultimoEdit.actorId,
        actorName: info.lastModifiedByName ?? ultimoEdit.actorName,
        actorEmail: info.lastModifiedByEmail ?? ultimoEdit.actorEmail,
      };
    }

    const atualizado = await prisma.file.update({
      where: { id: file.id },
      data: {
        sizeBytes: info.sizeBytes,
        mimeType: info.mimeType,
        driveModifiedTime: info.modifiedTime,
        lastEditedAt: info.modifiedTime,
        lastEditedByName: ator.actorName,
      },
    });
    await prisma.fileChangeLog.create({
      data: {
        fileId: file.id,
        fileName: file.originalName,
        action: 'MODIFIED',
        ...ator,
        oldSize: file.sizeBytes,
        newSize: info.sizeBytes,
        oldMime: file.mimeType,
        newMime: info.mimeType,
      },
    });
    return { changed: true, file: atualizado };
  } catch (err) {
    return comoFileErro(err);
  }
}

/**
 * Libera a edição do arquivo para o usuário e devolve o link do editor.
 * Ordem das recusas: 404 → 403 → 415 (tipo) → 409 (provider) → erros do Drive.
 */
export async function openEditSession(
  fileId: string,
  user: AuthPayload,
  deps: FileDeps = depsPadrao,
): Promise<{ url: string; editor: EditorKind }> {
  let file = await buscar(fileId);
  if (!canAccessFile(file, user)) throw new FileErro('Acesso negado', 403);

  const editor = editorKindFor(file.mimeType);
  if (!editor) {
    throw new FileErro('Este tipo de arquivo não pode ser editado on-line. Baixe, edite e use "Substituir".', 415);
  }
  if (!isEditableStorage(deps.storage)) {
    throw new FileErro('A edição on-line está disponível apenas com o armazenamento no Google Drive.', 409);
  }

  try {
    // Garante a baseline e absorve edições feitas direto no Drive desde a última vez.
    file = (await syncFileMetadata(file.id, deps)).file;

    const { webViewLink } = await deps.storage.shareForEdit(file.storageKey, user.email);

    await prisma.fileChangeLog.create({
      data: {
        fileId: file.id,
        fileName: file.originalName,
        action: 'EDIT',
        actorId: user.sub,
        actorName: user.name,
        actorEmail: user.email,
        oldSize: file.sizeBytes,
        newSize: null,
        oldMime: file.mimeType,
        newMime: null,
      },
    });

    return { url: webViewLink, editor };
  } catch (err) {
    return comoFileErro(err);
  }
}
