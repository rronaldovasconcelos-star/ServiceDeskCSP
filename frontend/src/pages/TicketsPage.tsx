import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, Card, Table } from '../components/ui';

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
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  EM_ANDAMENTO: 'Em andamento',
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

export default function TicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [tickets, setTickets] = useState<Ticket[]>([]);
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
      const r = await api.get('/tickets/admin/bulk-preview', { params: bulkParams() });
      setBulkCount(r.data.count);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (bulkCount === null) return;
    if (!window.confirm(`Excluir permanentemente ${bulkCount} chamado(s)? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    try {
      await api.delete('/tickets/admin/bulk', { params: bulkParams() });
      setBulkCount(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      setReloadKey((k) => k + 1);
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteOne = async (id: string, title: string) => {
    if (!window.confirm(`Excluir o chamado "${title}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/tickets/${id}`);
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
    api.get('/tickets', { params })
      .then((r) => setTickets(r.data))
      .finally(() => setLoading(false));
  }, [status, category, reloadKey]);

  const abertos = tickets.filter((t) => t.status === 'ABERTO').length;

  return (
    <>
      <PageHeader
        title="Chamados"
        subtitle={loading ? 'Carregando…' : `${tickets.length} chamado${tickets.length === 1 ? '' : 's'} na lista, ${abertos} em aberto`}
        actions={<Button variant="secondary" icon={<Plus size={16} />} onClick={() => navigate('/tickets/new')}>Novo chamado</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field" style={{ width: 'auto' }}>
            {statuses.map((s) => <option key={s} value={s}>{statusFilterLabel[s]}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field" style={{ width: 'auto' }}>
            {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </select>
        </div>

        {/* Exclusão em massa — restrito ao ADMIN */}
        {isAdmin && (
          <Card title="Excluir em massa" style={{ padding: '16px 20px' }}>
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
                  ? `${bulkCount} chamado(s) serão excluídos com os filtros selecionados.`
                  : 'Nenhum chamado corresponde aos filtros selecionados.'}
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
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table
                isEmpty={tickets.length === 0}
                empty="Nenhum chamado com esses filtros."
                head={(
                  <tr>
                    <th>Título</th>
                    <th>Categoria</th>
                    <th>Urgência</th>
                    <th>Status</th>
                    <th>Solicitante</th>
                    <th>Aberto em</th>
                    {isAdmin && <th>Ações</th>}
                  </tr>
                )}
              >
                {tickets.map((t) => (
                  <tr key={t.id} className="table-row">
                    <td>
                      <Link to={`/tickets/${t.id}`} style={{ fontWeight: 500, color: 'var(--electric)', textDecoration: 'none' }}>
                        {t.title}
                      </Link>
                    </td>
                    <td>{categoryLabel[t.category] ?? t.category}</td>
                    <td><UrgencyBadge urgency={t.urgency} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.requester.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                    {isAdmin && (
                      <td>
                        <button onClick={() => deleteOne(t.id, t.title)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral)', fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit' }}>
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {tickets.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum chamado com esses filtros.</p>}
              {tickets.map((t) => (
                <Card key={t.id} style={{ padding: 14 }}>
                  <Link to={`/tickets/${t.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--electric)', fontSize: 13, lineHeight: 1.4 }}>{t.title}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <UrgencyBadge urgency={t.urgency} />
                      <span className="pill pill-muted">{categoryLabel[t.category] ?? t.category}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      <span>{t.requester.name}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </Link>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <Button variant="ghost" size="sm" onClick={() => deleteOne(t.id, t.title)} style={{ color: 'var(--coral)' }}>Excluir</Button>
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
