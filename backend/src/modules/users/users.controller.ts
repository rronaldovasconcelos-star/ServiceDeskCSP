import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
  phone: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  phone: z.string().optional(),
});

const select = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  phoneVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await prisma.user.findMany({ select, orderBy: { name: 'asc' } });
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash, role: data.role, phone: data.phone },
      select,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    const data = updateSchema.parse(req.body);
    const update: Record<string, unknown> = { ...data };
    if (data.password) {
      update.passwordHash = await bcrypt.hash(data.password, 10);
      delete update.password;
    }
    const user = await prisma.user.update({ where: { id: req.params.id as string }, data: update, select });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!current) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isActive: !current.isActive },
      select,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}
