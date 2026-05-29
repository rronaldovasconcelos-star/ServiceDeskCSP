import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';

interface Ticket {
  id: string;
  title: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  requester: { name: string };
  assignee?: { name: string } | null;
}

const statuses = ['', 'ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
const categories = ['', 'TI', 'SUPRIMENTOS'];

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/tickets', { params })
      .then((r) => setTickets(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, category]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Chamados</h2>
        <Link to="/tickets/new" className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800">
          + Novo Chamado
        </Link>
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s || 'Todos os status'}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c || 'Todas as categorias'}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Carregando...</p>
      ) : tickets.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">Nenhum chamado encontrado.</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Categoria</th>
                <th className="px-4 py-3 text-left">Urgência</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Solicitante</th>
                <th className="px-4 py-3 text-left">Aberto em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
                  <td className="px-4 py-3">
                    <Link to={`/tickets/${t.id}`} className="font-medium text-blue-700 dark:text-blue-400 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.category}</td>
                  <td className="px-4 py-3"><UrgencyBadge urgency={t.urgency} /></td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{t.requester.name}</td>
                  <td className="px-4 py-3 text-slate-400 dark:text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
