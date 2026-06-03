import { Request, Response, NextFunction } from 'express';
import {
  isBackupConfigured,
  createBackup,
  listBackups,
  getBackupStream,
  deleteBackup,
} from './backup.service.js';

/** Lista os backups disponíveis no Google Drive. */
export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isBackupConfigured()) {
      res.json({ configured: false, backups: [] });
      return;
    }
    const backups = await listBackups();
    res.json({ configured: true, backups });
  } catch (err) {
    next(err);
  }
}

/** Gera um backup imediatamente ("backup agora"). */
export async function runNow(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isBackupConfigured()) {
      res.status(409).json({ error: 'Google Drive não configurado para backups.' });
      return;
    }
    const backup = await createBackup();
    res.status(201).json(backup);
  } catch (err) {
    next(err);
  }
}

/** Faz o download de um backup específico. */
export async function download(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isBackupConfigured()) {
      res.status(409).json({ error: 'Google Drive não configurado para backups.' });
      return;
    }
    const { stream, name, sizeBytes } = await getBackupStream(req.params.id as string);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/** Remove um backup do Drive. */
export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteBackup(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
