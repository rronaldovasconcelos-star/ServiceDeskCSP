import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { env } from '../config/env.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    const map: Record<string, [number, string]> = {
      LIMIT_FILE_SIZE: [413, `Arquivo excede o limite de ${env.maxFileSizeMb}MB`],
      LIMIT_FILE_COUNT: [400, 'Número de arquivos excede o limite'],
    };
    const [status, msg] = map[err.code] ?? [400, 'Erro no upload do arquivo'];
    res.status(status).json({ error: msg });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: err.flatten().fieldErrors });
    return;
  }

  if (err instanceof Error) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
    return;
  }

  console.error('[UNKNOWN ERROR]', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
}
