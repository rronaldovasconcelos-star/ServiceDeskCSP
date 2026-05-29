import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  category: z.enum(['TI', 'SUPRIMENTOS']),
  urgency: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  ABERTO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
};

const ticketSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  urgency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  requester: { select: { id: true, name: true, email: true, phone: true } },
  assignee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TicketSelect;

export async function listTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, category, urgency } = req.query;
    const isAdmin = req.user!.role === 'ADMIN';

    const where: Record<string, unknown> = {};
    if (!isAdmin) where.requesterId = req.user!.sub;
    if (status) where.status = status;
    if (category) where.category = category;
    if (urgency) where.urgency = urgency;

    const tickets = await prisma.ticket.findMany({
      where,
      select: ticketSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
}

export async function createTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    const ticket = await prisma.ticket.create({
      data: { ...data, requesterId: req.user!.sub },
      select: ticketSelect,
    });

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.sub,
        type: 'STATUS_CHANGE',
        message: 'Chamado aberto',
        toStatus: 'ABERTO',
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    for (const admin of admins) {
      await sendWhatsApp(
        admin.phone,
        `📋 Novo chamado aberto!\n*${ticket.title}*\nCategoria: ${ticket.category}\nUrgência: ${ticket.urgency}\nSolicitante: ${ticket.requester.name}`,
      );
    }

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function getTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id as string },
      select: {
        ...ticketSelect,
        history: {
          select: {
            id: true, type: true, message: true, fromStatus: true, toStatus: true, createdAt: true,
            author: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }

    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && ticket.requester.id !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }

    const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Transição inválida: ${ticket.status} → ${status}` });
      return;
    }

    const resolvedAt = status === 'CONCLUIDO' ? new Date() : undefined;
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status, ...(resolvedAt ? { resolvedAt } : {}) },
      select: ticketSelect,
    });

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.sub,
        type: 'STATUS_CHANGE',
        message: `Status alterado: ${ticket.status} → ${status}`,
        fromStatus: ticket.status,
        toStatus: status,
      },
    });

    if (status === 'CONCLUIDO') {
      const requester = await prisma.user.findUnique({ where: { id: ticket.requesterId } });
      await sendWhatsApp(
        requester?.phone,
        `✅ Seu chamado foi concluído!\n*${ticket.title}*\nQualquer dúvida, abra um novo chamado.`,
      );
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function assignTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assigneeId } = z.object({ assigneeId: z.string().nullable() }).parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { assigneeId },
      select: ticketSelect,
    });

    const label = assigneeId
      ? `Responsável atribuído: ${updated.assignee?.name}`
      : 'Responsável removido';
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.sub,
        type: 'ASSIGNMENT',
        message: label,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }

    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && ticket.requesterId !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' }); return;
    }

    const entry = await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, authorId: req.user!.sub, type: 'COMMENT', message },
      select: {
        id: true, type: true, message: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
}
