import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';

interface HistoryEntry {
  id: string;
  type: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
  createdAt: string;
  author: { id: string; name: string };
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  requester: { id: string; name: string; email: string };
  assignee?: { id: string; name: string } | null;
  history: HistoryEntry[];
}

interface UserOption { id: string; name: string; }

const TRANSITIONS: Record<string, string[]> = {
  ABERTO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
};

const statusLabel: Record<string, string> = {
  EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get(`/tickets/${id}`).then((r) => setTicket(r.data));
  };

  useEffect(() => {
    api.get(`/tickets/${id}`)
      .then((r) => setTicket(r.data))
      .finally(() => setLoading(false));
    if (user?.role === 'ADMIN') {
      api.get('/users').then((r) => setUsers(r.data));
    }
  }, [id, user]);

  const changeStatus = async (status: string) => {
    await api.patch(`/tickets/${id}/status`, { status });
    load();
  };

  const assignTicket = async (assigneeId: string | null) => {
    await api.patch(`/tickets/${id}/assign`, { assigneeId });
    load();
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/tickets/${id}/comments`, { message: comment });
    setComment('');
    load();
  };

  if (loading) return <div className="text-slate-500">Carregando...</div>;
  if (!ticket) return <div className="text-red-500">Chamado não encontrado.</div>;

  const nextStatuses = TRANSITIONS[ticket.status] ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={() => navigate('/tickets')} className="text-sm text-blue-600 hover:underline">
        ← Voltar para Chamados
      </button>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{ticket.title}</h2>
            <p className="text-slate-500 text-sm mt-1">{ticket.category}</p>
          </div>
          <div className="flex gap-2">
            <UrgencyBadge urgency={ticket.urgency} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <p className="mt-4 text-slate-700 text-sm leading-relaxed">{ticket.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-600">
          <div><span className="font-medium">Solicitante:</span> {ticket.requester.name}</div>
          <div><span className="font-medium">Responsável:</span> {ticket.assignee?.name ?? '—'}</div>
          <div><span className="font-medium">Aberto em:</span> {new Date(ticket.createdAt).toLocaleString('pt-BR')}</div>
          {ticket.resolvedAt && (
            <div><span className="font-medium">Concluído em:</span> {new Date(ticket.resolvedAt).toLocaleString('pt-BR')}</div>
          )}
        </div>

        {user?.role === 'ADMIN' && (
          <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-3">
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className="px-4 py-1.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
              >
                {statusLabel[s] ?? s}
              </button>
            ))}

            <select
              value={ticket.assignee?.id ?? ''}
              onChange={(e) => assignTicket(e.target.value || null)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-4">Histórico</h3>
        <div className="space-y-3">
          {ticket.history.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <div className="w-1.5 rounded-full bg-slate-200 self-stretch mt-1.5" />
              <div className="flex-1">
                <p className="text-sm text-slate-700">{entry.message}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {entry.author.name} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addComment} className="mt-5 pt-5 border-t border-slate-100">
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
