import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';

// ─── Schemas ────────────────────────────────────────────────────────────────

const createItemSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  category: z.enum(['PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS']),
  description: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial();

const createRequestSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
  urgency: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  notes: z.string().optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDENTE: ['APROVADO', 'CANCELADO'],
  APROVADO: ['COMPRADO', 'CANCELADO'],
  COMPRADO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

// ─── Select helpers ──────────────────────────────────────────────────────────

const itemSelect = {
  id: true,
  name: true,
  unit: true,
  category: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const requestSelect = {
  id: true,
  quantity: true,
  urgency: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  item: { select: { id: true, name: true, unit: true, category: true } },
  requester: { select: { id: true, name: true, email: true, phone: true } },
};

// ─── Catalog (SupplyItem) ─────────────────────────────────────────────────────

export async function listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const where = isAdmin ? {} : { isActive: true };
    const items = await (prisma as any).supplyItem.findMany({
      where,
      select: itemSelect,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createItemSchema.parse(req.body);
    const item = await (prisma as any).supplyItem.create({ data, select: itemSelect });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateItemSchema.parse(req.body);
    const item = await (prisma as any).supplyItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ error: 'Item não encontrado' }); return; }
    const updated = await (prisma as any).supplyItem.update({
      where: { id: req.params.id },
      data,
      select: itemSelect,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function toggleItemActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await (prisma as any).supplyItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ error: 'Item não encontrado' }); return; }
    const updated = await (prisma as any).supplyItem.update({
      where: { id: req.params.id },
      data: { isActive: !item.isActive },
      select: itemSelect,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// ─── Requests (SupplyRequest) ─────────────────────────────────────────────────

export async function listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, urgency, category } = req.query;
    const isAdmin = req.user!.role === 'ADMIN';

    const where: Record<string, unknown> = {};
    if (!isAdmin) where.requesterId = req.user!.sub;
    if (status) where.status = status;
    if (urgency) where.urgency = urgency;
    if (category) where.item = { category };

    const requests = await (prisma as any).supplyRequest.findMany({
      where,
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

export async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createRequestSchema.parse(req.body);

    const item = await (prisma as any).supplyItem.findUnique({ where: { id: data.itemId } });
    if (!item || !item.isActive) {
      res.status(400).json({ error: 'Item não encontrado ou inativo' });
      return;
    }

    const request = await (prisma as any).supplyRequest.create({
      data: { ...data, requesterId: req.user!.sub },
      select: requestSelect,
    });

    await (prisma as any).supplyRequestHistory.create({
      data: {
        requestId: request.id,
        authorId: req.user!.sub,
        type: 'STATUS_CHANGE',
        message: 'Pedido enviado',
        toStatus: 'PENDENTE',
      },
    });

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    for (const admin of admins) {
      await sendWhatsApp(
        admin.phone,
        `🛒 Novo pedido de suprimento!\n*${item.name}* (${data.quantity} ${item.unit})\nUrgência: ${data.urgency}\nSolicitante: ${request.requester.name}`,
      );
    }

    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
}

export async function getRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const request = await (prisma as any).supplyRequest.findUnique({
      where: { id: req.params.id },
      select: {
        ...requestSelect,
        history: {
          select: {
            id: true, type: true, message: true, fromStatus: true, toStatus: true, createdAt: true,
            author: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }

    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && request.requester.id !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    res.json(request);
  } catch (err) {
    next(err);
  }
}

export async function changeRequestStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = z.object({ status: z.string() }).parse(req.body);

    const request = await (prisma as any).supplyRequest.findUnique({ where: { id: req.params.id } });
    if (!request) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }

    const allowed = VALID_TRANSITIONS[request.status] ?? [];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Transição inválida: ${request.status} → ${status}` });
      return;
    }

    const updated = await (prisma as any).supplyRequest.update({
      where: { id: req.params.id },
      data: { status },
      select: requestSelect,
    });

    await (prisma as any).supplyRequestHistory.create({
      data: {
        requestId: request.id,
        authorId: req.user!.sub,
        type: 'STATUS_CHANGE',
        message: `Status alterado: ${request.status} → ${status}`,
        fromStatus: request.status,
        toStatus: status,
      },
    });

    if (status === 'ENTREGUE') {
      await sendWhatsApp(
        updated.requester.phone,
        `✅ Seu pedido de suprimento foi entregue!\n*${updated.item.name}* (${updated.quantity} ${updated.item.unit})`,
      );
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);

    const request = await (prisma as any).supplyRequest.findUnique({ where: { id: req.params.id } });
    if (!request) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }

    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && request.requesterId !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' }); return;
    }

    const entry = await (prisma as any).supplyRequestHistory.create({
      data: { requestId: request.id, authorId: req.user!.sub, type: 'COMMENT', message },
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
