import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';

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
  APROVADO: 'Aprovar', REJEITADO: 'Rejeitar', EM_ANDAMENTO: 'Iniciar Atendimento',
  CONCLUIDO: 'Concluir', CANCELADO: 'Cancelar',
};

const statusButtonColors: Record<string, { bg: string; color: string }> = {
  APROVADO:    { bg: '#0d9488', color: '#fff' },
  REJEITADO:   { bg: '#ef4444', color: '#fff' },
  EM_ANDAMENTO:{ bg: 'var(--accent)', color: '#fff' },
  CONCLUIDO:   { bg: '#16a34a', color: '#fff' },
  CANCELADO:   { bg: 'var(--bg-card-hover)', color: 'var(--text-secondary)' },
};

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 12px',
  fontSize: '13px',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  outline: 'none',
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

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Carregando...</div>;
  if (!ticket) return <div style={{ padding: '24px', color: '#ef4444' }}>Chamado não encontrado.</div>;

  const nextStatuses = TRANSITIONS[ticket.status] ?? [];
  const isApprovalStep = ticket.status === 'AGUARDANDO_APROVACAO';

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <button
        onClick={() => navigate('/tickets')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', padding: 0, textAlign: 'left', width: 'fit-content' }}
      >
        ← Voltar para Chamados
      </button>

      {/* Card principal */}
      <div className="detail-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{ticket.title}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>{categoryLabel[ticket.category] ?? ticket.category}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <UrgencyBadge urgency={ticket.urgency} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <p style={{ marginTop: '16px', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6 }}>{ticket.description}</p>

        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Solicitante:</span> {ticket.requester.name}</div>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Responsável:</span> {ticket.assignee?.name ?? '—'}</div>
          <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Aberto em:</span> {new Date(ticket.createdAt).toLocaleString('pt-BR')}</div>
          {ticket.resolvedAt && (
            <div><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Concluído em:</span> {new Date(ticket.resolvedAt).toLocaleString('pt-BR')}</div>
          )}
        </div>

        {/* Banner de aprovação pendente para ADMIN/GESTOR */}
        {isApprovalStep && canApprove && (
          <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#f97316', marginBottom: '10px' }}>
              Este chamado de compra está aguardando sua aprovação.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => changeStatus('APROVADO')} style={{ padding: '7px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                ✓ Aprovar
              </button>
              <button onClick={() => changeStatus('REJEITADO')} style={{ padding: '7px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                ✕ Rejeitar
              </button>
            </div>
          </div>
        )}

        {/* Banner informativo para solicitante quando aguardando aprovação */}
        {isApprovalStep && !canApprove && (
          <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ fontSize: '13px', color: '#f97316', margin: 0 }}>
              Seu chamado está aguardando aprovação de um gestor ou administrador.
            </p>
          </div>
        )}

        {/* Ações de status */}
        {isPrivileged && !isApprovalStep && nextStatuses.length > 0 && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            {nextStatuses.map((s) => {
              const c = statusButtonColors[s] ?? { bg: 'var(--accent)', color: '#fff' };
              return (
                <button key={s} onClick={() => changeStatus(s)} style={{ padding: '7px 16px', background: c.bg, color: c.color, border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                  {statusLabel[s] ?? s}
                </button>
              );
            })}
            <select value={ticket.assignee?.id ?? ''} onChange={(e) => assignTicket(e.target.value || null)} style={selectStyle}>
              <option value="">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        {/* Atribuição disponível mesmo quando aguardando aprovação */}
        {isPrivileged && isApprovalStep && (
          <div style={{ marginTop: '14px' }}>
            <select value={ticket.assignee?.id ?? ''} onChange={(e) => assignTicket(e.target.value || null)} style={selectStyle}>
              <option value="">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        {/* Exclusão — restrito ao ADMIN */}
        {isAdmin && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={deleteTicket}
              style={{ padding: '7px 16px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
            >
              Excluir chamado
            </button>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="detail-card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {ticket.history.map((entry) => (
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
