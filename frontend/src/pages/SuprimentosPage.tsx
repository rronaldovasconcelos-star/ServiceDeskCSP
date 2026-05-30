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

export default function SuprimentosPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/suprimentos/requests', { params })
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  }, [status, category]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Pedidos de Suprimentos</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {user?.role === 'ADMIN' && (
            <Link
              to="/suprimentos/catalogo"
              style={{ padding: '7px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}
            >
              Catálogo
            </Link>
          )}
          <Link
            to="/suprimentos/new"
            style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}
          >
            + Novo Pedido
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {statuses.map((s) => <option key={s} value={s}>{s || 'Todos os status'}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {categories.map((c) => <option key={c} value={c}>{c || 'Todas as categorias'}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : requests.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum pedido encontrado.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Qtd</th>
                  <th style={thStyle}>Urgência</th>
                  <th style={thStyle}>Status</th>
                  {user?.role === 'ADMIN' && <th style={thStyle}>Solicitante</th>}
                  <th style={thStyle}>Data</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link to={`/suprimentos/${r.id}`} style={{ fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}>
                        {r.item.name}
                      </Link>
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>{r.item.category}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{r.quantity} {r.item.unit}</td>
                    <td style={{ padding: '10px 16px' }}><UrgencyBadge urgency={r.urgency} /></td>
                    <td style={{ padding: '10px 16px' }}><SupplyStatusBadge status={r.status} /></td>
                    {user?.role === 'ADMIN' && <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{r.requester.name}</td>}
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                      {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {requests.map((r) => (
              <Link
                key={r.id}
                to={`/suprimentos/${r.id}`}
                style={{ display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '13px', display: 'block' }}>{r.item.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.item.category}</span>
                  </div>
                  <SupplyStatusBadge status={r.status} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <UrgencyBadge urgency={r.urgency} />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>
                    {r.quantity} {r.item.unit}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {user?.role === 'ADMIN' ? <span>{r.requester.name}</span> : <span />}
                  <span>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
