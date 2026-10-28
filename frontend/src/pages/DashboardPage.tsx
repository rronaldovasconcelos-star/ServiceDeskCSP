import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Ticket, Clock, Activity, Timer,
  ShoppingCart, AlertCircle, CheckCircle, Package,
  FileSpreadsheet, FileText, Info,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, IconTile } from '../components/ui';

type Tone = 'electric' | 'teal' | 'amber' | 'coral' | 'violet';

interface SupplyMetrics {
  total: number;
  pending: number;
  approved: number;
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
}

interface Metrics {
  total: number;
  pending: number;
  inProgress: number;
  avgResolutionHours: number | null;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byUrgency: Record<string, number>;
  supply: SupplyMetrics;
}

/* ── Paleta de cores para gráficos (status) ── */
const STATUS_COLORS: Record<string, string> = {
  'Aberto':       'var(--status-aberto)',
  'Em andamento': 'var(--status-andamento)',
  'Concluído':    'var(--status-concluido)',
  'Cancelado':    'var(--status-cancelado)',
};
const FALLBACK_COLORS = ['var(--primary)', 'var(--warning)', 'var(--success)', 'var(--status-cancelado)', 'var(--violet)'];

// Pendente, Aprovado, Comprado, Entregue, Cancelado — mesma ordem das pílulas.
const SUPPLY_COLORS = ['var(--warning)', 'var(--primary)', 'var(--violet)', 'var(--success)', 'var(--danger)'];

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};
const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};

/* ── Skeleton de carregamento ── */
function SkeletonKpi() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ height: '96px' }} />
      ))}
    </div>
  );
}

/* ── Card KPI ── */
interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  tone: Tone;
  icon: React.ElementType;
}
function KpiCard({ title, value, sub, tone, icon: Icon }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <IconTile tone={tone} size={44}><Icon size={20} aria-hidden="true" /></IconTile>
      <div className="min-w-0">
        <p className="kpi-label">{title}</p>
        <p className="kpi-value">{value}</p>
        {sub && <p className="kpi-sub">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Tooltip customizado para Recharts ── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number; name: string}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      {label && <p style={{ color: 'var(--text-2)', fontSize: '12px', margin: '0 0 4px' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: 'var(--text)', fontSize: '13px', margin: 0 }}>
          {p.name ? `${p.name}: ` : ''}<strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

type Estado = 'carregando' | 'ok' | 'semModulo' | 'erro';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');

  /** Busca GET /reports/metrics; só altera estado nos callbacks (assíncrono). */
  const buscar = useCallback(() => {
    return api.get('/reports/metrics')
      .then((res) => { setMetrics(res.data); setEstado('ok'); })
      .catch((err: unknown) => {
        if (isAxiosError(err) && err.response?.status === 403) setEstado('semModulo');
        else setEstado('erro');
      });
  }, []);

  useEffect(() => { void buscar(); }, [buscar]);

  const recarregar = () => {
    setEstado('carregando');
    void buscar();
  };

  const handleExport = async (path: string, filename: string) => {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = estado === 'carregando';

  /* ── Dados dos gráficos ── */
  const byStatusData = metrics
    ? Object.entries(metrics.byStatus).map(([k, v]) => ({ name: statusLabels[k] ?? k, value: v }))
    : [];
  const byCategoryData = metrics
    ? Object.entries(metrics.byCategory).map(([k, v]) => ({ name: k, value: v }))
    : [];
  const supplyByStatusData = metrics
    ? Object.entries(metrics.supply.byStatus).map(([k, v]) => ({ name: supplyStatusLabels[k] ?? k, value: v }))
    : [];

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle="Indicadores de chamados e suprimentos"
        actions={estado === 'ok' ? (
          <>
            <Button variant="secondary" icon={<FileSpreadsheet size={16} aria-hidden="true" />} onClick={() => handleExport('/reports/export/csv', 'chamados.xlsx')} aria-label="Exportar chamados em Excel">
              Exportar Excel
            </Button>
            <Button variant="secondary" icon={<FileText size={16} aria-hidden="true" />} onClick={() => handleExport('/reports/export/pdf', 'chamados.pdf')} aria-label="Exportar chamados em PDF">
              Exportar PDF
            </Button>
          </>
        ) : undefined}
      />

      <main className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {estado === 'semModulo' && (
          <div className="notice notice-info" role="status">
            <Info size={16} aria-hidden="true" />
            <div className="notice-body">Os indicadores usam o módulo Relatórios. Peça ao administrador para liberá-lo.</div>
          </div>
        )}

        {estado === 'erro' && (
          <div className="notice notice-danger" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <div className="notice-body">
              Não foi possível carregar os indicadores.
              <div className="notice-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>Tentar novamente</button>
              </div>
            </div>
          </div>
        )}

        {(loading || estado === 'ok') && (
          <>
            {/* ── Seção: KPIs de Chamados ── */}
            <section aria-labelledby="section-kpi-chamados">
              <div className="section-head">
                <h2 id="section-kpi-chamados">Chamados de suporte</h2>
              </div>
              {loading ? <SkeletonKpi /> : metrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard title="Total de chamados" value={metrics.total} tone="teal" icon={Ticket} />
                  <KpiCard title="Aguardando atendimento" value={metrics.pending} tone="amber" icon={Clock} />
                  <KpiCard title="Em andamento" value={metrics.inProgress} tone="electric" icon={Activity} />
                  <KpiCard
                    title="Tempo médio de resolução"
                    value={metrics.avgResolutionHours != null ? `${metrics.avgResolutionHours}h` : '—'}
                    sub="chamados concluídos"
                    tone="teal"
                    icon={Timer}
                  />
                </div>
              )}
            </section>

            {/* ── Seção: Gráficos de Chamados ── */}
            {!loading && metrics && (
              <section aria-labelledby="section-graficos-chamados">
                <div className="section-head">
                  <h2 id="section-graficos-chamados">Análise de chamados</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="chart-card">
                    <h3 className="chart-title">Chamados por status</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={byStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {byStatusData.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend
                          formatter={(value) => <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>{value}</span>}
                        />
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h3 className="chart-title">Chamados por categoria</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byCategoryData}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-2)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'var(--text-2)' }} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} name="Chamados" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            )}

            {/* ── Seção: KPIs de Suprimentos ── */}
            <section aria-labelledby="section-kpi-suprimentos">
              <div className="section-head">
                <h2 id="section-kpi-suprimentos">Pedidos de suprimentos</h2>
                {!loading && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileSpreadsheet size={15} aria-hidden="true" />}
                      onClick={() => handleExport('/reports/export/suprimentos/csv', 'suprimentos.xlsx')}
                      aria-label="Exportar suprimentos em Excel"
                    >
                      Exportar Excel
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileText size={15} aria-hidden="true" />}
                      onClick={() => handleExport('/reports/export/suprimentos/pdf', 'suprimentos.pdf')}
                      aria-label="Exportar suprimentos em PDF"
                    >
                      Exportar PDF
                    </Button>
                  </div>
                )}
              </div>

              {loading ? <SkeletonKpi /> : metrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard title="Total de pedidos" value={metrics.supply.total} tone="violet" icon={ShoppingCart} />
                  <KpiCard title="Pendentes de aprovação" value={metrics.supply.pending} tone="amber" icon={AlertCircle} />
                  <KpiCard title="Aprovados / em compra" value={metrics.supply.approved} tone="electric" icon={CheckCircle} />
                  <KpiCard title="Entregues" value={metrics.supply.byStatus['ENTREGUE'] ?? 0} tone="teal" icon={Package} />
                </div>
              )}
            </section>

            {/* ── Seção: Gráficos de Suprimentos ── */}
            {!loading && metrics && metrics.supply.total > 0 && (
              <section aria-labelledby="section-graficos-suprimentos">
                <div className="section-head">
                  <h2 id="section-graficos-suprimentos">Análise de suprimentos</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="chart-card">
                    <h3 className="chart-title">Pedidos por status</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={supplyByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {supplyByStatusData.map((_, i) => (
                            <Cell key={i} fill={SUPPLY_COLORS[i % SUPPLY_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend
                          formatter={(value) => <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>{value}</span>}
                        />
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h3 className="chart-title">Pedidos por urgência</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={Object.entries(metrics.supply.byUrgency).map(([k, v]) => ({ name: k, value: v }))}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-2)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'var(--text-2)' }} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" fill="var(--violet)" radius={[6, 6, 0, 0]} name="Pedidos" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
