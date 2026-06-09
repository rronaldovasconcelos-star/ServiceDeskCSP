import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
  modules?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    next();
  };
}

/**
 * Libera a rota se o usuário for ADMIN (superusuário) ou tiver ao menos um
 * dos módulos informados liberado na sua conta. As permissões vêm do JWT
 * (req.user.modules) — refletem após novo login, igual ao `role`.
 */
export function requireModule(...keys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (req.user.role === 'ADMIN') {
      next();
      return;
    }
    const granted = req.user.modules ?? [];
    if (keys.some((k) => granted.includes(k))) {
      next();
      return;
    }
    res.status(403).json({ error: 'Acesso negado' });
  };
}
