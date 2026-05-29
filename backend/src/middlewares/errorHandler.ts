import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
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
