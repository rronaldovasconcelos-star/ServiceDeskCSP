import { Readable } from 'node:stream';

/**
 * Abstração de armazenamento de arquivos.
 * Hoje implementada em disco local; futuramente pode ter um provider S3/R2
 * sem que o controller precise mudar.
 */
export interface StorageProvider {
  /** Move/grava o arquivo de `sourcePath` para a chave lógica `key`. */
  save(key: string, sourcePath: string): Promise<void>;
  /** Abre um stream de leitura para a chave. */
  createReadStream(key: string): Readable;
  /** Remove o arquivo da chave (idempotente). */
  delete(key: string): Promise<void>;
  /** Indica se a chave existe no armazenamento. */
  exists(key: string): Promise<boolean>;
}
