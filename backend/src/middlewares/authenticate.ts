import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { parseModules } from '../lib/modules.js';

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

/**
 * Valida o JWT e confere a conta no banco a cada requisição: conta desativada
 * ou apagada perde o acesso na hora, e perfil/módulos valem o que está gravado
 * agora (não o que estava no token quando a pessoa entrou).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  let payload: AuthPayload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, role: true, name: true, modules: true, isActive: true },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
      return;
    }
    req.user = { sub: payload.sub, email: user.email, role: user.role, name: user.name, modules: parseModules(user.modules) };
    next();
  } catch (err) {
    next(err);
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
