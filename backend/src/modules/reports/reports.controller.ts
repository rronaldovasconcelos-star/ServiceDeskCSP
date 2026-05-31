import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from '../../lib/prisma.js';

// ── Helper XLSX ───────────────────────────────────────────────────────────────

function styleHeader(sheet: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) {
  sheet.columns = cols;
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1B2D' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF4D8EF0' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 22;
}

function styleDataRows(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const fill = i % 2 === 0
      ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F6FB' } }
      : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } };
    row.eachCell((cell) => {
      cell.fill = fill;
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
      cell.alignment = { vertical: 'middle' };
    });
    row.height = 18;
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, '../../../assets/logo.jpg');

function addHeader(doc: InstanceType<typeof PDFDocument>, title: string) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const logoSize = 50;

  try {
    doc.image(LOGO_PATH, doc.page.margins.left, doc.page.margins.top, {
      height: logoSize,
      fit: [logoSize, logoSize],
    });
  } catch (_) { /* logo não encontrado */ }

  doc.fontSize(16).font('Helvetica-Bold')
    .text(title, doc.page.margins.left + logoSize + 12, doc.page.margins.top + (logoSize / 2) - 8, {
      width: pageWidth - logoSize - 12,
      align: 'center',
    });

  doc.moveDown(2.5);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + pageWidth, doc.y)
    .strokeColor('#cccccc').lineWidth(0.5).stroke();
  doc.moveDown(0.8);

  doc.fontSize(9).font('Helvetica').fillColor('#666666')
    .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  doc.fillColor('#000000').moveDown(0.8);
}

function addFooter(doc: InstanceType<typeof PDFDocument>) {
  const W = doc.page.width;
  const margin = doc.page.margins.left;
  const footerY = doc.page.height - 28;

  // Linha separadora — coordenadas absolutas, nunca dispara nova página
  doc.moveTo(margin, footerY - 8)
    .lineTo(W - margin, footerY - 8)
    .strokeColor('#cccccc').lineWidth(0.5).stroke();

  // Texto esquerdo — lineBreak:false impede quebra e nova página
  doc.fontSize(8).font('Helvetica').fillColor('#666666')
    .text(
      '© 2026 Colégio Santa Paula · Portal de Chamados · Todos os direitos reservados',
      margin, footerY,
      { lineBreak: false },
    );

  // Texto direito — posição calculada manualmente para não usar align:right
  const rightText = 'Desenvolvido por Ronaldo Vasconcelos · v1.0';
  const rightX = W - margin - doc.widthOfString(rightText);
  doc.fillColor('#4d8ef0')
    .text(rightText, rightX, footerY, { lineBreak: false });

  doc.fillColor('#000000');
}

// ── Métricas JSON ─────────────────────────────────────────────────────────────

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
        (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0,
      );
      avgResolutionHours = Math.round((totalMs / resolved.length / 3600000) * 10) / 10;
    }

    const pending    = byStatus.find((s: any) => s.status === 'ABERTO')?._count._all ?? 0;
    const inProgress = byStatus.find((s: any) => s.status === 'EM_ANDAMENTO')?._count._all ?? 0;
    const supplyPending  = supplyByStatus.find((s: any) => s.status === 'PENDENTE')?._count._all ?? 0;
    const supplyApproved = supplyByStatus.find((s: any) => s.status === 'APROVADO')?._count._all ?? 0;

    res.json({
      total, pending, inProgress, avgResolutionHours,
      byStatus:   Object.fromEntries(byStatus.map((s: any)   => [s.status,   s._count._all])),
      byCategory: Object.fromEntries(byCategory.map((s: any) => [s.category, s._count._all])),
      byUrgency:  Object.fromEntries(byUrgency.map((s: any)  => [s.urgency,  s._count._all])),
      supply: {
        total: supplyTotal, pending: supplyPending, approved: supplyApproved,
        byStatus:  Object.fromEntries(supplyByStatus.map((s: any)  => [s.status,  s._count._all])),
        byUrgency: Object.fromEntries(supplyByUrgency.map((s: any) => [s.urgency, s._count._all])),
      },
    });
  } catch (err) { next(err); }
}

// ── XLSX chamados ─────────────────────────────────────────────────────────────

export async function exportCsv(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      select: {
        id: true, title: true, category: true, urgency: true, status: true,
        createdAt: true, resolvedAt: true,
        requester: { select: { name: true } },
        assignee:  { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Portal CSP — Colégio Santa Paula';
    const ws = wb.addWorksheet('Chamados');

    styleHeader(ws, [
      { header: 'Título',       key: 'title',      width: 40 },
      { header: 'Categoria',    key: 'category',   width: 18 },
      { header: 'Urgência',     key: 'urgency',    width: 14 },
      { header: 'Status',       key: 'status',     width: 16 },
      { header: 'Solicitante',  key: 'requester',  width: 24 },
      { header: 'Responsável',  key: 'assignee',   width: 24 },
      { header: 'Aberto em',    key: 'createdAt',  width: 18 },
      { header: 'Concluído em', key: 'resolvedAt', width: 18 },
    ]);

    for (const t of tickets) {
      ws.addRow({
        title:      t.title,
        category:   t.category,
        urgency:    t.urgency,
        status:     t.status,
        requester:  t.requester.name,
        assignee:   t.assignee?.name ?? '—',
        createdAt:  t.createdAt.toLocaleDateString('pt-BR'),
        resolvedAt: t.resolvedAt?.toLocaleDateString('pt-BR') ?? '—',
      });
    }

    styleDataRows(ws);
    ws.autoFilter = { from: 'A1', to: 'H1' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="chamados.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
}

// ── PDF chamados ──────────────────────────────────────────────────────────────

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

    addHeader(doc, 'Relatório de Chamados — Colégio Santa Paula');

    for (const t of tickets) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
        .text(`• ${t.title}`, { continued: false });
      doc.fontSize(9).font('Helvetica').fillColor('#444444')
        .text(`  Categoria: ${t.category} | Urgência: ${t.urgency} | Status: ${t.status}`)
        .text(`  Solicitante: ${t.requester.name} | Aberto em: ${t.createdAt.toLocaleDateString('pt-BR')}`);
      doc.fillColor('#000000').moveDown(0.4);
    }

    if (tickets.length === 0) {
      doc.fontSize(10).fillColor('#666666').text('Nenhum chamado registrado.', { align: 'center' });
    }

    addFooter(doc);
    doc.end();
  } catch (err) { next(err); }
}

// ── XLSX suprimentos ──────────────────────────────────────────────────────────

export async function exportSupplyCsv(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await (prisma as any).supplyRequest.findMany({
      select: {
        quantity: true, urgency: true, status: true,
        createdAt: true, updatedAt: true,
        item:      { select: { name: true, unit: true, category: true } },
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Portal CSP — Colégio Santa Paula';
    const ws = wb.addWorksheet('Suprimentos');

    styleHeader(ws, [
      { header: 'Item',         key: 'name',       width: 36 },
      { header: 'Categoria',    key: 'category',   width: 18 },
      { header: 'Quantidade',   key: 'quantity',   width: 14 },
      { header: 'Unidade',      key: 'unit',       width: 14 },
      { header: 'Urgência',     key: 'urgency',    width: 14 },
      { header: 'Status',       key: 'status',     width: 16 },
      { header: 'Solicitante',  key: 'requester',  width: 24 },
      { header: 'Aberto em',    key: 'createdAt',  width: 18 },
      { header: 'Atualizado em',key: 'updatedAt',  width: 18 },
    ]);

    for (const r of requests) {
      ws.addRow({
        name:       r.item.name,
        category:   r.item.category,
        quantity:   r.quantity,
        unit:       r.item.unit,
        urgency:    r.urgency,
        status:     r.status,
        requester:  r.requester.name,
        createdAt:  r.createdAt.toLocaleDateString('pt-BR'),
        updatedAt:  r.updatedAt.toLocaleDateString('pt-BR'),
      });
    }

    styleDataRows(ws);
    ws.autoFilter = { from: 'A1', to: 'I1' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="suprimentos.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
}

// ── PDF suprimentos ───────────────────────────────────────────────────────────

export async function exportSupplyPdf(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await (prisma as any).supplyRequest.findMany({
      select: {
        quantity: true, urgency: true, status: true, createdAt: true,
        item:      { select: { name: true, unit: true, category: true } },
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="suprimentos.pdf"');
    doc.pipe(res);

    addHeader(doc, 'Relatório de Suprimentos — Colégio Santa Paula');

    for (const r of requests) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
        .text(`• ${r.item.name} (${r.quantity} ${r.item.unit})`, { continued: false });
      doc.fontSize(9).font('Helvetica').fillColor('#444444')
        .text(`  Categoria: ${r.item.category} | Urgência: ${r.urgency} | Status: ${r.status}`)
        .text(`  Solicitante: ${r.requester.name} | Aberto em: ${r.createdAt.toLocaleDateString('pt-BR')}`);
      doc.fillColor('#000000').moveDown(0.4);
    }

    if (requests.length === 0) {
      doc.fontSize(10).fillColor('#666666').text('Nenhum pedido registrado.', { align: 'center' });
    }

    addFooter(doc);
    doc.end();
  } catch (err) { next(err); }
}
