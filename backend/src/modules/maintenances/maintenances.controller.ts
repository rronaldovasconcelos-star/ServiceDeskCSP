import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  RECURRENCES,
  MAINTENANCE_URGENCIES,
  maintenanceSelect,
  generateTicketFromMaintenance,
  advanceMaintenance,
} from './maintenances.service.js';
import {
  notifyMaintenanceCreated,
  notifyMaintenanceDue,
} from './maintenances.notifications.js';

const createSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(3),
  urgency: z.enum(MAINTENANCE_URGENCIES).default('MEDIA'),
  recurrence: z.enum(RECURRENCES).default('NONE'),
  nextRunAt: z.string().datetime({ offset: true }),
  leadDays: z.number().int().min(0).max(365).default(0),
  responsavelId: z.string().min(1),
});

const updateSchema = createSchema.partial();

async function assertResponsavel(id: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id } });
  return Boolean(u);
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await prisma.scheduledMaintenance.findMany({
      select: maintenanceSelect,
      orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await prisma.scheduledMaintenance.findUnique({
      where: { id: req.params.id as string },
      select: maintenanceSelect,
    });
    if (!item) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    if (!(await assertResponsavel(data.responsavelId))) {
      res.status(400).json({ error: 'Responsável inválido' });
      return;
    }

    const item = await prisma.scheduledMaintenance.create({
      data: {
        name: data.name,
        description: data.description,
        urgency: data.urgency,
        recurrence: data.recurrence,
        nextRunAt: new Date(data.nextRunAt),
        leadDays: data.leadDays,
        responsavelId: data.responsavelId,
        createdById: req.user!.sub,
      },
      select: maintenanceSelect,
    });

    await notifyMaintenanceCreated({
      name: item.name,
      description: item.description,
      urgency: item.urgency,
      recurrence: item.recurrence,
      nextRunAt: item.nextRunAt,
      responsavel: { name: item.responsavel.name, phone: item.responsavel.phone },
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.scheduledMaintenance.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }

    if (data.responsavelId && !(await assertResponsavel(data.responsavelId))) {
      res.status(400).json({ error: 'Responsável inválido' });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.urgency !== undefined) patch.urgency = data.urgency;
    if (data.recurrence !== undefined) patch.recurrence = data.recurrence;
    if (data.leadDays !== undefined) patch.leadDays = data.leadDays;
    if (data.responsavelId !== undefined) patch.responsavelId = data.responsavelId;
    if (data.nextRunAt !== undefined) {
      patch.nextRunAt = new Date(data.nextRunAt);
      patch.reminderSent = false; // nova data → permite novo lembrete
    }

    const item = await prisma.scheduledMaintenance.update({
      where: { id: existing.id },
      data: patch,
      select: maintenanceSelect,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function setStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) }).parse(req.body);
    const existing = await prisma.scheduledMaintenance.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }

    const item = await prisma.scheduledMaintenance.update({
      where: { id: existing.id },
      data: { status },
      select: maintenanceSelect,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

/** Gera o chamado imediatamente ("executar agora"), independente do prazo. */
export async function runNow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const m = await prisma.scheduledMaintenance.findUnique({ where: { id: req.params.id as string } });
    if (!m) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }

    const ticket = await generateTicketFromMaintenance(m);
    const full = await prisma.scheduledMaintenance.findUnique({
      where: { id: m.id },
      select: maintenanceSelect,
    });
    if (full) {
      await notifyMaintenanceDue(
        {
          name: full.name, description: full.description, urgency: full.urgency,
          recurrence: full.recurrence, nextRunAt: full.nextRunAt,
          responsavel: { name: full.responsavel.name, phone: full.responsavel.phone },
        },
        ticket.title,
      );
    }
    // Manual: reagenda a partir de agora (evita re-disparo imediato pelo scheduler).
    await advanceMaintenance(m, new Date(), ticket.id);

    const updated = await prisma.scheduledMaintenance.findUnique({ where: { id: m.id }, select: maintenanceSelect });
    res.json({ ticketId: ticket.id, maintenance: updated });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await prisma.scheduledMaintenance.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Manutenção não encontrada' }); return; }
    await prisma.scheduledMaintenance.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
