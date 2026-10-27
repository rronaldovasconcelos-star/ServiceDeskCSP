import { Readable } from 'node:stream';

/**
 * Abstração de armazenamento de arquivos.
 * Implementações: LocalDiskProvider (disco local) e GoogleDriveProvider.
 * Trocar de provider não requer alteração no controller.
 */
export interface StorageProvider {
  /**
   * Grava o arquivo de `sourcePath` no storage.
   * Retorna a chave efetiva a ser persistida no banco (pode diferir do `key`
   * passado — ex: Google Drive retorna o ID do arquivo em vez do caminho).
   */
  save(key: string, sourcePath: string, mimeType?: string): Promise<string>;
  /**
   * Troca o CONTEÚDO de uma chave já existente pelo arquivo de `sourcePath`,
   * mantendo a mesma chave (no Drive: mesmo id, mesmas permissões). Usado quando
   * o Word/Excel/PowerPoint salva pelo WebDAV do portal. Remove o temporário.
   */
  overwrite(key: string, sourcePath: string, mimeType?: string): Promise<void>;
  /** Abre um stream de leitura para a chave persistida. */
  createReadStream(key: string): Readable;
  /** Remove o arquivo da chave (idempotente). */
  delete(key: string): Promise<void>;
  /** Indica se a chave existe no armazenamento. */
  exists(key: string): Promise<boolean>;
}

/** Metadados atuais de um arquivo no storage (usado pela edição on-line). */
export interface StorageFileInfo {
  sizeBytes: number;
  mimeType: string;
  modifiedTime: Date | null;
  webViewLink: string | null;
  lastModifiedByName: string | null;
  lastModifiedByEmail: string | null;
}

/**
 * Providers que permitem abrir o arquivo num editor on-line (hoje só o Google
 * Drive). O LocalDiskProvider NÃO implementa — o serviço responde 409.
 */
export interface EditableStorageProvider extends StorageProvider {
  /** Garante permissão de escrita para `email` (idempotente) e devolve o link do editor. */
  shareForEdit(key: string, email: string): Promise<{ webViewLink: string }>;
  /** Metadados atuais no storage (tamanho, mime, modifiedTime, quem modificou). */
  getInfo(key: string): Promise<StorageFileInfo>;
}

export function isEditableStorage(p: StorageProvider): p is EditableStorageProvider {
  const c = p as Partial<EditableStorageProvider>;
  return typeof c.shareForEdit === 'function' && typeof c.getInfo === 'function';
}

/** Erro de storage com status HTTP já resolvido (o service repassa como FileErro). */
export class StorageError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'StorageError';
  }
}
