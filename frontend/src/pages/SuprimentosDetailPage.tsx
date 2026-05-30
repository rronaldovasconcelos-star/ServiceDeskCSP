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

  const addComment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/suprimentos/requests/${id}/comments`, { message: comment });
    setComment('');
    load();
  };

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Carregando...</div>;
  if (!request) return <div style={{ padding: '24px', color: '#ef4444' }}>{error || 'Pedido não encontrado.'}</div>;

  const nextStatuses = TRANSITIONS[request.status] ?? [];

  const timeline = [
    { status: 'PENDENTE',  label: 'Pedido enviado', done: true },
    { status: 'APROVADO',  label: 'Aprovado',  done: ['APROVADO', 'COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'COMPRADO',  label: 'Comprado',  done: ['COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'ENTREGUE',  label: 'Entregue',  done: request.status === 'ENTREGUE' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <button
        onClick={() => navigate('/suprimentos')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', padding: 0, textAlign: 'left', width: 'fit-content' }}
      >
        ← Voltar para Suprimentos
      </button>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Card principal */}
      <div className="detail-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{request.item.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>{request.item.category} · {request.quantity} {request.item.unit}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <UrgencyBadge urgency={request.urgency} />
            <SupplyStatusBadge status={request.status} />
          </div>
        </div>

        {request.notes && (
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
            {request.notes}
          </p>
        )}

        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Solicitante:</span> {request.requester.name}</div>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>E-mail:</span> {request.requester.email}</div>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Aberto em:</span> {new Date(request.createdAt).toLocaleString('pt-BR')}</div>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Atualizado em:</span> {new Date(request.updatedAt).toLocaleString('pt-BR')}</div>
        </div>

        {user?.role === 'ADMIN' && nextStatuses.length > 0 && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={actionLoading}
                style={{
                  padding: '7px 16px',
                  background: s === 'CANCELADO' ? 'transparent' : 'var(--accent)',
                  color: s === 'CANCELADO' ? '#ef4444' : '#fff',
                  border: s === 'CANCELADO' ? '1px solid rgba(239,68,68,0.4)' : 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.5 : 1,
                }}
              >
                {nextLabel[s] ?? s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline de progresso */}
      {request.status !== 'CANCELADO' && (
        <div className="detail-card">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progresso do Pedido</h3>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {timeline.map((step, i) => (
              <div key={step.status} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: step.done ? 'var(--accent)' : 'var(--bg-card-hover)', color: step.done ? '#fff' : 'var(--text-secondary)', border: `2px solid ${step.done ? 'var(--accent)' : 'var(--border)'}` }}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', width: '60px', lineHeight: 1.3 }}>{step.label}</span>
                </div>
                {i < timeline.length - 1 && (
                  <div style={{ flex: 1, height: '2px', marginBottom: '20px', background: timeline[i + 1].done ? 'var(--accent)' : 'var(--border)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="detail-card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {request.history.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '4px', borderRadius: '2px', background: 'var(--border)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 2px' }}>{entry.message}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                  {entry.author.name} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addComment} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Adicionar comentário..."
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '13px', resize: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            style={{ marginTop: '8px', padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
          >
            Comentar
          </button>
        </form>
      </div>
    </div>
  );
}
