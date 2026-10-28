import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, MessageSquare, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Notice } from '../components/ui';
import { formatDateTime, formatRelative } from '../lib/dates';

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
  const [commentLoading, setCommentLoading] = useState(false);
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
    setCommentLoading(true);
    try {
      await api.post(`/suprimentos/requests/${id}/comments`, { message: comment });
      setComment('');
      load();
    } catch {
      setError('Erro ao enviar o comentário.');
    } finally {
      setCommentLoading(false);
    }
  };

  const deleteRequest = async () => {
    if (!window.confirm('Excluir este pedido permanentemente? Esta ação não pode ser desfeita.')) return;
    await api.delete(`/suprimentos/requests/${id}`);
    navigate('/suprimentos');
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Pedido de suprimento" description="Carregando…" backTo="/suprimentos" backLabel="Pedidos de suprimentos" />
        <main className="page-body max-w-[900px] stack" aria-busy="true">
          <div className="skeleton h-[140px]" />
          <div className="skeleton h-[120px]" />
          <div className="skeleton h-[200px]" />
        </main>
      </>
    );
  }

  if (!request) {
    return (
      <>
        <PageHeader title="Pedido de suprimento" backTo="/suprimentos" backLabel="Pedidos de suprimentos" />
        <main className="page-body max-w-[900px]">
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={() => navigate('/suprimentos')}>Voltar aos pedidos</Button>}
          >
            {error || 'Pedido não encontrado.'}
          </Notice>
        </main>
      </>
    );
  }

  const nextStatuses = TRANSITIONS[request.status] ?? [];
  const isAdmin = user?.role === 'ADMIN';

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
        backTo="/suprimentos"
        backLabel="Pedidos de suprimentos"
        meta={(
          <>
            <SupplyStatusBadge status={request.status} />
            <UrgencyBadge urgency={request.urgency} />
            <span className="pill pill-muted">{request.quantity} {request.item.unit}</span>
          </>
        )}
        description={`Pedido por ${request.requester.name} em ${new Date(request.createdAt).toLocaleDateString('pt-BR')}`}
        actions={isAdmin ? (
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={deleteRequest}>Excluir pedido</Button>
        ) : undefined}
      />

      <main className="page-body max-w-[900px] stack">
        {error && (
          <Notice kind="danger" onClose={() => setError('')}>{error}</Notice>
        )}

        <Card title="Detalhes">
          {request.notes && (
            <p className="mb-4 text-[13.5px] leading-relaxed bg-(--surface-2) rounded-(--radius-sm) px-3 py-2.5 whitespace-pre-wrap">
              {request.notes}
            </p>
          )}

          <dl className="dl">
            <dt>Solicitante</dt>
            <dd>{request.requester.name}</dd>
            <dt>E-mail</dt>
            <dd>{request.requester.email}</dd>
            <dt>Aberto em</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
            <dt>Atualizado em</dt>
            <dd><span title={formatDateTime(request.updatedAt)}>{formatRelative(request.updatedAt)}</span></dd>
          </dl>

          {isAdmin && nextStatuses.length > 0 && (
            <div className="form-actions mt-5 pt-5 border-t border-(--line)">
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  variant={s === 'CANCELADO' ? 'secondary' : s === 'ENTREGUE' ? 'secondary' : 'primary'}
                  className={s === 'CANCELADO' ? 'text-(--danger-ink)' : undefined}
                  onClick={() => changeStatus(s)}
                  loading={actionLoading}
                >
                  {nextLabel[s] ?? s}
                </Button>
              ))}
            </div>
          )}
        </Card>

        {/* Linha do tempo: aqui a sequência é real */}
        {request.status !== 'CANCELADO' && (
          <Card title="Progresso do pedido">
            <ol className="flex items-start list-none m-0 p-0" aria-label="Etapas do pedido">
              {timeline.map((step, i) => (
                <li key={step.status} className={`flex items-start ${i < timeline.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex flex-col items-center">
                    <span
                      className={`w-[34px] h-[34px] rounded-full inline-flex items-center justify-center text-xs font-semibold border-2 ${
                        step.done
                          ? 'bg-(--success-soft) text-(--success-ink) border-(--success)'
                          : 'bg-(--surface-2) text-(--text-2) border-(--line)'
                      }`}
                      aria-hidden="true"
                    >
                      {step.done ? <Check size={16} /> : i + 1}
                    </span>
                    <span className="mt-1.5 text-[11px] muted text-center w-16 leading-tight">
                      {step.label}
                      <span className="sr-only">{step.done ? ' (concluído)' : ' (pendente)'}</span>
                    </span>
                  </div>
                  {i < timeline.length - 1 && (
                    <span className={`flex-1 h-0.5 mt-4 ${timeline[i + 1].done ? 'bg-(--success)' : 'bg-(--line)'}`} aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
          </Card>
        )}

        <Card title="Histórico">
          {request.history.length === 0 ? (
            <EmptyState icon={<MessageSquare size={22} />} title="Sem registros ainda">
              Mudanças de status e comentários aparecem aqui.
            </EmptyState>
          ) : (
            <ol className="timeline">
              {request.history.map((entry) => (
                <li key={entry.id} className="timeline-item">
                  <span className={`timeline-dot ${entry.type === 'COMMENT' ? '' : 'info'}`} aria-hidden="true">
                    {entry.type === 'COMMENT' ? <MessageSquare size={14} /> : <Check size={14} />}
                  </span>
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <span className="timeline-author">{entry.author.name}</span>
                      <span className="timeline-time" title={formatDateTime(entry.createdAt)}>{formatRelative(entry.createdAt)}</span>
                    </div>
                    <p className="timeline-text">{entry.message}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <form onSubmit={addComment} className="mt-5 pt-5 border-t border-(--line) stack">
            <Field label="Novo comentário">
              {(ctl) => (
                <textarea {...ctl} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Escreva um comentário…" className="field" />
              )}
            </Field>
            <div className="form-actions">
              <Button type="submit" variant="secondary" disabled={!comment.trim()} loading={commentLoading}>Comentar</Button>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
