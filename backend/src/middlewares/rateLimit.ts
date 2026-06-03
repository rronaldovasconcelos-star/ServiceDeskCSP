import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
  /** Máximo de requisições permitidas por IP dentro da janela. */
  max: number;
  /** Mensagem de erro retornada ao estourar o limite. */
  message?: string;
}

/**
 * Rate-limiter em memória, por IP, com janela fixa. Suficiente para um único
 * container (a aplicação roda em instância única). Evita brute force em
 * endpoints sensíveis como /auth/login sem adicionar dependências externas.
 *
 * Requer `app.set('trust proxy', ...)` quando atrás de um proxy (Traefik), para
 * que `req.ip` reflita o IP real do cliente (X-Forwarded-For) e não o do proxy.
 */
export function rateLimit({ windowMs, max, message = 'Muitas tentativas. Tente novamente em instantes.' }: RateLimitOptions) {
  const hits = new Map<string, Bucket>();

  // Limpeza periódica para o Map não crescer indefinidamente.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  cleanup.unref?.(); // não impede o processo de encerrar

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    let bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }
    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
