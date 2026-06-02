import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  notifyStatusChanged,
  notifyAssigned,
  notifyComment,
} from './tickets.notifications.js';
import { createTicketForUser, ticketSelect, TICKET_CATEGORIES, TICKET_URGENCIES } from './tickets.service.js';

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  category: z.enum(TICKET_CATEGORIES),
  urgency: z.enum(TICKET_URGENCIES),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  ABERTO: ['EM_ANDAMENTO', 'CANCELADO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'REJEITADO'],
  APROVADO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
  REJEITADO: [],
};

// Transições que exigem papel ADMIN ou GESTOR
const APPROVAL_TRANSITIONS = new Set(['APROVADO', 'REJEITADO']);

export async function listTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, category, urgency } = req.query;
    const role = req.user!.role;
    const isPrivileged = role === 'ADMIN' || role === 'GESTOR';

    const where: Record<string, unknown> = {};
    if (!isPrivileged) where.requesterId = req.user!.sub;
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
    const ticket = await createTicketForUser(req.user!.sub, data);
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

    const role = req.user!.role;
    const isPrivileged = role === 'ADMIN' || role === 'GESTOR';
    if (!isPrivileged && ticket.requester.id !== req.user!.sub) {
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

    // Aprovação/rejeição exige ADMIN ou GESTOR
    const role = req.user!.role;
    if (APPROVAL_TRANSITIONS.has(status) && role !== 'ADMIN' && role !== 'GESTOR') {
      res.status(403).json({ error: 'Apenas administradores e gestores podem aprovar ou rejeitar chamados' });
      return;
    }

    const resolvedAt = status === 'CONCLUIDO' ? new Date() : undefined;
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status, ...(resolvedAt ? { resolvedAt } : {}) },
      select: ticketSelect,
    });

    const statusMessages: Record<string, string> = {
      APROVADO: 'Chamado aprovado — pode ser executado',
      REJEITADO: 'Chamado rejeitado',
      EM_ANDAMENTO: 'Atendimento iniciado',
      CONCLUIDO: 'Chamado concluído',
      CANCELADO: 'Chamado cancelado',
    };

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.sub,
        type: 'STATUS_CHANGE',
        message: statusMessages[status] ?? `Status alterado: ${ticket.status} → ${status}`,
        fromStatus: ticket.status,
        toStatus: status,
      },
    });

    // Notifica solicitante em toda mudança de status (inclui cancelamento)
    await notifyStatusChanged(
      { id: ticket.id, title: ticket.title, category: ticket.category, urgency: ticket.urgency, requesterId: ticket.requesterId },
      status,
    );

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

    await notifyAssigned(
      { id: ticket.id, title: ticket.title, category: ticket.category, urgency: ticket.urgency, requesterId: ticket.requesterId },
      updated.assignee?.name ?? null,
    );

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

    const role = req.user!.role;
    const isPrivileged = role === 'ADMIN' || role === 'GESTOR';
    if (!isPrivileged && ticket.requesterId !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' }); return;
    }

    const entry = await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, authorId: req.user!.sub, type: 'COMMENT', message },
      select: {
        id: true, type: true, message: true, createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    await notifyComment(
      { id: ticket.id, title: ticket.title, category: ticket.category, urgency: ticket.urgency, requesterId: ticket.requesterId },
      message,
      entry.author.name,
      isPrivileged,
    );

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
}
