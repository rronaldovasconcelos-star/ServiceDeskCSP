import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet,
  Inbox, CheckCircle2, Timer, Layers, Lightbulb,
} from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, IconTile, Table } from '../components/ui';

/* ── Tipos ── */
interface Trend { value: number | null; prev?: number | null; pct: number | null; }
interface Overview {
  period: { from: string; to: string };
  opened: Trend; resolved: Trend; avgResolutionHours: Trend; backlog: Trend;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byUrgency: Record<string, number>;
}
interface SeriesPoint { date: string; opened: number; resolved: number; backlog: number; }
interface Sla {
  onTime: number; atRisk: number; breached: number; considered: number;
  compliance: number | null; targets: Record<string, number>;
}
interface Agent {
  id: string; name: string; resolved: number;
  avgResolutionHours: number | null; slaCompliance: number | null;
  reopenRate: number; currentLoad: number; loadPct: number;
}

/* ── Períodos predefinidos ── */
type RangeKey = '7d' | '30d' | '90d' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: 'Trimestre' },
  { key: 'custom', label: 'Custom' },
];

const CAT_LABEL: Record<string, string> = {
  TI: 'TI', MANUTENCAO: 'Manutenção', PEDAGOGICO: 'Pedagógico',
  ADMINISTRATIVO: 'Administrativo', SUPRIMENTOS: 'Suprimentos', OUTROS: 'Outros',
};

/* Paleta dos gráficos: os mesmos tokens do tema (iguais ao Dashboard). */
const ELECTRIC = 'var(--electric)';
const TEAL = 'var(--teal)';
const AMBER = 'var(--amber)';
const CORAL = 'var(--coral)';
const GRID = 'var(--border)';
const TOOLTIP_STYLE = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-tile)', fontSize: 12 } as const;
const TICK = { fontSize: 11, fill: 'var(--text-secondary)' } as const;

type Tom = 'electric' | 'teal' | 'amber' | 'coral' | 'muted';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rangeToDates(key: RangeKey, custom: { from: string; to: string }): { from: string; to: string } {
  if (key === 'custom') return custom;
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: isoDay(from), to: isoDay(to) };
}

/* ── Componentes auxiliares ── */
function TrendBadge({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct == null) return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>;
  const good = invert ? pct < 0 : pct > 0;
  const flat = pct === 0;
  const tom: Tom = flat ? 'muted' : good ? 'teal' : 'coral';
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`pill pill-${tom}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
      <Icon size={12} /> {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({ label, value, pct, invert, icon, tone, prev }: {
  label: string; value: string; pct: number | null; invert?: boolean;
  icon: React.ReactNode; tone: Exclude<Tom, 'muted'>; prev?: string;
}) {
  return (
    <div className="kpi-card">
      <IconTile tone={tone} size={44}>{icon}</IconTile>
      <div className="min-w-0">
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <TrendBadge pct={pct} invert={invert} />
          {prev != null && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>vs. {prev}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: isoDay(new Date(Date.now() - 30 * 86400000)), to: isoDay(new Date()) });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [sla, setSla] = useState<Sla | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const dates = useMemo(() => rangeToDates(range, custom), [range, custom]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const q = { params: { from: dates.from, to: dates.to } };
    Promise.all([
      api.get('/reports/overview', q),
      api.get('/reports/timeseries', q),
      api.get('/reports/sla', q),
      api.get('/reports/produtividade', q),
    ]).then(([o, t, s, p]) => {
      if (!active) return;
      setOverview(o.data); setSeries(t.data.series); setSla(s.data); setAgents(p.data.agents);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dates.from, dates.to]);

  const handleExport = async (path: string, filename: string, key: string) => {
    setExporting(key);
    try {
      const res = await api.get(path, { params: { from: dates.from, to: dates.to }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  };

  /* ── Resumo narrativo (client-side, espelha a regra do backend) ── */
  const narrative = useMemo(() => {
    if (!overview || !sla) return '';
    const cat = Object.entries(overview.byCategory).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(overview.byCategory).reduce((s, n) => s + n, 0) || 1;
    const parts: string[] = [];
    parts.push(`No período foram registrados ${overview.opened.value} chamados, com ${overview.resolved.value} resolvidos`);
    if (sla.compliance != null) parts.push(` (${sla.compliance}% dentro do SLA)`);
    parts.push('. ');
    const avg = overview.avgResolutionHours;
    if (avg.value != null && avg.pct != null) {
      const dir = avg.pct < 0 ? `−${Math.abs(avg.pct)}%` : `+${avg.pct}%`;
      parts.push(`Tempo médio de resolução: ${avg.value}h (${dir} vs. período anterior). `);
    }
    if (cat) parts.push(`Categoria ${CAT_LABEL[cat[0]] ?? cat[0]} concentra ${Math.round((cat[1] / total) * 100)}% da demanda. `);
    if ((overview.backlog.value ?? 0) > 0) parts.push(`Backlog atual: ${overview.backlog.value} em aberto.`);
    return parts.join('');
  }, [overview, sla]);

  const catData = overview
    ? Object.entries(overview.byCategory).map(([k, v]) => ({ name: CAT_LABEL[k] ?? k, value: v })).sort((a, b) => b.value - a.value)
    : [];
  const slaData = sla
    ? [{ name: 'No prazo', value: sla.onTime, color: TEAL },
       { name: 'Em risco', value: sla.atRisk, color: AMBER },
       { name: 'Estourado', value: sla.breached, color: CORAL }]
    : [];

  const fmtTick = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const fmtLabel = (d: unknown) => fmtTick(String(d));
  const fmtBr = (d: string) => d.split('-').reverse().join('/');

  const slaTom = (v: number | null): Tom => v == null ? 'muted' : v >= 90 ? 'teal' : v >= 80 ? 'amber' : 'coral';

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle={`Visão executiva · ${fmtBr(dates.from)} a ${fmtBr(dates.to)}`}
        actions={(
          <>
            <Button variant="onNavy" size="sm" icon={<FileSpreadsheet size={14} />} disabled={exporting != null}
              onClick={() => handleExport('/reports/export/csv', `chamados_${dates.from}_${dates.to}.xlsx`, 'xlsx')}>
              {exporting === 'xlsx' ? 'Gerando…' : 'Excel'}
            </Button>
            <Button variant="secondary" size="sm" icon={<FileText size={14} />} disabled={exporting != null}
              onClick={() => handleExport('/reports/export/executivo/pdf', `relatorio-executivo_${dates.from}_${dates.to}.pdf`, 'pdf')}>
              {exporting === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
            </Button>
          </>
        )}
      />

      <div className="page-body" style={{ maxWidth: 1400, paddingBottom: 60 }}>
        {/* Seletor de período */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <div className="tabs">
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={`tab${range === r.key ? ' active' : ''}`} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <>
              <input type="date" value={custom.from} max={custom.to} className="field" style={{ width: 'auto' }}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <input type="date" value={custom.to} min={custom.from} max={isoDay(new Date())} className="field" style={{ width: 'auto' }}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </>
          )}
        </div>

        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando relatórios…</p>}

        {!loading && overview && (
          <>
            {/* Banner resumo */}
            {narrative && (
              <Card style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', marginBottom: 22, background: 'var(--electric-soft)', borderColor: 'transparent' }}>
                <IconTile tone="electric" size={32}><Lightbulb size={16} /></IconTile>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{narrative}</p>
              </Card>
            )}

            {/* KPIs */}
            <p className="section-label">Indicadores-chave · comparado ao período anterior</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Chamados abertos" value={String(overview.opened.value)} pct={overview.opened.pct}
                prev={String(overview.opened.prev ?? 0)} tone="electric" icon={<Inbox size={20} />} />
              <KpiCard label="Resolvidos" value={String(overview.resolved.value)} pct={overview.resolved.pct}
                prev={String(overview.resolved.prev ?? 0)} tone="teal" icon={<CheckCircle2 size={20} />} />
              <KpiCard label="Tempo médio resolução"
                value={overview.avgResolutionHours.value != null ? `${overview.avgResolutionHours.value}h` : '—'}
                pct={overview.avgResolutionHours.pct} invert
                prev={overview.avgResolutionHours.prev != null ? `${overview.avgResolutionHours.prev}h` : '—'}
                tone="electric" icon={<Timer size={20} />} />
              <KpiCard label="Backlog atual" value={String(overview.backlog.value)} pct={null}
                tone="amber" icon={<Layers size={20} />} />
            </div>

            {/* Análise operacional */}
            <p className="section-label" style={{ marginTop: 28 }}>Análise operacional</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2" title="Tendência — abertos vs. resolvidos">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtTick} tick={TICK} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis allowDecimals={false} tick={TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtLabel} />
                    <Line type="monotone" dataKey="opened" name="Abertos" stroke={ELECTRIC} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="resolved" name="Resolvidos" stroke={TEAL} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {/* SLA donut */}
              <Card title="SLA cumprido">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={slaData} dataKey="value" innerRadius={44} outerRadius={62} startAngle={90} endAngle={-270} stroke="none">
                          {slaData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <b style={{ fontSize: 24, color: 'var(--text-primary)' }}>{sla?.compliance != null ? `${sla.compliance}%` : '—'}</b>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>no prazo</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 2, color: 'var(--text-secondary)' }}>
                    {slaData.map((d) => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                        {d.name} <b style={{ color: 'var(--text-primary)' }}>{d.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginTop: 16 }}>
              <Card title="Distribuição por categoria">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={catData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="name" tick={TICK} />
                    <YAxis allowDecimals={false} tick={TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--electric-soft)' }} />
                    <Bar dataKey="value" name="Chamados" fill={ELECTRIC} radius={[6, 6, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Backlog ao longo do tempo">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={AMBER} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtTick} tick={TICK} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis allowDecimals={false} tick={TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtLabel} />
                    <Area type="monotone" dataKey="backlog" name="Backlog" stroke={AMBER} strokeWidth={2} fill="url(#bk)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Produtividade */}
            <p className="section-label" style={{ marginTop: 28 }}>Produtividade da equipe</p>
            <Table
              isEmpty={agents.length === 0}
              empty="Nenhum chamado resolvido com responsável no período."
              head={(
                <tr>
                  <th>Atendente</th>
                  <th style={{ textAlign: 'center' }}>Resolvidos</th>
                  <th style={{ textAlign: 'center' }}>Tempo médio</th>
                  <th style={{ textAlign: 'center' }}>SLA</th>
                  <th style={{ textAlign: 'center' }}>Reabertura</th>
                  <th style={{ textAlign: 'center' }}>Carga</th>
                </tr>
              )}
            >
              {agents.map((a) => {
                const initials = a.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--electric-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--electric)', flexShrink: 0 }}>{initials}</span>
                        {a.name}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{a.resolved}</td>
                    <td style={{ textAlign: 'center' }}>{a.avgResolutionHours != null ? `${a.avgResolutionHours}h` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`pill pill-${slaTom(a.slaCompliance)}`} style={{ fontWeight: 600 }}>
                        {a.slaCompliance != null ? `${a.slaCompliance}%` : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{a.reopenRate}%</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ height: 6, width: 80, borderRadius: 3, background: 'var(--electric-soft)', overflow: 'hidden', display: 'inline-block' }}>
                          <span style={{ display: 'block', height: '100%', width: `${a.loadPct}%`, background: 'var(--electric)' }} />
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.currentLoad}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </>
        )}
      </div>
    </>
  );
}
