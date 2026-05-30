import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Ticket, Clock, Activity, Timer,
  ShoppingCart, AlertCircle, CheckCircle, Package,
  Search,
} from 'lucide-react';
import api from '../lib/api';
import KanbanBoard from '../components/KanbanBoard';

interface SupplyMetrics {
  total: number;
  pending: number;
  approved: number;
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
}

interface TicketItem {
  id: string;
  title: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  requester: { name: string };
  assignee: { name: string } | null;
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
  'Em Andamento': 'var(--status-andamento)',
  'Concluído':    'var(--status-concluido)',
  'Cancelado':    'var(--status-cancelado)',
};
const FALLBACK_COLORS = ['#4d8ef0', '#f59e0b', '#22c55e', '#6b7280', '#a855f7'];

const SUPPLY_COLORS = ['#f59e0b', '#3b82f6', '#a855f7', '#22c55e', '#ef4444'];

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};
const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};

/* ── Skeleton de carregamento ── */
function SkeletonKpi() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton rounded-lg" style={{ height: '96px' }} />
      ))}
    </div>
  );
}

/* ── Card KPI ── */
interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  topColor: string;
  icon: React.ElementType;
}
function KpiCard({ title, value, sub, topColor, icon: Icon }: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{ borderTop: `2px solid ${topColor}` }}
    >
      <span className="kpi-card-icon" style={{ color: topColor }}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <p className="kpi-label">{title}</p>
      <p className="kpi-value">{value}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

/* ── Tooltip customizado para Recharts ── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number; name: string}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
      {label && <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 4px' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>
          {p.name ? `${p.name}: ` : ''}<strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ── Filtros rápidos do Kanban ── */
const FILTER_OPTIONS = [
  { label: 'Todos',        value: '',            color: 'var(--text-secondary)' },
  { label: 'Aberto',       value: 'ABERTO',      color: 'var(--status-aberto)' },
  { label: 'Em Andamento', value: 'EM_ANDAMENTO', color: 'var(--status-andamento)' },
  { label: 'Concluído',    value: 'CONCLUIDO',   color: 'var(--status-concluido)' },
  { label: 'Cancelado',    value: 'CANCELADO',   color: 'var(--status-cancelado)' },
];

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/reports/metrics'),
      api.get('/tickets'),
    ]).then(([metricsRes, ticketsRes]) => {
      setMetrics(metricsRes.data);
      setTickets(ticketsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setTickets((prev) =>
      prev.map((t) => t.id === ticketId ? { ...t, status: newStatus } : t)
    );
    try {
      await api.patch(`/tickets/${ticketId}/status`, { status: newStatus });
    } catch {
      const res = await api.get('/tickets');
      setTickets(res.data);
    }
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

  /* ── Filtragem de tickets para o Kanban ── */
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = !searchTerm ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.requester.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      {/* ══════════════ HEADER DA PÁGINA ══════════════ */}
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>

        <div className="page-header-actions">
          {/* Busca global */}
          <div className="search-bar" role="search">
            <Search size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar chamados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar chamados"
            />
          </div>

          {/* Exportar chamados */}
          <button
            onClick={() => handleExport('/reports/export/csv', 'chamados.csv')}
            className="btn-export btn-export-csv"
            aria-label="Exportar chamados em CSV"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => handleExport('/reports/export/pdf', 'chamados.pdf')}
            className="btn-export btn-export-pdf"
            aria-label="Exportar chamados em PDF"
          >
            Exportar PDF
          </button>
        </div>
      </header>

      {/* ══════════════ CONTEÚDO PRINCIPAL ══════════════ */}
      <main style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>

        {/* ── Seção: KPIs de Chamados ── */}
        <section aria-labelledby="section-kpi-chamados">
          <p id="section-kpi-chamados" className="section-label">Chamados de Suporte</p>
          {loading ? <SkeletonKpi /> : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Total de Chamados"
                value={metrics?.total ?? 0}
                topColor="var(--status-andamento)"
                icon={Ticket}
              />
              <KpiCard
                title="Aguardando Atendimento"
                value={metrics?.pending ?? 0}
                topColor="var(--status-aberto)"
                icon={Clock}
              />
              <KpiCard
                title="Em Andamento"
                value={metrics?.inProgress ?? 0}
                topColor="var(--accent)"
                icon={Activity}
              />
              <KpiCard
                title="Tempo Médio de Resolução"
                value={metrics?.avgResolutionHours != null ? `${metrics.avgResolutionHours}h` : '—'}
                sub="chamados concluídos"
                topColor="var(--status-concluido)"
                icon={Timer}
              />
            </div>
          )}
        </section>

        {/* ── Seção: Gráficos de Chamados ── */}
        {!loading && metrics && (
          <section aria-labelledby="section-graficos-chamados">
            <p id="section-graficos-chamados" className="section-label">Análise de Chamados</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="chart-card">
                <h2 className="chart-title">Chamados por Status</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {byStatusData.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{value}</span>}
                    />
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h2 className="chart-title">Chamados por Categoria</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byCategoryData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Chamados" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* ── Seção: Quadro Kanban ── */}
        <section aria-labelledby="section-kanban">
          <p id="section-kanban" className="section-label">Quadro de Chamados</p>

          {/* Filtros rápidos */}
          <div className="kanban-filters" role="group" aria-label="Filtrar por status">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`filter-btn${statusFilter === opt.value ? ' active' : ''}`}
                onClick={() => setStatusFilter(opt.value)}
                aria-pressed={statusFilter === opt.value}
                style={statusFilter === opt.value ? {} : { borderColor: opt.color, color: opt.color }}
              >
                {opt.label}
                {opt.value && metrics && (
                  <span style={{ marginLeft: 4, opacity: 0.8 }}>
                    ({metrics.byStatus[opt.value] ?? 0})
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton rounded-lg" style={{ height: '240px' }} />
              ))}
            </div>
          ) : (
            <KanbanBoard tickets={filteredTickets} onStatusChange={handleStatusChange} />
          )}
        </section>

        {/* ── Seção: KPIs de Suprimentos ── */}
        <section aria-labelledby="section-kpi-suprimentos">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <p id="section-kpi-suprimentos" className="section-label" style={{ margin: 0 }}>Pedidos de Suprimentos</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleExport('/reports/export/suprimentos/csv', 'suprimentos.csv')}
                className="btn-export btn-export-csv"
                aria-label="Exportar suprimentos em CSV"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => handleExport('/reports/export/suprimentos/pdf', 'suprimentos.pdf')}
                className="btn-export btn-export-pdf"
                aria-label="Exportar suprimentos em PDF"
              >
                Exportar PDF
              </button>
            </div>
          </div>

          {loading ? <SkeletonKpi /> : metrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Total de Pedidos"
                value={metrics.supply.total}
                topColor="#a855f7"
                icon={ShoppingCart}
              />
              <KpiCard
                title="Pendentes de Aprovação"
                value={metrics.supply.pending}
                topColor="var(--status-aberto)"
                icon={AlertCircle}
              />
              <KpiCard
                title="Aprovados / Em Compra"
                value={metrics.supply.approved}
                topColor="var(--status-andamento)"
                icon={CheckCircle}
              />
              <KpiCard
                title="Entregues"
                value={metrics.supply.byStatus['ENTREGUE'] ?? 0}
                topColor="var(--status-concluido)"
                icon={Package}
              />
            </div>
          )}
        </section>

        {/* ── Seção: Gráficos de Suprimentos ── */}
        {!loading && metrics && metrics.supply.total > 0 && (
          <section aria-labelledby="section-graficos-suprimentos">
            <p id="section-graficos-suprimentos" className="section-label">Análise de Suprimentos</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="chart-card">
                <h2 className="chart-title">Pedidos por Status</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={supplyByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {supplyByStatusData.map((_, i) => (
                        <Cell key={i} fill={SUPPLY_COLORS[i % SUPPLY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{value}</span>}
                    />
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h2 className="chart-title">Pedidos por Urgência</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(metrics.supply.byUrgency).map(([k, v]) => ({ name: k, value: v }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" fill="#a855f7" radius={[4, 4, 0, 0]} name="Pedidos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
