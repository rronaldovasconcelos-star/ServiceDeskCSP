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

const statuses = ['', 'ABERTO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REJEITADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
const statusFilterLabel: Record<string, string> = {
  '': 'Todos os status',
  ABERTO: 'Aberto',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};
const categories = ['', 'TI', 'MANUTENCAO', 'PEDAGOGICO', 'ADMINISTRATIVO', 'OUTROS'];
const categoryLabel: Record<string, string> = {
  '': 'Todas as categorias',
  TI: 'TI',
  MANUTENCAO: 'Manutenção',
  PEDAGOGICO: 'Pedagógico',
  ADMINISTRATIVO: 'Administrativo',
  OUTROS: 'Outros',
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

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/tickets', { params })
      .then((r) => setTickets(r.data))
      .finally(() => setLoading(false));
  }, [status, category]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Chamados</h2>
        <Link
          to="/tickets/new"
          style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}
        >
          + Novo Chamado
        </Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {statuses.map((s) => <option key={s} value={s}>{statusFilterLabel[s]}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : tickets.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum chamado encontrado.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Título</th>
                  <th style={thStyle}>Categoria</th>
                  <th style={thStyle}>Urgência</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Solicitante</th>
                  <th style={thStyle}>Aberto em</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => (
                  <tr key={t.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link to={`/tickets/${t.id}`} style={{ fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}>
                        {t.title}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{categoryLabel[t.category] ?? t.category}</td>
                    <td style={{ padding: '10px 16px' }}><UrgencyBadge urgency={t.urgency} /></td>
                    <td style={{ padding: '10px 16px' }}><StatusBadge status={t.status} /></td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{t.requester.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                      {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                style={{ display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '13px', lineHeight: 1.4 }}>{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <UrgencyBadge urgency={t.urgency} />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>
                    {t.category}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>{t.requester.name}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
