import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Trash2, Package } from 'lucide-react';
import api from '../lib/api';
import { SupplyStatusBadge, UrgencyBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Notice, Table } from '../components/ui';
import { formatDateTime, formatRelative } from '../lib/dates';

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
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  // Exclusão em massa (admin)
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
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
    setBulkError('');
    try {
      const r = await api.get('/suprimentos/requests/admin/bulk-preview', { params: bulkParams() });
      setBulkCount(r.data.count);
    } catch {
      setBulkError('Não foi possível pré-visualizar a exclusão.');
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (bulkCount === null) return;
    if (!window.confirm(`Excluir permanentemente ${bulkCount} pedido(s)? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      await api.delete('/suprimentos/requests/admin/bulk', { params: bulkParams() });
      setBulkCount(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      setReloadKey((k) => k + 1);
    } catch {
      setBulkError('Não foi possível excluir os pedidos.');
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
      .then((r) => { setRequests(r.data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [status, category, reloadKey]);

  const pendentes = requests.filter((r) => r.status === 'PENDENTE').length;
  const temFiltro = Boolean(status || category);

  const cabecalho = (
    <tr>
      <th>Item</th>
      <th>Quantidade</th>
      <th>Urgência</th>
      <th>Status</th>
      {isAdmin && <th>Solicitante</th>}
      <th>Data</th>
      {isAdmin && <th><span className="sr-only">Ações</span></th>}
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<Package size={22} />}
      title={temFiltro ? 'Nenhum pedido com esses filtros' : 'Nenhum pedido ainda'}
      action={<Link className="btn btn-primary" to="/suprimentos/new">Novo pedido</Link>}
    >
      {temFiltro
        ? 'Tente escolher outro status ou categoria.'
        : 'Quando alguém pedir um suprimento, ele aparece aqui.'}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Pedidos de suprimentos"
        description={loading ? 'Carregando…' : `${requests.length} pedido${requests.length === 1 ? '' : 's'}, ${pendentes} aguardando aprovação`}
        actions={(
          <>
            {isAdmin && <Button variant="secondary" icon={<BookOpen size={15} />} onClick={() => navigate('/suprimentos/catalogo')}>Catálogo</Button>}
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/suprimentos/new')}>Novo pedido</Button>
          </>
        )}
      />

      <main className="page-body">
        <div className="toolbar">
          <Field label="Status">
            {(ctl) => (
              <select {...ctl} value={status} onChange={(e) => setStatus(e.target.value)} className="field">
                {statuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
              </select>
            )}
          </Field>
          <Field label="Categoria">
            {(ctl) => (
              <select {...ctl} value={category} onChange={(e) => setCategory(e.target.value)} className="field">
                {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
              </select>
            )}
          </Field>
        </div>

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Tentar novamente</Button>}
          >
            Não foi possível carregar os pedidos.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={isAdmin ? 7 : 5} head={cabecalho} />
            </div>
            <div className="md:hidden stack" aria-busy="true">
              <div className="skeleton h-[96px]" />
              <div className="skeleton h-[96px]" />
              <div className="skeleton h-[96px]" />
            </div>
          </>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table isEmpty={requests.length === 0} empty={vazio} head={cabecalho}>
                {requests.map((r) => (
                  <tr key={r.id} className="table-row" onClick={() => navigate(`/suprimentos/${r.id}`)}>
                    <td>
                      <div className="row">
                        <Link
                          to={`/suprimentos/${r.id}`}
                          className="font-medium no-underline hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.item.name}
                        </Link>
                        <span className="pill pill-muted">{categoryLabel[r.item.category] ?? r.item.category}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{r.quantity} {r.item.unit}</td>
                    <td><UrgencyBadge urgency={r.urgency} /></td>
                    <td><SupplyStatusBadge status={r.status} /></td>
                    {isAdmin && <td className="muted">{r.requester.name}</td>}
                    <td className="muted whitespace-nowrap" title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</td>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Excluir pedido de ${r.item.name}`}
                          title="Excluir pedido"
                          icon={<Trash2 size={16} />}
                          onClick={() => deleteOne(r.id, r.item.name)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {requests.length === 0 && <div className="card">{vazio}</div>}
              {requests.map((r) => (
                <div key={r.id}>
                  <Link to={`/suprimentos/${r.id}`} className="ticket-card">
                    <p className="ticket-card-title">{r.item.name}</p>
                    <div className="ticket-card-meta">
                      <SupplyStatusBadge status={r.status} />
                      <UrgencyBadge urgency={r.urgency} />
                      <span className="pill pill-muted">{r.quantity} {r.item.unit}</span>
                      <span className="pill pill-muted">{categoryLabel[r.item.category] ?? r.item.category}</span>
                    </div>
                    <p className="ticket-card-sub">
                      {isAdmin && <>{r.requester.name} · </>}
                      pedido <span title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span>
                    </p>
                  </Link>
                  {isAdmin && (
                    <div className="flex justify-end mt-1">
                      <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => deleteOne(r.id, r.item.name)}>
                        Excluir
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ferramentas de administrador — exclusão em massa, restrita ao ADMIN */}
        {isAdmin && (
          <Card title="Excluir pedidos em massa" className="mt-6">
            <div className="stack">
              <p className="muted text-sm-2">
                Remove permanentemente os pedidos que correspondem ao período e ao tipo escolhidos.
                Pré-visualize antes de confirmar.
              </p>
              <div className="toolbar">
                <Field label="De">
                  {(ctl) => <input {...ctl} type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} className="field" />}
                </Field>
                <Field label="Até">
                  {(ctl) => <input {...ctl} type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="field" />}
                </Field>
                <Field label="Categoria">
                  {(ctl) => (
                    <select {...ctl} value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="field">
                      {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                    </select>
                  )}
                </Field>
                <div className="row">
                  <Button variant="secondary" onClick={previewBulk} disabled={!hasBulkFilter} loading={bulkBusy && bulkCount === null}>
                    Pré-visualizar
                  </Button>
                  {bulkCount !== null && (
                    <Button variant="danger" onClick={runBulkDelete} disabled={bulkCount === 0} loading={bulkBusy && bulkCount !== null}>
                      Excluir {bulkCount}
                    </Button>
                  )}
                </div>
              </div>
              {bulkError && <Notice kind="danger">{bulkError}</Notice>}
              {bulkCount !== null && bulkCount > 0 && (
                <Notice kind="warning">
                  {bulkCount} pedido(s) serão excluídos com os filtros selecionados.
                </Notice>
              )}
              {bulkCount === 0 && (
                <p className="muted text-sm-2">Nenhum pedido corresponde aos filtros selecionados.</p>
              )}
              {!hasBulkFilter && (
                <p className="muted text-sm-2">Informe ao menos um filtro (período ou tipo) para excluir em massa.</p>
              )}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
