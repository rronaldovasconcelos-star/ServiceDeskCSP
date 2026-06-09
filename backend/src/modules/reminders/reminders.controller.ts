import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { RECURRENCES } from '../maintenances/maintenances.service.js';
import {
  isValidAno, isValidSegmento, isValidSerie, isValidEtapa, isValidDisciplina, isValidTipo,
} from '../files/taxonomy.js';
import { reminderSelect, processReminder, type ReminderRecord } from './reminders.service.js';

const baseSchema = z.object({
  name: z.string().min(3),
  messageExtra: z.string().max(1000).optional().nullable(),
  recurrence: z.enum(RECURRENCES).default('MONTHLY'),
  nextRunAt: z.string().datetime({ offset: true }),
  anoLetivo: z.string().optional().nullable(),
  segmento: z.string().optional().nullable(),
  serie: z.string().optional().nullable(),
  etapa: z.string().optional().nullable(),
  disciplina: z.string().optional().nullable(),
  tipoMaterial: z.string().optional().nullable(),
  audience: z.enum(['ALL', 'SELECTED']).default('ALL'),
  recipientIds: z.array(z.string()).optional().default([]),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.partial();

// Valida os eixos de classificação informados (todos opcionais). Retorna msg de erro ou null.
function validateAxes(d: {
  anoLetivo?: string | null; segmento?: string | null; serie?: string | null;
  etapa?: string | null; disciplina?: string | null; tipoMaterial?: string | null;
}): string | null {
  if (d.anoLetivo && !isValidAno(d.anoLetivo)) return 'Ano letivo inválido';
  if (d.segmento && !isValidSegmento(d.segmento)) return 'Segmento inválido';
  if (d.serie && !(d.segmento && isValidSerie(d.segmento, d.serie))) return 'Série inválida para o segmento';
  if (d.etapa && !isValidEtapa(d.etapa)) return 'Etapa inválida';
  if (d.disciplina && !isValidDisciplina(d.disciplina)) return 'Disciplina inválida';
  if (d.tipoMaterial && !isValidTipo(d.tipoMaterial)) return 'Tipo de material inválido';
  return null;
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await prisma.materialReminder.findMany({
      select: reminderSelect,
      orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }],
    });
    res.json(items);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSchema.parse(req.body);
    const axisErr = validateAxes(data);
    if (axisErr) { res.status(400).json({ error: axisErr }); return; }
    if (data.audience === 'SELECTED' && data.recipientIds.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos um destinatário.' });
      return;
    }

    const item = await prisma.materialReminder.create({
      data: {
        name: data.name,
        messageExtra: data.messageExtra ?? null,
        recurrence: data.recurrence,
        nextRunAt: new Date(data.nextRunAt),
        anoLetivo: data.anoLetivo ?? null,
        segmento: data.segmento ?? null,
        serie: data.serie ?? null,
        etapa: data.etapa ?? null,
        disciplina: data.disciplina ?? null,
        tipoMaterial: data.tipoMaterial ?? null,
        audience: data.audience,
        recipientIds: data.audience === 'SELECTED' ? JSON.stringify(data.recipientIds) : null,
        createdById: req.user!.sub,
      },
      select: reminderSelect,
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.materialReminder.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    const axisErr = validateAxes(data);
    if (axisErr) { res.status(400).json({ error: axisErr }); return; }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.messageExtra !== undefined) patch.messageExtra = data.messageExtra ?? null;
    if (data.recurrence !== undefined) patch.recurrence = data.recurrence;
    if (data.nextRunAt !== undefined) patch.nextRunAt = new Date(data.nextRunAt);
    for (const k of ['anoLetivo', 'segmento', 'serie', 'etapa', 'disciplina', 'tipoMaterial'] as const) {
      if (data[k] !== undefined) patch[k] = data[k] ?? null;
    }
    if (data.audience !== undefined) {
      patch.audience = data.audience;
      if (data.audience === 'SELECTED') {
        if (!data.recipientIds || data.recipientIds.length === 0) {
          res.status(400).json({ error: 'Selecione ao menos um destinatário.' });
          return;
        }
        patch.recipientIds = JSON.stringify(data.recipientIds);
      } else {
        patch.recipientIds = null;
      }
    } else if (data.recipientIds !== undefined && existing.audience === 'SELECTED') {
      patch.recipientIds = JSON.stringify(data.recipientIds);
    }

    const item = await prisma.materialReminder.update({
      where: { id: existing.id }, data: patch, select: reminderSelect,
    });
    res.json(item);
  } catch (err) { next(err); }
}

export async function setStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) }).parse(req.body);
    const existing = await prisma.materialReminder.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    const item = await prisma.materialReminder.update({
      where: { id: existing.id }, data: { status }, select: reminderSelect,
    });
    res.json(item);
  } catch (err) { next(err); }
}

/** Dispara o lembrete imediatamente (independente do prazo) e reagenda a partir de agora. */
export async function runNow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = (await prisma.materialReminder.findUnique({
      where: { id: req.params.id as string }, select: reminderSelect,
    })) as unknown as ReminderRecord | null;
    if (!r) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }

    const now = new Date();
    const sent = await processReminder(r, now, now); // base=now: reagenda a partir de agora
    const updated = await prisma.materialReminder.findUnique({ where: { id: r.id }, select: reminderSelect });
    res.json({ sent, reminder: updated });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await prisma.materialReminder.findUnique({ where: { id: req.params.id as string } });
    if (!existing) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    await prisma.materialReminder.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) { next(err); }
}
