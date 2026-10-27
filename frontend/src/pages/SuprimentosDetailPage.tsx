import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, Card } from '../components/ui';

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
  APROVADO: 'Aprovar', COMPRADO: 'Marcar como comprado', ENTREGUE: 'Confirmar entrega', CANCELADO: 'Cancelar',
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

  const deleteRequest = async () => {
    if (!window.confirm('Excluir este pedido permanentemente? Esta ação não pode ser desfeita.')) return;
    await api.delete(`/suprimentos/requests/${id}`);
    navigate('/suprimentos');
  };

  if (loading) return <div className="page-body" style={{ color: 'var(--text-secondary)' }}>Carregando...</div>;
  if (!request) return <div className="page-body" style={{ color: 'var(--coral)' }}>{error || 'Pedido não encontrado.'}</div>;

  const nextStatuses = TRANSITIONS[request.status] ?? [];

  const timeline = [
    { status: 'PENDENTE',  label: 'Pedido enviado', done: true },
    { status: 'APROVADO',  label: 'Aprovado',  done: ['APROVADO', 'COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'COMPRADO',  label: 'Comprado',  done: ['COMPRADO', 'ENTREGUE'].includes(request.status) },
    { status: 'ENTREGUE',  label: 'Entregue',  done: request.status === 'ENTREGUE' },
  ];

  return (
    <>
      <PageHeader
        title={request.item.name}
        subtitle={`${request.quantity} ${request.item.unit} · pedido por ${request.requester.name} em ${new Date(request.createdAt).toLocaleDateString('pt-BR')}`}
        actions={(
          <>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <UrgencyBadge urgency={request.urgency} />
              <SupplyStatusBadge status={request.status} />
            </span>
            <Button variant="onNavy" icon={<ArrowLeft size={15} />} onClick={() => navigate('/suprimentos')}>Suprimentos</Button>
          </>
        )}
      />

      <div className="page-body" style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div role="alert" style={{ padding: '10px 14px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <Card>
          {request.notes && (
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-tile)', padding: '10px 12px' }}>
              {request.notes}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Solicitante:</span> {request.requester.name}</div>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>E-mail:</span> {request.requester.email}</div>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Aberto em:</span> {new Date(request.createdAt).toLocaleString('pt-BR')}</div>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Atualizado em:</span> {new Date(request.updatedAt).toLocaleString('pt-BR')}</div>
          </div>

          {user?.role === 'ADMIN' && nextStatuses.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  variant={s === 'CANCELADO' ? 'ghost' : s === 'ENTREGUE' ? 'secondary' : 'primary'}
                  onClick={() => changeStatus(s)}
                  disabled={actionLoading}
                  style={s === 'CANCELADO' ? { color: 'var(--coral)' } : undefined}
                >
                  {nextLabel[s] ?? s}
                </Button>
              ))}
            </div>
          )}

          {user?.role === 'ADMIN' && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <Button variant="ghost" onClick={deleteRequest} style={{ color: 'var(--coral)', borderColor: 'var(--coral)' }}>Excluir pedido</Button>
            </div>
          )}
        </Card>

        {/* Linha do tempo: aqui a sequência é real */}
        {request.status !== 'CANCELADO' && (
          <Card title="Progresso do pedido">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {timeline.map((step, i) => (
                <div key={step.status} style={{ display: 'flex', alignItems: 'center', flex: i < timeline.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: step.done ? 'var(--teal)' : 'var(--bg-card-hover)', color: step.done ? '#fff' : 'var(--text-secondary)', border: `2px solid ${step.done ? 'var(--teal)' : 'var(--border)'}` }}>
                      {step.done ? <Check size={16} /> : i + 1}
                    </div>
                    <span style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', width: 64, lineHeight: 1.3 }}>{step.label}</span>
                  </div>
                  {i < timeline.length - 1 && (
                    <div style={{ flex: 1, height: 2, marginBottom: 22, background: timeline[i + 1].done ? 'var(--teal)' : 'var(--border)' }} />
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Histórico">
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {request.history.map((entry) => (
              <li key={entry.id} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--electric)', flexShrink: 0, marginTop: 6 }} aria-hidden="true" />
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 2px' }}>{entry.message}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                    {entry.author.name} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <form onSubmit={addComment} style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Escreva um comentário…" className="field" style={{ resize: 'vertical' }} />
            <div style={{ marginTop: 10 }}>
              <Button type="submit" disabled={!comment.trim()}>Comentar</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
