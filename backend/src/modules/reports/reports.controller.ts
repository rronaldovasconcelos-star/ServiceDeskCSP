import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../../lib/prisma.js';

export async function getMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [total, byStatus, byCategory, byUrgency, resolved] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['urgency'], _count: { _all: true } }),
      prisma.ticket.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    let avgResolutionHours: number | null = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce(
        (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
        0,
      );
      avgResolutionHours = Math.round((totalMs / resolved.length / 3600000) * 10) / 10;
    }

    const pending = byStatus.find((s) => s.status === 'ABERTO')?._count._all ?? 0;
    const inProgress = byStatus.find((s) => s.status === 'EM_ANDAMENTO')?._count._all ?? 0;

    res.json({
      total,
      pending,
      inProgress,
      avgResolutionHours,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      byCategory: Object.fromEntries(byCategory.map((s) => [s.category, s._count._all])),
      byUrgency: Object.fromEntries(byUrgency.map((s) => [s.urgency, s._count._all])),
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
