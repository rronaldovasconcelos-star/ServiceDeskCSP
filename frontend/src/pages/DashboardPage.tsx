import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../lib/api';

interface Metrics {
  total: number;
  pending: number;
  inProgress: number;
  avgResolutionHours: number | null;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byUrgency: Record<string, number>;
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];
const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};

function StatCard({ title, value, sub, color }: { title: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm border-l-4 bg-white ${color}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/metrics')
      .then((r) => setMetrics(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = (type: 'csv' | 'pdf') => {
    const base = (import.meta.env.VITE_API_URL ?? '/api');
    window.open(`${base}/reports/export/${type}`, '_blank');
  };

  if (loading) return <div className="p-6 text-slate-500">Carregando métricas...</div>;
  if (!metrics) return <div className="p-6 text-red-500">Falha ao carregar métricas.</div>;

  const byStatusData = Object.entries(metrics.byStatus).map(([k, v]) => ({
    name: statusLabels[k] ?? k, value: v,
  }));
  const byCategoryData = Object.entries(metrics.byCategory).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Dashboard</h2>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
            Exportar CSV
          </button>
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            Exportar PDF
          </button>
        </div>
      </div>

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
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600 mb-4">Chamados por Status</h3>
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

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600 mb-4">Chamados por Categoria</h3>
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
  );
}
