import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../services/storage/index.js';
import { issueResetOtp } from '../auth/auth.controller.js';

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

/**
 * Exclui um usuário e TODOS os seus dados (chamados, arquivos, histórico, suprimentos).
 * Irreversível. As relações não têm onDelete:Cascade no schema (exceto File/VerificationCode),
 * então a remoção é feita explicitamente em transação, na ordem filhos → pai.
 * Chamados de OUTROS atribuídos a este usuário têm apenas o responsável removido.
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;

    // Salvaguarda 1: admin não pode excluir a si mesmo.
    if (req.user!.sub === id) {
      res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

    // Salvaguarda 2: não excluir o último admin ativo.
    if (target.role === 'ADMIN') {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        res.status(400).json({ error: 'Não é possível excluir o único administrador ativo.' });
        return;
      }
    }

    // Apaga os blobs físicos dos arquivos antes de remover os registros.
    const files = await prisma.file.findMany({ where: { ownerId: id }, select: { storageKey: true } });
    for (const f of files) {
      try {
        await storage.delete(f.storageKey);
      } catch (err) {
        console.error(`[deleteUser] falha ao remover blob ${f.storageKey}:`, err instanceof Error ? err.message : err);
      }
    }

    // Remoção transacional: filhos primeiro, usuário por último.
    await prisma.$transaction(async (tx) => {
      // Histórico de chamados/suprimentos autorado por este usuário.
      await tx.ticketHistory.deleteMany({ where: { authorId: id } });
      await tx.supplyRequestHistory.deleteMany({ where: { authorId: id } });

      // Suprimentos solicitados por ele (e o histórico associado vai por cascade do SupplyRequest).
      await tx.supplyRequest.deleteMany({ where: { requesterId: id } });

      // Chamados de OUTROS atribuídos a ele: apenas remove o responsável.
      await tx.ticket.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });

      // Chamados abertos por ele (TicketHistory restante vai por cascade do Ticket).
      await tx.ticket.deleteMany({ where: { requesterId: id } });

      // Arquivos e códigos de verificação têm onDelete:Cascade, mas removemos explicitamente.
      await tx.file.deleteMany({ where: { ownerId: id } });
      await tx.verificationCode.deleteMany({ where: { userId: id } });

      await tx.user.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Força a redefinição de senha de um usuário (ação do admin):
 * dispara um código OTP de redefinição via WhatsApp. A senha antiga continua
 * válida até que o usuário conclua a troca em /redefinir-senha.
 */
export async function forcePasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
    if (!user.phone) {
      res.status(400).json({ error: 'Usuário não possui telefone cadastrado para receber o código.' });
      return;
    }

    try {
      await issueResetOtp(user.id, user.phone, user.name);
    } catch (err) {
      console.error('[WhatsApp][RESET]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Não foi possível enviar o código por WhatsApp.' });
      return;
    }

    res.json({ message: 'Código de redefinição enviado por WhatsApp.' });
  } catch (err) {
    next(err);
  }
}
