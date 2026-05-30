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
  /** Abre um stream de leitura para a chave persistida. */
  createReadStream(key: string): Readable;
  /** Remove o arquivo da chave (idempotente). */
  delete(key: string): Promise<void>;
  /** Indica se a chave existe no armazenamento. */
  exists(key: string): Promise<boolean>;
}
