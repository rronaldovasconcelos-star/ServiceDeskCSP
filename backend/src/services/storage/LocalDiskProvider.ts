import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../../config/env.js';
import { StorageProvider } from './types.js';

/** Raiz do armazenamento local (ex: <cwd>/uploads). */
const ROOT = path.resolve(process.cwd(), env.uploadDir);

// Garante a pasta raiz no boot.
fs.mkdirSync(ROOT, { recursive: true });

export class LocalDiskProvider implements StorageProvider {
  async save(key: string, sourcePath: string): Promise<void> {
    const dest = path.join(ROOT, key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(sourcePath, dest);
  }

  createReadStream(key: string): Readable {
    return fs.createReadStream(path.join(ROOT, key));
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(path.join(ROOT, key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return fsp
      .access(path.join(ROOT, key))
      .then(() => true)
      .catch(() => false);
  }
}

export { ROOT as LOCAL_ROOT };
