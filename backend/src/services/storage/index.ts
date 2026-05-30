import { env } from '../../config/env.js';
import { LocalDiskProvider } from './LocalDiskProvider.js';
import { GoogleDriveProvider } from './GoogleDriveProvider.js';
import { StorageProvider } from './types.js';

function buildProvider(): StorageProvider {
  if (env.storageProvider === 'google-drive') {
    return new GoogleDriveProvider();
  }
  return new LocalDiskProvider();
}

export const storage: StorageProvider = buildProvider();
