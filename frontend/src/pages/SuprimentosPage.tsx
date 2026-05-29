import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

interface SupplyRequest {
  id: string;
  quantity: number;
  urgency: string;
  status: string;
  createdAt: string;
  item: { name: string; unit: string; category: string };
  requester: { name: string };
}

const statuses = ['', 'PENDENTE', 'APROVADO', 'COMPRADO', 'ENTREGUE', 'CANCELADO'];
const categories = ['', 'PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS'];

export default function SuprimentosPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/suprimentos/requests', { params })
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, category]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Pedidos de Suprimentos</h2>
        <div className="flex gap-2">
          {user?.role === 'ADMIN' && (
            <Link to="/suprimentos/catalogo" className="px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
              Catálogo
            </Link>
          )}
          <Link to="/suprimentos/new" className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800">
            + Novo Pedido
          </Link>
        </div>
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s || 'Todos os status'}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c || 'Todas as categorias'}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : requests.length === 0 ? (
        <p className="text-slate-400 text-sm">Nenhum pedido encontrado.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Qtd</th>
                <th className="px-4 py-3 text-left">Urgência</th>
                <th className="px-4 py-3 text-left">Status</th>
                {user?.role === 'ADMIN' && <th className="px-4 py-3 text-left">Solicitante</th>}
                <th className="px-4 py-3 text-left">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <Link to={`/suprimentos/${r.id}`} className="font-medium text-blue-700 hover:underline">
                      {r.item.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">{r.item.category}</span>
                  </td>
                  <td className="px-4 py-3">{r.quantity} {r.item.unit}</td>
                  <td className="px-4 py-3"><UrgencyBadge urgency={r.urgency} /></td>
                  <td className="px-4 py-3"><SupplyStatusBadge status={r.status} /></td>
                  {user?.role === 'ADMIN' && <td className="px-4 py-3 text-slate-600">{r.requester.name}</td>}
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString('pt-BR')}
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
