import { useEffect, useId, useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet,
  Inbox, CheckCircle2, Timer, Layers, Users,
} from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, IconTile, Notice, Table } from '../components/ui';
import { onTabsKeyDown } from '../lib/a11y';

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

/* Paleta dos gráficos: tokens do tema (azul de ação + cores de estado), iguais ao Dashboard. */
const PRIMARY = 'var(--primary)';
const SUCCESS = 'var(--success)';
const WARNING = 'var(--warning)';
const DANGER = 'var(--danger)';
const GRID = 'var(--line)';
const TOOLTIP_STYLE = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text)' } as const;
const TICK = { fontSize: 11, fill: 'var(--text-2)' } as const;

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
  if (pct == null) return <span className="text-xs text-(--text-2)">—</span>;
  const good = invert ? pct < 0 : pct > 0;
  const flat = pct === 0;
  const tom: Tom = flat ? 'muted' : good ? 'teal' : 'coral';
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`pill pill-strong pill-${tom}`}>
      <Icon size={12} aria-hidden="true" /> {Math.abs(pct)}%
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
        <div className="mt-1.5 flex items-center gap-1.5">
          <TrendBadge pct={pct} invert={invert} />
          {prev != null && <span className="text-xs text-(--text-2)">vs. {prev}</span>}
        </div>
      </div>
    </div>
  );
}

/** Esqueleto dos relatórios enquanto as quatro chamadas carregam. */
function ReportsSkeleton() {
  return (
    <div className="stack gap-4" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[92px]" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="skeleton h-[300px] lg:col-span-2" />
        <div className="skeleton h-[300px]" />
      </div>
      <p className="sr-only">Carregando relatórios…</p>
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
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);
  const idBase = useId();

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
      setErro('');
      setOverview(o.data); setSeries(t.data.series); setSla(s.data); setAgents(p.data.agents);
    }).catch(() => {
      if (active) setErro('Não foi possível carregar os relatórios.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dates.from, dates.to, tentativa]);

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
    ? [{ name: 'No prazo', value: sla.onTime, color: SUCCESS },
       { name: 'Em risco', value: sla.atRisk, color: WARNING },
       { name: 'Estourado', value: sla.breached, color: DANGER }]
    : [];

  const fmtTick = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const fmtLabel = (d: unknown) => fmtTick(String(d));
  const fmtBr = (d: string) => d.split('-').reverse().join('/');

  const slaTom = (v: number | null): Tom => v == null ? 'muted' : v >= 90 ? 'teal' : v >= 80 ? 'amber' : 'coral';

  const idAba = (k: RangeKey) => `${idBase}-aba-${k}`;
  const idPainel = `${idBase}-painel`;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`Visão executiva · ${fmtBr(dates.from)} a ${fmtBr(dates.to)}`}
        actions={(
          <>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} disabled={exporting != null} loading={exporting === 'xlsx'}
              onClick={() => handleExport('/reports/export/csv', `chamados_${dates.from}_${dates.to}.xlsx`, 'xlsx')}>
              {exporting === 'xlsx' ? 'Gerando…' : 'Excel'}
            </Button>
            <Button variant="primary" size="sm" icon={<FileText size={14} />} disabled={exporting != null} loading={exporting === 'pdf'}
              onClick={() => handleExport('/reports/export/executivo/pdf', `relatorio-executivo_${dates.from}_${dates.to}.pdf`, 'pdf')}>
              {exporting === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
            </Button>
          </>
        )}
      />

      <div className="page-body max-w-[1400px] pb-15">
        {/* Seletor de período */}
        <div className="toolbar mb-5 items-center">
          <div className="tabs" role="tablist" aria-label="Período do relatório" onKeyDown={onTabsKeyDown}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                id={idAba(r.key)}
                aria-selected={range === r.key}
                aria-controls={idPainel}
                tabIndex={range === r.key ? 0 : -1}
                className={`tab${range === r.key ? ' active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <>
              <Field label="De" inline>
                {(ctl) => (
                  <input {...ctl} type="date" value={custom.from} max={custom.to} className="field w-auto"
                    onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                )}
              </Field>
              <Field label="Até" inline>
                {(ctl) => (
                  <input {...ctl} type="date" value={custom.to} min={custom.from} max={isoDay(new Date())} className="field w-auto"
                    onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                )}
              </Field>
            </>
          )}
        </div>

        <div role="tabpanel" id={idPainel} aria-labelledby={idAba(range)}>
          {erro && !loading && (
            <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>}>
              {erro}
            </Notice>
          )}

          {loading && <ReportsSkeleton />}

          {!loading && overview && (
            <>
              {/* Banner resumo */}
              {narrative && (
                <Notice kind="info" className="mb-5.5" role="status">
                  <span className="sr-only">Resumo do período: </span>{narrative}
                </Notice>
              )}

              {/* KPIs */}
              <p className="section-label">Indicadores-chave · comparado ao período anterior</p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              <p className="section-label mt-7">Análise operacional</p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2" title="Tendência — abertos vs. resolvidos">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={fmtTick} tick={TICK} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis allowDecimals={false} tick={TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtLabel} />
                      <Line type="monotone" dataKey="opened" name="Abertos" stroke={PRIMARY} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="resolved" name="Resolvidos" stroke={SUCCESS} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* SLA donut */}
                <Card title="SLA cumprido">
                  <div className="flex items-center gap-3">
                    <div className="relative size-[130px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={slaData} dataKey="value" innerRadius={44} outerRadius={62} startAngle={90} endAngle={-270} stroke="none">
                            {slaData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <b className="text-2xl text-(--text)">{sla?.compliance != null ? `${sla.compliance}%` : '—'}</b>
                        <span className="text-[11px] text-(--text-2)">no prazo</span>
                      </div>
                    </div>
                    <ul className="m-0 list-none p-0 text-xs leading-loose text-(--text-2)">
                      {slaData.map((d) => (
                        <li key={d.name} className="flex items-center gap-1.5">
                          <span className="inline-block size-[9px] rounded-full" style={{ background: d.color }} aria-hidden="true" />
                          {d.name} <b className="text-(--text)">{d.value}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Distribuição por categoria">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={catData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" tick={TICK} />
                      <YAxis allowDecimals={false} tick={TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--primary-soft)' }} />
                      <Bar dataKey="value" name="Chamados" fill={PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title="Backlog ao longo do tempo">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={WARNING} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={WARNING} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={fmtTick} tick={TICK} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis allowDecimals={false} tick={TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtLabel} />
                      <Area type="monotone" dataKey="backlog" name="Backlog" stroke={WARNING} strokeWidth={2} fill="url(#bk)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Produtividade */}
              <p className="section-label mt-7">Produtividade da equipe</p>
              <Table
                isEmpty={agents.length === 0}
                empty={(
                  <EmptyState icon={<Users size={22} />} title="Nenhum chamado resolvido com responsável no período.">
                    Amplie o período ou confira se os chamados têm responsável atribuído.
                  </EmptyState>
                )}
                head={(
                  <tr>
                    <th>Atendente</th>
                    <th className="text-center">Resolvidos</th>
                    <th className="text-center">Tempo médio</th>
                    <th className="text-center">SLA</th>
                    <th className="text-center">Reabertura</th>
                    <th className="text-center">Carga</th>
                  </tr>
                )}
              >
                {agents.map((a) => {
                  const initials = a.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--primary-soft) text-[11px] font-bold text-(--primary-ink)" aria-hidden="true">{initials}</span>
                          {a.name}
                        </div>
                      </td>
                      <td className="text-center">{a.resolved}</td>
                      <td className="text-center">{a.avgResolutionHours != null ? `${a.avgResolutionHours}h` : '—'}</td>
                      <td className="text-center">
                        <span className={`pill pill-strong pill-${slaTom(a.slaCompliance)}`}>
                          {a.slaCompliance != null ? `${a.slaCompliance}%` : '—'}
                        </span>
                      </td>
                      <td className="text-center">{a.reopenRate}%</td>
                      <td className="text-center">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-1.5 w-20 overflow-hidden rounded-[3px] bg-(--primary-soft)"
                            role="meter"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={a.loadPct}
                            aria-label={`Carga de ${a.name}`}
                          >
                            <span className="block h-full bg-(--primary)" style={{ width: `${a.loadPct}%` }} />
                          </span>
                          <span className="text-xs text-(--text-2)">{a.currentLoad}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
