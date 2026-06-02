import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet,
  Inbox, CheckCircle2, Timer, Layers,
} from 'lucide-react';
import api from '../lib/api';

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
const ACCENT = '#4d8ef0';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';

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
  const color = flat ? 'var(--text-secondary)' : good ? GREEN : '#ef4444';
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const bg = flat ? 'rgba(148,163,184,.12)' : good ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600,
      color, background: bg, padding: '2px 7px', borderRadius: 20,
    }}>
      <Icon size={12} /> {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({ label, value, pct, invert, icon, accent, prev }: {
  label: string; value: string; pct: number | null; invert?: boolean;
  icon: React.ReactNode; accent: string; prev?: string;
}) {
  return (
    <div className="kpi-card">
      <span style={{
        position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
        background: accent, borderRadius: 'var(--radius) 0 0 var(--radius)',
      }} />
      <div className="kpi-card-icon">{icon}</div>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <TrendBadge pct={pct} invert={invert} />
        {prev != null && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>vs. {prev}</span>}
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
    ? [{ name: 'No prazo', value: sla.onTime, color: GREEN },
       { name: 'Em risco', value: sla.atRisk, color: AMBER },
       { name: 'Estourado', value: sla.breached, color: '#ef4444' }]
    : [];

  const fmtTick = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const fmtLabel = (d: unknown) => fmtTick(String(d));

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Visão executiva · {dates.from.split('-').reverse().join('/')} a {dates.to.split('-').reverse().join('/')}
          </p>
        </div>
        <div className="page-header-actions">
          {/* Seletor de período */}
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                style={{
                  background: range === r.key ? 'var(--accent)' : 'transparent',
                  color: range === r.key ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRight: '1px solid var(--border)',
                  fontSize: 12, fontWeight: 500, padding: '7px 13px', cursor: 'pointer',
                }}>
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <>
              <input type="date" value={custom.from} max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 12 }} />
              <input type="date" value={custom.to} min={custom.from} max={isoDay(new Date())}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 12 }} />
            </>
          )}
          <button className="btn-export btn-export-csv" disabled={exporting != null}
            onClick={() => handleExport('/reports/export/csv', `chamados_${dates.from}_${dates.to}.xlsx`, 'xlsx')}>
            <FileSpreadsheet size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {exporting === 'xlsx' ? 'Gerando…' : 'Excel'}
          </button>
          <button className="btn-export btn-export-pdf" disabled={exporting != null}
            onClick={() => handleExport('/reports/export/executivo/pdf', `relatorio-executivo_${dates.from}_${dates.to}.pdf`, 'pdf')}>
            <FileText size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {exporting === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
          </button>
        </div>
      </div>

      <div style={{ padding: '22px 24px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {loading && <p style={{ color: 'var(--text-secondary)' }}>Carregando relatórios…</p>}

        {!loading && overview && (
          <>
            {/* Banner resumo */}
            {narrative && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(77,142,240,.12), rgba(34,197,94,.06))',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '14px 18px', marginBottom: 22, fontSize: 13,
                color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                💡 {narrative}
              </div>
            )}

            {/* KPIs */}
            <p className="section-label">Indicadores-chave · comparado ao período anterior</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <KpiCard label="Chamados abertos" value={String(overview.opened.value)} pct={overview.opened.pct}
                prev={String(overview.opened.prev ?? 0)} accent="var(--status-andamento)" icon={<Inbox size={20} />} />
              <KpiCard label="Resolvidos" value={String(overview.resolved.value)} pct={overview.resolved.pct}
                prev={String(overview.resolved.prev ?? 0)} accent="var(--status-concluido)" icon={<CheckCircle2 size={20} />} />
              <KpiCard label="Tempo médio resolução"
                value={overview.avgResolutionHours.value != null ? `${overview.avgResolutionHours.value}h` : '—'}
                pct={overview.avgResolutionHours.pct} invert
                prev={overview.avgResolutionHours.prev != null ? `${overview.avgResolutionHours.prev}h` : '—'}
                accent="var(--accent)" icon={<Timer size={20} />} />
              <KpiCard label="Backlog atual" value={String(overview.backlog.value)} pct={null}
                accent="var(--status-aberto)" icon={<Layers size={20} />} />
            </div>

            {/* Análise operacional */}
            <p className="section-label" style={{ marginTop: 28 }}>Análise operacional</p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div className="chart-card">
                <p className="chart-title">Tendência — abertos vs. resolvidos</p>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.12)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtTick} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={fmtLabel} />
                    <Line type="monotone" dataKey="opened" name="Abertos" stroke={ACCENT} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="resolved" name="Resolvidos" stroke={GREEN} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* SLA donut */}
              <div className="chart-card">
                <p className="chart-title">SLA cumprido</p>
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
                  <div style={{ fontSize: 12, lineHeight: 2 }}>
                    {slaData.map((d) => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                        {d.name} <b style={{ color: 'var(--text-primary)' }}>{d.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div className="chart-card">
                <p className="chart-title">Distribuição por categoria</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={catData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.12)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(77,142,240,.08)' }} />
                    <Bar dataKey="value" name="Chamados" fill={ACCENT} radius={[5, 5, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-card">
                <p className="chart-title">Backlog ao longo do tempo</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={AMBER} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.12)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtTick} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={fmtLabel} />
                    <Area type="monotone" dataKey="backlog" name="Backlog" stroke={AMBER} strokeWidth={2} fill="url(#bk)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Produtividade */}
            <p className="section-label" style={{ marginTop: 28 }}>Produtividade da equipe</p>
            <div className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Atendente', 'Resolvidos', 'Tempo médio', 'SLA', 'Reabertura', 'Carga'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i === 0 ? 'left' : 'center', fontSize: 11, textTransform: 'uppercase',
                        letterSpacing: '.05em', color: 'var(--text-secondary)', fontWeight: 600,
                        padding: '12px 14px', borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Nenhum chamado resolvido com responsável no período.
                    </td></tr>
                  )}
                  {agents.map((a) => {
                    const slaColor = a.slaCompliance == null ? 'var(--text-secondary)'
                      : a.slaCompliance >= 90 ? GREEN : a.slaCompliance >= 80 ? AMBER : '#ef4444';
                    const slaBg = a.slaCompliance == null ? 'rgba(148,163,184,.12)'
                      : a.slaCompliance >= 90 ? 'rgba(34,197,94,.12)' : a.slaCompliance >= 80 ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)';
                    const initials = a.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                    return (
                      <tr key={a.id}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{initials}</span>
                            {a.name}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{a.resolved}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{a.avgResolutionHours != null ? `${a.avgResolutionHours}h` : '—'}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: slaColor, background: slaBg }}>
                            {a.slaCompliance != null ? `${a.slaCompliance}%` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{a.reopenRate}%</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ height: 6, width: 80, borderRadius: 3, background: 'var(--bg-active)', overflow: 'hidden', display: 'inline-block' }}>
                              <span style={{ display: 'block', height: '100%', width: `${a.loadPct}%`, background: 'var(--accent)' }} />
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.currentLoad}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
