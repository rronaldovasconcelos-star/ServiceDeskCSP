/**
 * Edição do repositório de arquivos sem "baixar, editar fora e subir".
 *
 * Dois caminhos:
 *
 * 1. Google Docs/Planilhas/Apresentações no Drive ("Editar no Google"). Os
 *    arquivos de produção moram no Drive da conta da escola; o portal compartilha
 *    o arquivo (permissão de escrita) com o e-mail do usuário logado e devolve o
 *    link do editor, que salva no MESMO arquivo. A sincronização consulta o Drive
 *    e corrige tamanho/mime/nome no banco, registrando a modificação no log.
 *    Limite conhecido: o Google CONVERTE o que abre (um .doc vira .docx) e perde
 *    WordArt, caixas de texto e cabeçalhos elaborados — por isso o portal avisa
 *    antes de abrir formato antigo e renomeia o arquivo quando a conversão
 *    acontece.
 *
 * 2. Word/Excel/PowerPoint instalados no PC ("Abrir no Word"). O portal emite um
 *    link `ms-word:ofe|u|https://.../api/dav/<token>/<nome>` que o Office abre
 *    direto pelo WebDAV mínimo do backend (files.dav.ts) e salva de volta no
 *    MESMO arquivo. Fidelidade total, porque é o próprio Office. O token é um
 *    JWT com escopo `dav`, preso a UM arquivo e a UM usuário, com validade curta.
 *
 * Regra dos dois: quem edita é quem baixa — dono do arquivo, ADMIN ou GESTOR.
 */
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
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
export type OfficeApp = 'word' | 'excel' | 'powerpoint';

export interface FileDeps {
  storage: StorageProvider;
}

const depsPadrao: FileDeps = { storage: storagePadrao };

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Mime → produto Google que abre o arquivo em modo Office. null = não editável on-line. */
export function editorKindFor(mime: string): EditorKind | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/msword' || m.includes('wordprocessingml')) return 'docs';
  if (m === 'application/vnd.ms-excel' || m.includes('spreadsheetml')) return 'sheets';
  if (m === 'application/vnd.ms-powerpoint' || m.includes('presentationml')) return 'slides';
  return null;
}

/** Mime → programa do Office que abre o arquivo pelo WebDAV. null = não é documento Office. */
export function officeAppFor(mime: string): OfficeApp | null {
  const k = editorKindFor(mime);
  return k === 'docs' ? 'word' : k === 'sheets' ? 'excel' : k === 'slides' ? 'powerpoint' : null;
}

/**
 * Formato antigo do Office (.doc/.xls/.ppt): o Google não edita no lugar — converte
 * para .docx/.xlsx/.pptx e perde formatação. O front avisa antes de abrir.
 */
export function isLegacyOffice(mime: string): boolean {
  const m = (mime ?? '').toLowerCase();
  return m === 'application/msword' || m === 'application/vnd.ms-excel' || m === 'application/vnd.ms-powerpoint';
}

/** Extensão canônica de cada mime de documento; null quando não se sabe. */
export function extensionForMime(mime: string): string | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/msword') return '.doc';
  if (m === 'application/vnd.ms-excel') return '.xls';
  if (m === 'application/vnd.ms-powerpoint') return '.ppt';
  if (m === MIME_DOCX) return '.docx';
  if (m === MIME_XLSX) return '.xlsx';
  if (m === MIME_PPTX) return '.pptx';
  if (m === 'application/pdf') return '.pdf';
  return null;
}

/**
 * Nome com a extensão certa para o mime. Só mexe quando o mime tem extensão
 * conhecida E ela difere da atual (ex.: o Google converteu "prova.doc" em
 * .docx → "prova.docx"). Qualquer outro caso devolve o nome intacto.
 */
export function renameForMime(name: string, mime: string): string {
  const ext = extensionForMime(mime);
  if (!ext) return name;
  const ponto = name.lastIndexOf('.');
  const atual = ponto > 0 ? name.slice(ponto).toLowerCase() : '';
  if (atual === ext) return name;
  const base = ponto > 0 ? name.slice(0, ponto) : name;
  return `${base}${ext}`;
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
 * tamanho/mime/nome/quem editou e registra MODIFIED. Sem baseline, só grava a
 * baseline (não conta como edição). Provider sem edição: no-op.
 *
 * Nome: quando o Drive devolve um mime diferente do gravado (o Google converteu
 * .doc → .docx ao editar), a extensão do nome acompanha — senão o download
 * entregaria um .docx chamado .doc.
 */
export async function syncFileMetadata(
  fileId: string,
  deps: FileDeps = depsPadrao,
): Promise<{ changed: boolean; file: FileDb }> {
  const file = await buscar(fileId);
  if (!isEditableStorage(deps.storage)) return { changed: false, file };

  try {
    const info = await deps.storage.getInfo(file.storageKey);
    const nomes = {
      originalName: renameForMime(file.originalName, info.mimeType),
      storedName: renameForMime(file.storedName, info.mimeType),
    };

    if (!file.driveModifiedTime) {
      const atualizado = await prisma.file.update({
        where: { id: file.id },
        data: { sizeBytes: info.sizeBytes, mimeType: info.mimeType, driveModifiedTime: info.modifiedTime, ...nomes },
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
        ...nomes,
      },
    });
    await prisma.fileChangeLog.create({
      data: {
        fileId: file.id,
        fileName: nomes.originalName,
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
 * `converts` avisa que o Google vai converter o formato antigo (.doc/.xls/.ppt).
 */
export async function openEditSession(
  fileId: string,
  user: AuthPayload,
  deps: FileDeps = depsPadrao,
): Promise<{ url: string; editor: EditorKind; converts: boolean }> {
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

    return { url: webViewLink, editor, converts: isLegacyOffice(file.mimeType) };
  } catch (err) {
    return comoFileErro(err);
  }
}

// ─── Office instalado (Word/Excel/PowerPoint) pelo WebDAV ──────────────────────

/** Validade do link do Office: tempo que o Word pode ficar aberto e ainda salvar. */
export const OFFICE_TOKEN_EXPIRES_IN = '12h';

/** O que vai dentro do token do WebDAV: um arquivo, um usuário. */
export interface OfficeTokenPayload {
  scope: 'dav';
  fid: string;
  sub: string;
  email: string;
  role: string;
  name: string;
}

export function issueOfficeToken(fileId: string, user: AuthPayload): string {
  const payload: OfficeTokenPayload = {
    scope: 'dav', fid: fileId, sub: user.sub, email: user.email, role: user.role, name: user.name,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: OFFICE_TOKEN_EXPIRES_IN } as jwt.SignOptions);
}

/** Token inválido, expirado ou de outro escopo (ex.: o JWT de login) → 403. */
export function verifyOfficeToken(token: string): OfficeTokenPayload {
  let p: unknown;
  try {
    p = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new FileErro('Link do Office inválido ou expirado. Abra o arquivo de novo pelo portal.', 403);
  }
  const t = p as Partial<OfficeTokenPayload>;
  if (t?.scope !== 'dav' || !t.fid || !t.sub) {
    throw new FileErro('Link do Office inválido.', 403);
  }
  return t as OfficeTokenPayload;
}

const OFFICE_SCHEME: Record<OfficeApp, string> = {
  word: 'ms-word', excel: 'ms-excel', powerpoint: 'ms-powerpoint',
};

/** Caminho do arquivo no WebDAV do portal (relativo ao host da API). */
export function officeDavPath(token: string, originalName: string): string {
  return `/api/dav/${token}/${encodeURIComponent(originalName)}`;
}

/**
 * Emite o link `ms-word:ofe|u|<url>` (ou Excel/PowerPoint) que abre o arquivo no
 * Office instalado, direto pelo WebDAV do portal. Recusas: 404 → 403 → 415.
 * Funciona com qualquer storage (disco ou Drive): o WebDAV lê e grava pelo provider.
 */
export async function openOfficeSession(
  fileId: string,
  user: AuthPayload,
  apiBaseUrl: string,
  deps: FileDeps = depsPadrao,
): Promise<{ url: string; app: OfficeApp; davUrl: string }> {
  let file = await buscar(fileId);
  if (!canAccessFile(file, user)) throw new FileErro('Acesso negado', 403);

  const app = officeAppFor(file.mimeType);
  if (!app) {
    throw new FileErro('Só documentos do Word, Excel e PowerPoint abrem no Office.', 415);
  }

  try {
    // Com Drive: absorve edições/conversões feitas no Google antes de emitir o nome do link.
    if (isEditableStorage(deps.storage)) file = (await syncFileMetadata(file.id, deps)).file;

    const token = issueOfficeToken(file.id, user);
    const davUrl = `${apiBaseUrl.replace(/\/+$/, '')}${officeDavPath(token, file.originalName)}`;

    await prisma.fileChangeLog.create({
      data: {
        fileId: file.id,
        fileName: file.originalName,
        action: 'EDIT_OFFICE',
        actorId: user.sub,
        actorName: user.name,
        actorEmail: user.email,
        oldSize: file.sizeBytes,
        newSize: null,
        oldMime: file.mimeType,
        newMime: null,
      },
    });

    return { url: `${OFFICE_SCHEME[app]}:ofe|u|${davUrl}`, app, davUrl };
  } catch (err) {
    return comoFileErro(err);
  }
}

/**
 * Arquivo que um token do WebDAV pode ver. Confere de novo o acesso (o dono pode
 * ter mudado, o arquivo pode ter sido excluído) — o token sozinho não basta.
 */
export async function fileForOffice(payload: OfficeTokenPayload, deps: FileDeps = depsPadrao): Promise<FileDb> {
  // O link vale 12h: confere a conta no banco a cada pedido do Office (conta
  // desativada/apagada perde o acesso na hora; vale o perfil gravado agora).
  const conta = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, isActive: true } });
  if (!conta || !conta.isActive) throw new FileErro('Conta desativada. Entre no portal novamente.', 403);
  let file = await buscar(payload.fid);
  const user: AuthPayload = { sub: payload.sub, email: payload.email, role: conta.role, name: payload.name };
  if (!canAccessFile(file, user)) throw new FileErro('Acesso negado', 403);
  if (isEditableStorage(deps.storage)) {
    try {
      file = (await syncFileMetadata(file.id, deps)).file;
    } catch (e) {
      console.error('[files] sincronização antes de servir ao Office falhou:', e);
    }
  }
  return file;
}

/**
 * O Office salvou (PUT): troca o conteúdo no storage mantendo a chave, atualiza
 * tamanho/quem editou e registra SAVED_OFFICE. Com Drive, regrava a baseline para
 * a sincronização do Google não contar a mesma gravação como MODIFIED.
 */
export async function saveFromOffice(
  payload: OfficeTokenPayload,
  tmpPath: string,
  sizeBytes: number,
  deps: FileDeps = depsPadrao,
): Promise<FileDb> {
  const file = await fileForOffice(payload, deps);
  if (sizeBytes <= 0) throw new FileErro('Conteúdo vazio recusado.', 400);

  try {
    await deps.storage.overwrite(file.storageKey, tmpPath, file.mimeType);

    const agora = new Date();
    let driveModifiedTime: Date | null | undefined;
    if (isEditableStorage(deps.storage)) {
      driveModifiedTime = (await deps.storage.getInfo(file.storageKey)).modifiedTime;
    }

    const atualizado = await prisma.file.update({
      where: { id: file.id },
      data: {
        sizeBytes,
        lastEditedAt: agora,
        lastEditedByName: payload.name,
        ...(driveModifiedTime !== undefined ? { driveModifiedTime } : {}),
      },
    });
    await prisma.fileChangeLog.create({
      data: {
        fileId: file.id,
        fileName: file.originalName,
        action: 'SAVED_OFFICE',
        actorId: payload.sub,
        actorName: payload.name,
        actorEmail: payload.email,
        oldSize: file.sizeBytes,
        newSize: sizeBytes,
        oldMime: file.mimeType,
        newMime: file.mimeType,
      },
    });
    return atualizado;
  } catch (err) {
    return comoFileErro(err);
  }
}
