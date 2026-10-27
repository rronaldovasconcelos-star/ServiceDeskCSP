import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import api from '../lib/api';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, Table } from '../components/ui';

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
const statusLabel: Record<string, string> = {
  '': 'Todos os status', PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
const categories = ['', 'PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS'];
const categoryLabel: Record<string, string> = {
  '': 'Todas as categorias', PAPEL: 'Papel', TONER: 'Toner', LIMPEZA: 'Limpeza', INFORMATICA: 'Informática', OUTROS: 'Outros',
};

export default function SuprimentosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const pendentes = requests.filter((r) => r.status === 'PENDENTE').length;

  return (
    <>
      <PageHeader
        title="Pedidos de suprimentos"
        subtitle={loading ? 'Carregando…' : `${requests.length} pedido${requests.length === 1 ? '' : 's'}, ${pendentes} aguardando aprovação`}
        actions={(
          <>
            {isAdmin && <Button variant="onNavy" icon={<BookOpen size={15} />} onClick={() => navigate('/suprimentos/catalogo')}>Catálogo</Button>}
            <Button variant="secondary" icon={<Plus size={16} />} onClick={() => navigate('/suprimentos/new')}>Novo pedido</Button>
          </>
        )}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field" style={{ width: 'auto' }}>
            {statuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field" style={{ width: 'auto' }}>
            {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </select>
        </div>

        {isAdmin && (
          <Card title="Excluir pedidos em massa" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                De{' '}
                <input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} className="field" style={{ width: 'auto' }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Até{' '}
                <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="field" style={{ width: 'auto' }} />
              </label>
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="field" style={{ width: 'auto' }}>
                {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
              </select>
              <Button variant="ghost" onClick={previewBulk} disabled={!hasBulkFilter || bulkBusy}>Pré-visualizar</Button>
              {bulkCount !== null && (
                <Button variant="danger" onClick={runBulkDelete} disabled={bulkCount === 0 || bulkBusy}>Excluir {bulkCount}</Button>
              )}
            </div>
            {bulkCount !== null && (
              <p style={{ fontSize: 12, color: bulkCount > 0 ? 'var(--coral)' : 'var(--text-secondary)', margin: '10px 0 0' }}>
                {bulkCount > 0
                  ? `${bulkCount} pedido(s) serão excluídos com os filtros selecionados.`
                  : 'Nenhum pedido corresponde aos filtros selecionados.'}
              </p>
            )}
            {!hasBulkFilter && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
                Informe ao menos um filtro (período ou tipo) para excluir em massa.
              </p>
            )}
          </Card>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                isEmpty={requests.length === 0}
                empty="Nenhum pedido com esses filtros."
                head={(
                  <tr>
                    <th>Item</th>
                    <th>Quantidade</th>
                    <th>Urgência</th>
                    <th>Status</th>
                    {isAdmin && <th>Solicitante</th>}
                    <th>Data</th>
                    {isAdmin && <th>Ações</th>}
                  </tr>
                )}
              >
                {requests.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td>
                      <Link to={`/suprimentos/${r.id}`} style={{ fontWeight: 500, color: 'var(--electric)', textDecoration: 'none' }}>
                        {r.item.name}
                      </Link>
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{categoryLabel[r.item.category] ?? r.item.category}</span>
                    </td>
                    <td>{r.quantity} {r.item.unit}</td>
                    <td><UrgencyBadge urgency={r.urgency} /></td>
                    <td><SupplyStatusBadge status={r.status} /></td>
                    {isAdmin && <td style={{ color: 'var(--text-secondary)' }}>{r.requester.name}</td>}
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</td>
                    {isAdmin && (
                      <td>
                        <button onClick={() => deleteOne(r.id, r.item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral)', fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit' }}>
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {requests.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum pedido com esses filtros.</p>}
              {requests.map((r) => (
                <Card key={r.id} style={{ padding: 14 }}>
                  <Link to={`/suprimentos/${r.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--electric)', fontSize: 13, display: 'block' }}>{r.item.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{categoryLabel[r.item.category] ?? r.item.category}</span>
                      </div>
                      <SupplyStatusBadge status={r.status} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <UrgencyBadge urgency={r.urgency} />
                      <span className="pill pill-muted">{r.quantity} {r.item.unit}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {isAdmin ? <span>{r.requester.name}</span> : <span />}
                      <span>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </Link>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <Button variant="ghost" size="sm" onClick={() => deleteOne(r.id, r.item.name)} style={{ color: 'var(--coral)' }}>Excluir</Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
