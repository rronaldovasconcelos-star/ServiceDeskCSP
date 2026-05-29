import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../lib/api';
import KanbanBoard from '../components/KanbanBoard';

interface SupplyMetrics {
  total: number;
  pending: number;
  approved: number;
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
}

interface Ticket {
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

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];
const SUPPLY_COLORS = ['#f59e0b', '#3b82f6', '#a855f7', '#10b981', '#ef4444'];

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};

const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};

function StatCard({ title, value, sub, color }: { title: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm border-l-4 bg-white dark:bg-slate-800 ${color}`}>
      <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
      <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{children}</h3>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-6 text-slate-500">Carregando métricas...</div>;
  if (!metrics) return <div className="p-6 text-red-500">Falha ao carregar métricas.</div>;

  const byStatusData = Object.entries(metrics.byStatus).map(([k, v]) => ({
    name: statusLabels[k] ?? k, value: v,
  }));
  const byCategoryData = Object.entries(metrics.byCategory).map(([k, v]) => ({ name: k, value: v }));
  const supplyByStatusData = Object.entries(metrics.supply.byStatus).map(([k, v]) => ({
    name: supplyStatusLabels[k] ?? k, value: v,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
        <div className="flex gap-2">
          <button onClick={() => handleExport('/reports/export/csv', 'chamados.csv')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
            Exportar CSV
          </button>
          <button onClick={() => handleExport('/reports/export/pdf', 'chamados.pdf')} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Chamados */}
      <div className="space-y-4">
        <SectionTitle>Chamados de Suporte</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total de Chamados" value={metrics.total} color="border-blue-500" />
          <StatCard title="Aguardando Atendimento" value={metrics.pending} color="border-yellow-500" />
          <StatCard title="Em Andamento" value={metrics.inProgress} color="border-orange-500" />
          <StatCard
            title="Tempo Médio de Resolução"
            value={metrics.avgResolutionHours !== null ? `${metrics.avgResolutionHours}h` : '—'}
            sub="chamados concluídos"
            color="border-green-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Chamados por Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {byStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Chamados por Categoria</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategoryData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="space-y-4">
        <SectionTitle>Quadro de Chamados</SectionTitle>
        <KanbanBoard tickets={tickets} onStatusChange={handleStatusChange} />
      </div>

      {/* Suprimentos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Pedidos de Suprimentos</SectionTitle>
          <div className="flex gap-2">
            <button onClick={() => handleExport('/reports/export/suprimentos/csv', 'suprimentos.csv')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              Exportar CSV
            </button>
            <button onClick={() => handleExport('/reports/export/suprimentos/pdf', 'suprimentos.pdf')} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              Exportar PDF
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total de Pedidos" value={metrics.supply.total} color="border-purple-500" />
          <StatCard title="Pendentes de Aprovação" value={metrics.supply.pending} color="border-yellow-500" />
          <StatCard title="Aprovados / Em Compra" value={metrics.supply.approved} color="border-blue-500" />
          <StatCard
            title="Entregues"
            value={metrics.supply.byStatus['ENTREGUE'] ?? 0}
            color="border-green-500"
          />
        </div>

        {metrics.supply.total > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Pedidos por Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={supplyByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {supplyByStatusData.map((_, i) => <Cell key={i} fill={SUPPLY_COLORS[i % SUPPLY_COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Pedidos por Urgência</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={Object.entries(metrics.supply.byUrgency).map(([k, v]) => ({ name: k, value: v }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
