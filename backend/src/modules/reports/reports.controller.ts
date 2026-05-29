import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../../lib/prisma.js';

export async function getMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [total, byStatus, byCategory, byUrgency, resolved, supplyTotal, supplyByStatus, supplyByUrgency] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['urgency'], _count: { _all: true } }),
      prisma.ticket.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
      (prisma as any).supplyRequest.count(),
      (prisma as any).supplyRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      (prisma as any).supplyRequest.groupBy({ by: ['urgency'], _count: { _all: true } }),
    ]);

    let avgResolutionHours: number | null = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce(
        (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
        0,
      );
      avgResolutionHours = Math.round((totalMs / resolved.length / 3600000) * 10) / 10;
    }

    const pending = byStatus.find((s: any) => s.status === 'ABERTO')?._count._all ?? 0;
    const inProgress = byStatus.find((s: any) => s.status === 'EM_ANDAMENTO')?._count._all ?? 0;
    const supplyPending = supplyByStatus.find((s: any) => s.status === 'PENDENTE')?._count._all ?? 0;
    const supplyApproved = supplyByStatus.find((s: any) => s.status === 'APROVADO')?._count._all ?? 0;

    res.json({
      total,
      pending,
      inProgress,
      avgResolutionHours,
      byStatus: Object.fromEntries(byStatus.map((s: any) => [s.status, s._count._all])),
      byCategory: Object.fromEntries(byCategory.map((s: any) => [s.category, s._count._all])),
      byUrgency: Object.fromEntries(byUrgency.map((s: any) => [s.urgency, s._count._all])),
      supply: {
        total: supplyTotal,
        pending: supplyPending,
        approved: supplyApproved,
        byStatus: Object.fromEntries(supplyByStatus.map((s: any) => [s.status, s._count._all])),
        byUrgency: Object.fromEntries(supplyByUrgency.map((s: any) => [s.urgency, s._count._all])),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function exportCsv(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      select: {
        id: true, title: true, category: true, urgency: true, status: true,
        createdAt: true, resolvedAt: true,
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'ID,Título,Categoria,Urgência,Status,Solicitante,Responsável,Criado em,Concluído em\n';
    const rows = tickets.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.category,
      t.urgency,
      t.status,
      t.requester.name,
      t.assignee?.name ?? '',
      t.createdAt.toISOString(),
      t.resolvedAt?.toISOString() ?? '',
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="chamados.csv"');
    res.send('﻿' + header + rows); // BOM for Excel UTF-8
  } catch (err) {
    next(err);
  }
}

export async function exportPdf(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      select: {
        title: true, category: true, urgency: true, status: true, createdAt: true,
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="chamados.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Relatório de Chamados — Colégio Santa Paula', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown();

    for (const t of tickets) {
      doc.fontSize(11).text(`• ${t.title}`, { continued: false });
      doc.fontSize(9)
        .text(`  Categoria: ${t.category} | Urgência: ${t.urgency} | Status: ${t.status}`)
        .text(`  Solicitante: ${t.requester.name} | Aberto em: ${t.createdAt.toLocaleDateString('pt-BR')}`);
      doc.moveDown(0.4);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

export async function exportSupplyCsv(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await (prisma as any).supplyRequest.findMany({
      select: {
        id: true, quantity: true, urgency: true, status: true,
        createdAt: true, updatedAt: true,
        item: { select: { name: true, unit: true, category: true } },
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'ID,Item,Categoria,Quantidade,Unidade,Urgência,Status,Solicitante,Criado em,Atualizado em\n';
    const rows = requests.map((r: any) => [
      r.id,
      `"${r.item.name.replace(/"/g, '""')}"`,
      r.item.category,
      r.quantity,
      r.item.unit,
      r.urgency,
      r.status,
      r.requester.name,
      r.createdAt.toISOString(),
      r.updatedAt.toISOString(),
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="suprimentos.csv"');
    res.send('﻿' + header + rows); // BOM for Excel UTF-8
  } catch (err) {
    next(err);
  }
}

export async function exportSupplyPdf(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await (prisma as any).supplyRequest.findMany({
      select: {
        quantity: true, urgency: true, status: true, createdAt: true,
        item: { select: { name: true, unit: true, category: true } },
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="suprimentos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Relatório de Suprimentos — Colégio Santa Paula', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown();

    for (const r of requests) {
      doc.fontSize(11).text(`• ${r.item.name} (${r.quantity} ${r.item.unit})`, { continued: false });
      doc.fontSize(9)
        .text(`  Categoria: ${r.item.category} | Urgência: ${r.urgency} | Status: ${r.status}`)
        .text(`  Solicitante: ${r.requester.name} | Aberto em: ${r.createdAt.toLocaleDateString('pt-BR')}`);
      doc.moveDown(0.4);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
