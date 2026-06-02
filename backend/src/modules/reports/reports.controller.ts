import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from '../../lib/prisma.js';

// ── Configuração de SLA ───────────────────────────────────────────────────────
// Meta de horas para resolução por urgência. Não há campo de SLA no banco —
// estas metas são a régua usada para classificar "no prazo / em risco / estourado".
const SLA_TARGET_HOURS: Record<string, number> = {
  URGENTE: 4,
  ALTA: 8,
  MEDIA: 24,
  BAIXA: 48,
};
const SLA_DEFAULT_HOURS = 24;
// Um chamado ainda aberto é "em risco" quando já consumiu este % da meta.
const SLA_RISK_THRESHOLD = 0.8;

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

// ── Helpers de período ────────────────────────────────────────────────────────

interface Period {
  from: Date;
  to: Date;
  /** Período imediatamente anterior, de mesma duração — para comparação ▲▼. */
  prevFrom: Date;
  prevTo: Date;
}

/**
 * Lê ?from=&to= (datas ISO ou YYYY-MM-DD). Default: últimos 30 dias.
 * `to` é inclusivo até o fim do dia. Calcula o período anterior equivalente.
 */
function parsePeriod(req: Request): Period {
  const now = new Date();
  const rawTo = typeof req.query.to === 'string' ? new Date(req.query.to) : null;
  const rawFrom = typeof req.query.from === 'string' ? new Date(req.query.from) : null;

  const to = rawTo && !isNaN(rawTo.getTime())
    ? new Date(rawTo.getFullYear(), rawTo.getMonth(), rawTo.getDate(), 23, 59, 59, 999)
    : now;
  const from = rawFrom && !isNaN(rawFrom.getTime())
    ? new Date(rawFrom.getFullYear(), rawFrom.getMonth(), rawFrom.getDate(), 0, 0, 0, 0)
    : new Date(to.getTime() - 30 * DAY_MS);

  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);
  return { from, to, prevFrom, prevTo };
}

function slaTargetHours(urgency: string): number {
  return SLA_TARGET_HOURS[urgency] ?? SLA_DEFAULT_HOURS;
}

/** Variação percentual arredondada (1 casa). null quando não há base anterior. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Formata Date → 'YYYY-MM-DD' (chave de bucket diário, em horário local). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

// ── Overview com período + comparação ────────────────────────────────────────
// Alimenta a página de Relatórios. NÃO substitui getMetrics (usado pelo Dashboard).

const OPEN_STATUSES = ['ABERTO', 'EM_ANDAMENTO'];

async function computeOverview(p: Period) {
  const [openedNow, openedPrev, resolvedNow, resolvedPrev, backlog, byStatus, byCategory, byUrgency] =
    await Promise.all([
      prisma.ticket.count({ where: { createdAt: { gte: p.from, lte: p.to } } }),
      prisma.ticket.count({ where: { createdAt: { gte: p.prevFrom, lte: p.prevTo } } }),
      prisma.ticket.findMany({
        where: { resolvedAt: { gte: p.from, lte: p.to } },
        select: { createdAt: true, resolvedAt: true, urgency: true },
      }),
      prisma.ticket.findMany({
        where: { resolvedAt: { gte: p.prevFrom, lte: p.prevTo } },
        select: { createdAt: true, resolvedAt: true },
      }),
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES } } }),
      prisma.ticket.groupBy({
        by: ['status'], _count: { _all: true },
        where: { createdAt: { gte: p.from, lte: p.to } },
      }),
      prisma.ticket.groupBy({
        by: ['category'], _count: { _all: true },
        where: { createdAt: { gte: p.from, lte: p.to } },
      }),
      prisma.ticket.groupBy({
        by: ['urgency'], _count: { _all: true },
        where: { createdAt: { gte: p.from, lte: p.to } },
      }),
    ]);

  const avgHours = (rows: { createdAt: Date; resolvedAt: Date | null }[]): number | null => {
    if (rows.length === 0) return null;
    const totalMs = rows.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0);
    return Math.round((totalMs / rows.length / HOUR_MS) * 10) / 10;
  };
  const avgNow = avgHours(resolvedNow);
  const avgPrev = avgHours(resolvedPrev);

  return {
    period: { from: p.from.toISOString(), to: p.to.toISOString() },
    opened:   { value: openedNow,   prev: openedPrev,   pct: pctChange(openedNow, openedPrev) },
    resolved: { value: resolvedNow.length, prev: resolvedPrev.length, pct: pctChange(resolvedNow.length, resolvedPrev.length) },
    avgResolutionHours: { value: avgNow, prev: avgPrev, pct: avgNow != null && avgPrev != null ? pctChange(avgNow, avgPrev) : null },
    backlog: { value: backlog },
    byStatus:   Object.fromEntries(byStatus.map((s: any)   => [s.status,   s._count._all])),
    byCategory: Object.fromEntries(byCategory.map((s: any) => [s.category, s._count._all])),
    byUrgency:  Object.fromEntries(byUrgency.map((s: any)  => [s.urgency,  s._count._all])),
  };
}

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await computeOverview(parsePeriod(req)));
  } catch (err) { next(err); }
}

// ── Série temporal: abertos vs. resolvidos vs. backlog acumulado ──────────────

async function computeTimeseries(p: Period) {
  const [opened, resolved, backlogBefore] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdAt: { gte: p.from, lte: p.to } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: p.from, lte: p.to } },
      select: { resolvedAt: true },
    }),
    // backlog aberto ANTES do início do período (ponto de partida da linha)
    prisma.ticket.count({
      where: { createdAt: { lt: p.from }, OR: [{ resolvedAt: null }, { resolvedAt: { gte: p.from } }] },
    }),
  ]);

  // Monta todos os dias do intervalo (inclusive) com contadores zerados.
  const buckets = new Map<string, { date: string; opened: number; resolved: number; backlog: number }>();
  for (let t = new Date(p.from.getFullYear(), p.from.getMonth(), p.from.getDate()); t <= p.to; t = new Date(t.getTime() + DAY_MS)) {
    const k = dayKey(t);
    buckets.set(k, { date: k, opened: 0, resolved: 0, backlog: 0 });
  }
  for (const o of opened) { const b = buckets.get(dayKey(o.createdAt)); if (b) b.opened++; }
  for (const r of resolved) { const b = buckets.get(dayKey(r.resolvedAt!)); if (b) b.resolved++; }

  // Backlog acumulado dia a dia: parte do backlog anterior e soma (abertos − resolvidos).
  let running = backlogBefore;
  const series = [...buckets.values()].map((b) => {
    running += b.opened - b.resolved;
    return { ...b, backlog: Math.max(0, running) };
  });
  return { period: { from: p.from.toISOString(), to: p.to.toISOString() }, series };
}

export async function getTimeseries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await computeTimeseries(parsePeriod(req)));
  } catch (err) { next(err); }
}

// ── SLA: no prazo / em risco / estourado ──────────────────────────────────────

async function computeSla(p: Period) {
  // Considera chamados abertos no período (resolvidos ou ainda em aberto).
  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: p.from, lte: p.to } },
    select: { urgency: true, status: true, createdAt: true, resolvedAt: true },
  });

  const now = Date.now();
  let onTime = 0, atRisk = 0, breached = 0;
  for (const t of tickets) {
    if (t.status === 'CANCELADO') continue;
    const targetMs = slaTargetHours(t.urgency) * HOUR_MS;
    if (t.resolvedAt) {
      const tookMs = t.resolvedAt.getTime() - t.createdAt.getTime();
      if (tookMs <= targetMs) onTime++; else breached++;
    } else {
      const elapsedMs = now - t.createdAt.getTime();
      if (elapsedMs > targetMs) breached++;
      else if (elapsedMs > targetMs * SLA_RISK_THRESHOLD) atRisk++;
      else onTime++;
    }
  }
  const considered = onTime + atRisk + breached;
  const compliance = considered > 0 ? Math.round((onTime / considered) * 1000) / 10 : null;
  return {
    period: { from: p.from.toISOString(), to: p.to.toISOString() },
    onTime, atRisk, breached, considered, compliance,
    targets: SLA_TARGET_HOURS,
  };
}

export async function getSla(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await computeSla(parsePeriod(req)));
  } catch (err) { next(err); }
}

// ── Produtividade por atendente ───────────────────────────────────────────────

async function computeProdutividade(p: Period) {
  // Chamados resolvidos no período, agrupados pelo responsável.
  const resolved = await prisma.ticket.findMany({
    where: { resolvedAt: { gte: p.from, lte: p.to }, assigneeId: { not: null } },
    select: {
      assigneeId: true, urgency: true, createdAt: true, resolvedAt: true,
      assignee: { select: { name: true } },
      // Reabertura genuína: já esteve CONCLUIDO e voltou para um status aberto.
      history: { where: { type: 'STATUS_CHANGE', fromStatus: 'CONCLUIDO' }, select: { id: true } },
    },
  });
  // Carga atual: chamados em aberto atribuídos a cada um.
  const openByAssignee = await prisma.ticket.groupBy({
    by: ['assigneeId'], _count: { _all: true },
    where: { status: { in: OPEN_STATUSES }, assigneeId: { not: null } },
  });
  const loadMap = new Map<string, number>(
    openByAssignee.map((r: any) => [r.assigneeId, r._count._all]),
  );

  interface Acc { id: string; name: string; resolved: number; totalMs: number; onTime: number; reopened: number; }
  const acc = new Map<string, Acc>();
  for (const t of resolved) {
    const id = t.assigneeId!;
    const a = acc.get(id) ?? { id, name: t.assignee?.name ?? '—', resolved: 0, totalMs: 0, onTime: 0, reopened: 0 };
    a.resolved++;
    a.totalMs += t.resolvedAt!.getTime() - t.createdAt.getTime();
    if ((t.resolvedAt!.getTime() - t.createdAt.getTime()) <= slaTargetHours(t.urgency) * HOUR_MS) a.onTime++;
    // Reabertura: houve ao menos uma volta de CONCLUIDO para status aberto.
    if (t.history.length >= 1) a.reopened++;
    acc.set(id, a);
  }

  const maxResolved = Math.max(1, ...[...acc.values()].map((a) => a.resolved));
  const rows = [...acc.values()]
    .map((a) => ({
      id: a.id,
      name: a.name,
      resolved: a.resolved,
      avgResolutionHours: a.resolved > 0 ? Math.round((a.totalMs / a.resolved / HOUR_MS) * 10) / 10 : null,
      slaCompliance: a.resolved > 0 ? Math.round((a.onTime / a.resolved) * 1000) / 10 : null,
      reopenRate: a.resolved > 0 ? Math.round((a.reopened / a.resolved) * 1000) / 10 : 0,
      currentLoad: loadMap.get(a.id) ?? 0,
      loadPct: Math.round((a.resolved / maxResolved) * 100),
    }))
    .sort((x, y) => y.resolved - x.resolved);

  return { period: { from: p.from.toISOString(), to: p.to.toISOString() }, agents: rows };
}

export async function getProdutividade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await computeProdutividade(parsePeriod(req)));
  } catch (err) { next(err); }
}

// ── Resumo narrativo do período (regra simples, sem IA) ───────────────────────

function buildNarrative(o: any, sla: any, cat: Record<string, number>): string {
  const topCat = Object.entries(cat).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(cat).reduce((s, n) => s + (n as number), 0) || 1;
  const parts: string[] = [];
  parts.push(`No período foram registrados ${o.opened.value} chamados, com ${o.resolved.value} resolvidos`);
  if (sla.compliance != null) parts.push(` (${sla.compliance}% dentro do SLA)`);
  parts.push('. ');
  if (o.avgResolutionHours.value != null) {
    const pct = o.avgResolutionHours.pct;
    const dir = pct != null && pct < 0 ? `redução de ${Math.abs(pct)}%` : pct != null && pct > 0 ? `aumento de ${pct}%` : 'estabilidade';
    parts.push(`O tempo médio de resolução foi de ${o.avgResolutionHours.value}h (${dir} vs. período anterior). `);
  }
  if (topCat) parts.push(`A categoria ${topCat[0]} concentra ${Math.round((topCat[1] / total) * 100)}% da demanda. `);
  if (o.backlog.value > 0) parts.push(`O backlog atual é de ${o.backlog.value} chamados em aberto.`);
  return parts.join('');
}

// ── Filtro de chamados para exportação ────────────────────────────────────────
// Aceita ?from=&to=&category=&status= — todos opcionais (sem filtro = exporta tudo).

function buildTicketFilter(req: Request): Record<string, any> {
  const where: Record<string, any> = {};
  const { from, to, category, status } = req.query;
  if (typeof from === 'string' || typeof to === 'string') {
    const range: Record<string, Date> = {};
    if (typeof from === 'string') { const d = new Date(from); if (!isNaN(d.getTime())) range.gte = new Date(d.setHours(0, 0, 0, 0)); }
    if (typeof to === 'string')   { const d = new Date(to);   if (!isNaN(d.getTime())) range.lte = new Date(d.setHours(23, 59, 59, 999)); }
    if (Object.keys(range).length) where.createdAt = range;
  }
  if (typeof category === 'string' && category) where.category = category;
  if (typeof status === 'string' && status) where.status = status;
  return where;
}

// ── XLSX chamados ─────────────────────────────────────────────────────────────

export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      where: buildTicketFilter(req),
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

export async function exportPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      where: buildTicketFilter(req),
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

// ── PDF EXECUTIVO ─────────────────────────────────────────────────────────────
// Relatório de apresentação: capa, sumário narrado, KPIs, gráficos vetoriais
// (desenhados com primitivas do pdfkit) e ranking de produtividade.

const PDF = {
  navy: '#0f1b2d', navy2: '#1e3a5f', blue: '#2563eb', accent: '#4d8ef0',
  green: '#16a34a', amber: '#d97706', red: '#dc2626', slate: '#64748b',
  line: '#e2e8f0', ink: '#0f172a', light: '#f8fafc',
};

const URG_LABEL: Record<string, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const CAT_LABEL: Record<string, string> = {
  TI: 'TI', MANUTENCAO: 'Manutenção', PEDAGOGICO: 'Pedagógico', ADMINISTRATIVO: 'Administrativo',
  SUPRIMENTOS: 'Suprimentos', OUTROS: 'Outros',
};

function fmtDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Desenha um gráfico de barras vertical simples num retângulo. */
function drawBarChart(
  doc: InstanceType<typeof PDFDocument>,
  x: number, y: number, w: number, h: number,
  data: { label: string; value: number }[],
  color: string,
) {
  if (data.length === 0) { doc.fontSize(9).fillColor(PDF.slate).text('Sem dados no período.', x, y + h / 2); return; }
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 14;
  const barW = Math.max(8, (w - gap * (data.length - 1)) / data.length);
  const baseY = y + h - 16;
  data.forEach((d, i) => {
    const bx = x + i * (barW + gap);
    const bh = Math.round(((d.value / max) * (h - 28)) * 10) / 10;
    doc.roundedRect(bx, baseY - bh, barW, bh, 2).fill(color);
    doc.fontSize(7).fillColor(PDF.ink).text(String(d.value), bx - 4, baseY - bh - 10, { width: barW + 8, align: 'center' });
    doc.fontSize(7).fillColor(PDF.slate).text(d.label, bx - 6, baseY + 4, { width: barW + 12, align: 'center' });
  });
}

/** Desenha um gráfico de linha (uma ou mais séries) num retângulo. */
function drawLineChart(
  doc: InstanceType<typeof PDFDocument>,
  x: number, y: number, w: number, h: number,
  series: { color: string; points: number[] }[],
) {
  const all = series.flatMap((s) => s.points);
  const max = Math.max(1, ...all);
  const plotH = h - 18;
  // grade horizontal
  doc.lineWidth(0.5).strokeColor(PDF.line);
  for (let g = 0; g <= 3; g++) { const gy = y + (plotH / 3) * g; doc.moveTo(x, gy).lineTo(x + w, gy).stroke(); }
  series.forEach((s) => {
    if (s.points.length < 2) return;
    const stepX = w / (s.points.length - 1);
    doc.lineWidth(1.5).strokeColor(s.color);
    s.points.forEach((v, i) => {
      const px = x + stepX * i;
      const py = y + plotH - (v / max) * plotH;
      if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py);
    });
    doc.stroke();
  });
}

export async function exportExecutivePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const p = parsePeriod(req);
    const [overview, timeseries, sla, prod] = await Promise.all([
      computeOverview(p), computeTimeseries(p), computeSla(p), computeProdutividade(p),
    ]);
    const narrative = buildNarrative(overview, sla, overview.byCategory);

    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-executivo.pdf"');
    doc.pipe(res);

    const W = doc.page.width;
    const M = 40;
    const contentW = W - M * 2;

    // ── CAPA ──
    // Fundo em gradiente azul-marinho (esquerda → direita).
    const coverGrad = doc.linearGradient(0, 0, W, 230);
    coverGrad.stop(0, PDF.navy).stop(1, PDF.navy2);
    doc.rect(0, 0, W, 230).fill(coverGrad);
    // Faixa de destaque na base da capa.
    doc.rect(0, 226, W, 4).fill(PDF.accent);
    try { doc.image(LOGO_PATH, M, 40, { fit: [46, 46] }); } catch (_) { /* sem logo */ }
    doc.fillColor('#cdd9ec').fontSize(11).font('Helvetica-Bold')
      .text('PORTAL CSP · SERVICE DESK', M + 58, 56);
    doc.fillColor('#ffffff').fontSize(26).font('Helvetica-Bold')
      .text('Relatório Executivo de Atendimento', M, 120, { width: contentW });
    doc.fillColor('#dbe6f5').fontSize(12).font('Helvetica')
      .text(`Período: ${fmtDateBR(p.from)} a ${fmtDateBR(p.to)}`, M, 162);
    doc.fillColor('#aebfd8').fontSize(9).font('Helvetica')
      .text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Confidencial · Uso interno`, M, 196);

    let y = 260;

    // ── SUMÁRIO EXECUTIVO ──
    const sectionTitle = (label: string) => {
      doc.fillColor(PDF.blue).fontSize(11).font('Helvetica-Bold').text(label.toUpperCase(), M, y);
      y = doc.y + 4;
      doc.moveTo(M, y).lineTo(M + contentW, y).lineWidth(1.5).strokeColor(PDF.line).stroke();
      y += 10;
    };

    sectionTitle('Sumário Executivo');
    doc.fillColor('#334155').fontSize(10.5).font('Helvetica')
      .text(narrative, M, y, { width: contentW, lineGap: 3 });
    y = doc.y + 18;

    // ── KPIs ──
    sectionTitle('Indicadores do Período');
    const kpis = [
      { l: 'Chamados abertos', v: String(overview.opened.value), d: overview.opened.pct },
      { l: 'Resolvidos', v: String(overview.resolved.value), d: overview.resolved.pct },
      { l: 'Tempo médio', v: overview.avgResolutionHours.value != null ? `${overview.avgResolutionHours.value}h` : '—', d: overview.avgResolutionHours.pct, invert: true },
      { l: 'SLA cumprido', v: sla.compliance != null ? `${sla.compliance}%` : '—', d: null },
    ];
    const kw = (contentW - 3 * 10) / 4;
    kpis.forEach((k, i) => {
      const kx = M + i * (kw + 10);
      doc.roundedRect(kx, y, kw, 64, 6).lineWidth(1).strokeColor(PDF.line).stroke();
      doc.fillColor(PDF.slate).fontSize(8).font('Helvetica').text(k.l.toUpperCase(), kx + 10, y + 10, { width: kw - 20 });
      doc.fillColor(PDF.ink).fontSize(20).font('Helvetica-Bold').text(k.v, kx + 10, y + 24);
      if (k.d != null) {
        // queda no tempo médio é boa (invert); senão alta é boa.
        const good = k.invert ? k.d < 0 : k.d > 0;
        const arrow = k.d > 0 ? '▲' : k.d < 0 ? '▼' : '■';
        doc.fillColor(good ? PDF.green : PDF.red).fontSize(8).font('Helvetica-Bold')
          .text(`${arrow} ${Math.abs(k.d)}% vs. anterior`, kx + 10, y + 48, { width: kw - 20 });
      }
    });
    y += 64 + 22;

    // ── GRÁFICO: evolução ──
    sectionTitle('Evolução no Período');
    doc.fillColor(PDF.blue).fontSize(8).text('● Abertos', M, y);
    doc.fillColor(PDF.green).fontSize(8).text('● Resolvidos', M + 70, y);
    y += 12;
    drawLineChart(doc, M, y, contentW, 110, [
      { color: PDF.blue, points: timeseries.series.map((s) => s.opened) },
      { color: PDF.green, points: timeseries.series.map((s) => s.resolved) },
    ]);
    y += 120;

    // ── GRÁFICO: categorias ──
    sectionTitle('Chamados por Categoria');
    const catData = Object.entries(overview.byCategory)
      .map(([k, v]) => ({ label: CAT_LABEL[k] ?? k, value: v as number }))
      .sort((a, b) => b.value - a.value);
    drawBarChart(doc, M, y, contentW, 110, catData, PDF.accent);
    y += 122;

    // ── TABELA: produtividade ──
    if (y > doc.page.height - 200) { doc.addPage(); y = 50; }
    sectionTitle('Produtividade por Atendente');
    const cols = [
      { h: 'Atendente', w: 0.30, align: 'left' as const },
      { h: 'Resolvidos', w: 0.16, align: 'center' as const },
      { h: 'T. médio', w: 0.16, align: 'center' as const },
      { h: 'SLA', w: 0.14, align: 'center' as const },
      { h: 'Reabertura', w: 0.14, align: 'center' as const },
      { h: 'Carga', w: 0.10, align: 'center' as const },
    ];
    // cabeçalho
    doc.rect(M, y, contentW, 22).fill(PDF.navy);
    let cx = M;
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    cols.forEach((c) => { const cwd = contentW * c.w; doc.text(c.h.toUpperCase(), cx + 6, y + 7, { width: cwd - 12, align: c.align }); cx += cwd; });
    y += 22;
    // linhas
    const rows = prod.agents.length > 0 ? prod.agents : [];
    rows.forEach((a, i) => {
      if (i % 2 === 1) doc.rect(M, y, contentW, 20).fill(PDF.light);
      cx = M;
      const cells = [
        a.name,
        String(a.resolved),
        a.avgResolutionHours != null ? `${a.avgResolutionHours}h` : '—',
        a.slaCompliance != null ? `${a.slaCompliance}%` : '—',
        `${a.reopenRate}%`,
        String(a.currentLoad),
      ];
      doc.fillColor(PDF.ink).fontSize(8.5).font('Helvetica');
      cols.forEach((c, ci) => { const cwd = contentW * c.w; doc.text(cells[ci], cx + 6, y + 6, { width: cwd - 12, align: c.align }); cx += cwd; });
      doc.moveTo(M, y + 20).lineTo(M + contentW, y + 20).lineWidth(0.5).strokeColor(PDF.line).stroke();
      y += 20;
    });
    if (rows.length === 0) {
      doc.fillColor(PDF.slate).fontSize(9).text('Nenhum chamado resolvido com responsável no período.', M, y + 8);
      y += 24;
    }

    // ── RODAPÉ ──
    const footerY = doc.page.height - 30;
    doc.moveTo(M, footerY - 6).lineTo(W - M, footerY - 6).lineWidth(0.5).strokeColor(PDF.line).stroke();
    doc.fillColor(PDF.slate).fontSize(8).font('Helvetica')
      .text('Portal CSP · servicedeskcsp.com.br', M, footerY, { lineBreak: false });
    const rt = '© 2026 Colégio Santa Paula · Confidencial';
    doc.fillColor(PDF.accent).text(rt, W - M - doc.widthOfString(rt), footerY, { lineBreak: false });

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
