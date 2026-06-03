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

const SUPPLY_CATEGORIES = ['PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS'] as const;

const bulkSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.enum(SUPPLY_CATEGORIES).optional(),
});

/** Período (from/to em createdAt) compartilhado por pedidos e catálogo. */
function dateRange(from?: string, to?: string): Record<string, Date> | null {
  if (!from && !to) return null;
  const createdAt: Record<string, Date> = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00.000`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999`);
  return createdAt;
}

/**
 * Filtro para deleção em massa de PEDIDOS. O "tipo" do pedido vem da categoria
 * do item (relação), espelhando o filtro da listagem. Retorna null se nada foi
 * informado (trava anti "apagar tudo").
 */
function buildRequestBulkWhere(query: unknown): Record<string, unknown> | null {
  const { from, to, category } = bulkSchema.parse(query);
  const where: Record<string, unknown> = {};
  const createdAt = dateRange(from, to);
  if (createdAt) where.createdAt = createdAt;
  if (category) where.item = { category };
  return Object.keys(where).length === 0 ? null : where;
}

/** Filtro para deleção em massa de ITENS do catálogo (categoria é campo direto). */
function buildItemBulkWhere(query: unknown): Record<string, unknown> | null {
  const { from, to, category } = bulkSchema.parse(query);
  const where: Record<string, unknown> = {};
  const createdAt = dateRange(from, to);
  if (createdAt) where.createdAt = createdAt;
  if (category) where.category = category;
  return Object.keys(where).length === 0 ? null : where;
}

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

/**
 * Exclui um item do catálogo. Como SupplyItem→SupplyRequest NÃO tem cascade,
 * bloqueia a exclusão (409) se houver pedidos vinculados — o admin deve excluir
 * os pedidos antes. Restrito ao ADMIN.
 */
export async function deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await (prisma as any).supplyItem.findUnique({ where: { id: req.params.id } });
    if (!item) { res.status(404).json({ error: 'Item não encontrado' }); return; }

    const linked = await (prisma as any).supplyRequest.count({ where: { itemId: item.id } });
    if (linked > 0) {
      res.status(409).json({ error: `Item possui ${linked} pedido(s) vinculado(s). Exclua os pedidos antes de remover o item.` });
      return;
    }

    await (prisma as any).supplyItem.delete({ where: { id: item.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** Preview da exclusão em massa de itens. Conta os elegíveis (sem pedidos) e os bloqueados (com pedidos). */
export async function previewBulkItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = buildItemBulkWhere(req.query);
    if (!where) { res.status(400).json({ error: 'Informe ao menos um filtro (período ou tipo)' }); return; }

    const count = await (prisma as any).supplyItem.count({ where: { ...where, requests: { none: {} } } });
    const blocked = await (prisma as any).supplyItem.count({ where: { ...where, requests: { some: {} } } });
    res.json({ count, blocked });
  } catch (err) {
    next(err);
  }
}

/** Exclui em massa os itens elegíveis (sem pedidos vinculados). Itens com pedidos são ignorados. */
export async function bulkDeleteItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = buildItemBulkWhere(req.query);
    if (!where) { res.status(400).json({ error: 'Informe ao menos um filtro (período ou tipo)' }); return; }

    const blocked = await (prisma as any).supplyItem.count({ where: { ...where, requests: { some: {} } } });
    const { count } = await (prisma as any).supplyItem.deleteMany({ where: { ...where, requests: { none: {} } } });
    res.json({ count, blocked });
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

/** Exclui um pedido individualmente. O histórico é removido em cascata. Restrito ao ADMIN. */
export async function deleteRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const request = await (prisma as any).supplyRequest.findUnique({ where: { id: req.params.id } });
    if (!request) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }

    await (prisma as any).supplyRequest.delete({ where: { id: request.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** Conta quantos pedidos seriam afetados pela deleção em massa (não destrutivo). */
export async function previewBulkRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = buildRequestBulkWhere(req.query);
    if (!where) { res.status(400).json({ error: 'Informe ao menos um filtro (período ou tipo)' }); return; }

    const count = await (prisma as any).supplyRequest.count({ where });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

/** Executa a deleção em massa de pedidos por período e/ou tipo (categoria do item). Restrito ao ADMIN. */
export async function bulkDeleteRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = buildRequestBulkWhere(req.query);
    if (!where) { res.status(400).json({ error: 'Informe ao menos um filtro (período ou tipo)' }); return; }

    const { count } = await (prisma as any).supplyRequest.deleteMany({ where });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}
