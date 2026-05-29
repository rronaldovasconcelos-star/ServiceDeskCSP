import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';

interface HistoryEntry {
  id: string;
  type: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
  createdAt: string;
  author: { id: string; name: string };
}

interface SupplyRequest {
  id: string;
  quantity: number;
  urgency: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  item: { id: string; name: string; unit: string; category: string };
  requester: { id: string; name: string; email: string; phone?: string };
  history: HistoryEntry[];
}

const TRANSITIONS: Record<string, string[]> = {
  PENDENTE: ['APROVADO', 'CANCELADO'],
  APROVADO: ['COMPRADO', 'CANCELADO'],
  COMPRADO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

const nextLabel: Record<string, string> = {
  APROVADO: 'Aprovar', COMPRADO: 'Marcar Comprado', ENTREGUE: 'Confirmar Entrega', CANCELADO: 'Cancelar',
};

export default function SuprimentosDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<SupplyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');

  const load = () => {
    api.get(`/suprimentos/requests/${id}`).then((r) => setRequest(r.data));
  };

  useEffect(() => {
    api.get(`/suprimentos/requests/${id}`)
      .then((r) => setRequest(r.data))
      .catch(() => setError('Pedido não encontrado.'))
      .finally(() => setLoading(false));
  }, [id]);

  const changeStatus = async (status: string) => {
    setActionLoading(true);
    try {
      await api.patch(`/suprimentos/requests/${id}/status`, { status });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao atualizar status.');
    } finally {
      setActionLoading(false);
    }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/suprimentos/requests/${id}/comments`, { message: comment });
    setComment('');
    load();
  };

  if (loading) return <div className="text-slate-500 dark:text-slate-400">Carregando...</div>;
  if (!request) return <div className="text-red-500">{error || 'Pedido não encontrado.'}</div>;

  const nextStatuses = TRANSITIONS[request.status] ?? [];

  const timeline = [
    { status: 'PENDENTE', label: 'Pedido enviado', done: true },
    { status: 'APROVADO', label: 'Aprovado', done: ['APROVADO', 'COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'COMPRADO', label: 'Comprado', done: ['COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'ENTREGUE', label: 'Entregue', done: request.status === 'ENTREGUE' },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={() => navigate('/suprimentos')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Voltar para Suprimentos
      </button>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{request.item.name}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{request.item.category} · {request.quantity} {request.item.unit}</p>
          </div>
          <div className="flex gap-2">
            <UrgencyBadge urgency={request.urgency} />
            <SupplyStatusBadge status={request.status} />
          </div>
        </div>

        {request.notes && (
          <p className="mt-4 text-slate-700 dark:text-slate-300 text-sm leading-relaxed bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
            {request.notes}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-400">
          <div><span className="font-medium text-slate-700 dark:text-slate-300">Solicitante:</span> {request.requester.name}</div>
          <div><span className="font-medium text-slate-700 dark:text-slate-300">E-mail:</span> {request.requester.email}</div>
          <div><span className="font-medium text-slate-700 dark:text-slate-300">Aberto em:</span> {new Date(request.createdAt).toLocaleString('pt-BR')}</div>
          <div><span className="font-medium text-slate-700 dark:text-slate-300">Atualizado em:</span> {new Date(request.updatedAt).toLocaleString('pt-BR')}</div>
        </div>

        {user?.role === 'ADMIN' && nextStatuses.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-3">
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={actionLoading}
                className={`px-4 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                  s === 'CANCELADO'
                    ? 'border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                    : 'bg-blue-700 text-white hover:bg-blue-800'
                }`}
              >
                {nextLabel[s] ?? s}
              </button>
            ))}
          </div>
        )}
      </div>

      {request.status !== 'CANCELADO' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Progresso do Pedido</h3>
          <div className="flex items-center gap-0">
            {timeline.map((step, i) => (
              <div key={step.status} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.done ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-400'
                  }`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center w-16">{step.label}</span>
                </div>
                {i < timeline.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 ${
                    timeline[i + 1].done ? 'bg-blue-700' : 'bg-slate-200 dark:bg-slate-600'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Histórico</h3>
        <div className="space-y-3">
          {request.history.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <div className="w-1.5 rounded-full bg-slate-200 dark:bg-slate-600 self-stretch mt-1.5" />
              <div className="flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-300">{entry.message}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {entry.author.name} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addComment} className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Adicionar comentário..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="mt-2 px-4 py-1.5 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800"
          >
            Comentar
          </button>
        </form>
      </div>
    </div>
  );
}
