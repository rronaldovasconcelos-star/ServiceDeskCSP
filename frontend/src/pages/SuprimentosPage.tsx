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
  const isAdmin = user?.role === 'ADMIN';
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  // Exclusão em massa (admin)
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const bulkParams = () => {
    const params: Record<string, string> = {};
    if (bulkFrom) params.from = bulkFrom;
    if (bulkTo) params.to = bulkTo;
    if (bulkCategory) params.category = bulkCategory;
    return params;
  };
  const hasBulkFilter = Boolean(bulkFrom || bulkTo || bulkCategory);

  const previewBulk = async () => {
    setBulkBusy(true);
    try {
      const r = await api.get('/suprimentos/requests/admin/bulk-preview', { params: bulkParams() });
      setBulkCount(r.data.count);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (bulkCount === null) return;
    if (!window.confirm(`Excluir permanentemente ${bulkCount} pedido(s)? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    try {
      await api.delete('/suprimentos/requests/admin/bulk', { params: bulkParams() });
      setBulkCount(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      setReloadKey((k) => k + 1);
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteOne = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o pedido de "${name}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/suprimentos/requests/${id}`);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    setBulkCount(null);
  }, [bulkFrom, bulkTo, bulkCategory]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/suprimentos/requests', { params })
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  }, [status, category, reloadKey]);

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

      {/* Exclusão em massa — restrito ao ADMIN */}
      {isAdmin && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
            Excluir pedidos em massa
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              De{' '}
              <input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} style={selectStyle} />
            </label>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Até{' '}
              <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} style={selectStyle} />
            </label>
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} style={selectStyle}>
              {categories.map((c) => <option key={c} value={c}>{c || 'Todas as categorias'}</option>)}
            </select>
            <button
              onClick={previewBulk}
              disabled={!hasBulkFilter || bulkBusy}
              style={{ padding: '6px 14px', background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: hasBulkFilter && !bulkBusy ? 'pointer' : 'not-allowed', opacity: hasBulkFilter && !bulkBusy ? 1 : 0.5 }}
            >
              Pré-visualizar
            </button>
            {bulkCount !== null && (
              <button
                onClick={runBulkDelete}
                disabled={bulkCount === 0 || bulkBusy}
                style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: bulkCount > 0 && !bulkBusy ? 'pointer' : 'not-allowed', opacity: bulkCount > 0 && !bulkBusy ? 1 : 0.5 }}
              >
                Excluir {bulkCount}
              </button>
            )}
          </div>
          {bulkCount !== null && (
            <p style={{ fontSize: '12px', color: bulkCount > 0 ? '#ef4444' : 'var(--text-secondary)', margin: '10px 0 0' }}>
              {bulkCount > 0
                ? `${bulkCount} pedido(s) serão excluídos com os filtros selecionados.`
                : 'Nenhum pedido corresponde aos filtros selecionados.'}
            </p>
          )}
          {!hasBulkFilter && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '10px 0 0' }}>
              Informe ao menos um filtro (período ou tipo) para excluir em massa.
            </p>
          )}
        </div>
      )}

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
                  {isAdmin && <th style={thStyle}>Ações</th>}
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
                    {isAdmin && (
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => deleteOne(r.id, r.item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0, fontWeight: 500 }}>
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}
              >
                <Link to={`/suprimentos/${r.id}`} style={{ display: 'block', textDecoration: 'none' }}>
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
                {isAdmin && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <button onClick={() => deleteOne(r.id, r.item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0, fontWeight: 500 }}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
