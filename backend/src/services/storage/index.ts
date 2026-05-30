import { env } from '../../config/env.js';
import { LocalDiskProvider } from './LocalDiskProvider.js';
import { StorageProvider } from './types.js';

function buildProvider(): StorageProvider {
  // Futuro: if (env.storageProvider === 's3') return new S3Provider();
  void env.storageProvider;
  return new LocalDiskProvider();
}

export const storage: StorageProvider = buildProvider();
