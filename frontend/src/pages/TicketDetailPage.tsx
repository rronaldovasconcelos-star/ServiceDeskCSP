import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, Card } from '../components/ui';

const categoryLabel: Record<string, string> = {
  TI: 'TI',
  MANUTENCAO: 'Manutenção',
  PEDAGOGICO: 'Pedagógico',
  ADMINISTRATIVO: 'Administrativo',
  OUTROS: 'Outros',
};

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
  AGUARDANDO_APROVACAO: ['APROVADO', 'REJEITADO'],
  APROVADO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
  REJEITADO: [],
};

const statusLabel: Record<string, string> = {
  APROVADO: 'Aprovar', REJEITADO: 'Rejeitar', EM_ANDAMENTO: 'Iniciar atendimento',
  CONCLUIDO: 'Concluir', CANCELADO: 'Cancelar',
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const statusButtonVariant: Record<string, Variant> = {
  APROVADO: 'secondary',
  REJEITADO: 'danger',
  EM_ANDAMENTO: 'primary',
  CONCLUIDO: 'secondary',
  CANCELADO: 'ghost',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'GESTOR';
  const canApprove = isPrivileged;
  const isAdmin = user?.role === 'ADMIN';

  const load = () => {
    api.get(`/tickets/${id}`).then((r) => setTicket(r.data));
  };

  useEffect(() => {
    api.get(`/tickets/${id}`)
      .then((r) => setTicket(r.data))
      .finally(() => setLoading(false));
    if (isPrivileged) {
      api.get('/users/directory').then((r) => setUsers(r.data));
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

  const addComment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/tickets/${id}/comments`, { message: comment });
    setComment('');
    load();
  };

  const deleteTicket = async () => {
    if (!window.confirm('Excluir este chamado permanentemente? Esta ação não pode ser desfeita.')) return;
    await api.delete(`/tickets/${id}`);
    navigate('/tickets');
  };

  if (loading) return <div className="page-body" style={{ color: 'var(--text-secondary)' }}>Carregando...</div>;
  if (!ticket) return <div className="page-body" style={{ color: 'var(--coral)' }}>Chamado não encontrado.</div>;

  const nextStatuses = TRANSITIONS[ticket.status] ?? [];
  const isApprovalStep = ticket.status === 'AGUARDANDO_APROVACAO';

  const seletorResponsavel = (
    <select value={ticket.assignee?.id ?? ''} onChange={(e) => assignTicket(e.target.value || null)} className="field" style={{ width: 'auto' }} aria-label="Responsável">
      <option value="">Sem responsável</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        title={ticket.title}
        subtitle={`${categoryLabel[ticket.category] ?? ticket.category} · aberto por ${ticket.requester.name} em ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')}`}
        actions={(
          <>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <UrgencyBadge urgency={ticket.urgency} />
              <StatusBadge status={ticket.status} />
            </span>
            <Button variant="onNavy" icon={<ArrowLeft size={15} />} onClick={() => navigate('/tickets')}>Chamados</Button>
          </>
        )}
      />

      <div className="page-body" style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Solicitante:</span> {ticket.requester.name}</div>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Responsável:</span> {ticket.assignee?.name ?? '—'}</div>
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Aberto em:</span> {new Date(ticket.createdAt).toLocaleString('pt-BR')}</div>
            {ticket.resolvedAt && (
              <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Concluído em:</span> {new Date(ticket.resolvedAt).toLocaleString('pt-BR')}</div>
            )}
          </div>

          {/* Aprovação pendente (ADMIN/GESTOR) */}
          {isApprovalStep && canApprove && (
            <div style={{ marginTop: 20, padding: 14, background: 'var(--amber-soft)', borderRadius: 'var(--radius-tile)' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 10px' }}>
                Este chamado de compra está aguardando sua aprovação.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => changeStatus('APROVADO')}>Aprovar</Button>
                <Button variant="danger" onClick={() => changeStatus('REJEITADO')}>Rejeitar</Button>
              </div>
            </div>
          )}

          {/* Aviso ao solicitante */}
          {isApprovalStep && !canApprove && (
            <div style={{ marginTop: 20, padding: 14, background: 'var(--amber-soft)', borderRadius: 'var(--radius-tile)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
                Seu chamado está aguardando aprovação de um gestor ou administrador.
              </p>
            </div>
          )}

          {/* Ações de status */}
          {isPrivileged && !isApprovalStep && nextStatuses.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {nextStatuses.map((s) => (
                <Button key={s} variant={statusButtonVariant[s] ?? 'primary'} onClick={() => changeStatus(s)}>
                  {statusLabel[s] ?? s}
                </Button>
              ))}
              {seletorResponsavel}
            </div>
          )}

          {isPrivileged && isApprovalStep && (
            <div style={{ marginTop: 14 }}>{seletorResponsavel}</div>
          )}

          {isAdmin && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <Button variant="ghost" onClick={deleteTicket} style={{ color: 'var(--coral)', borderColor: 'var(--coral)' }}>Excluir chamado</Button>
            </div>
          )}
        </Card>

        {/* Histórico */}
        <Card title="Histórico">
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ticket.history.map((entry) => (
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
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Escreva um comentário…"
              className="field"
              style={{ resize: 'vertical' }}
            />
            <div style={{ marginTop: 10 }}>
              <Button type="submit" disabled={!comment.trim()}>Comentar</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
