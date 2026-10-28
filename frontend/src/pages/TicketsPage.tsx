import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Ticket as TicketIcon, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, Notice, Table } from '../components/ui';
import { formatDateTime, formatRelative } from '../lib/dates';

interface Ticket {
  id: string;
  title: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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

const idCurto = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export default function TicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'ADMIN';
  const [busca, setBusca] = useState('');

  // Filtros vivem na URL (?status=&category=) para a página ser linkável.
  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const setFiltro = (chave: 'status' | 'category', valor: string) => {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set(chave, valor);
    else next.delete(chave);
    setSearchParams(next, { replace: true });
  };

  // Exclusão em massa (admin)
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Resultado da última carga, marcado pela chave de filtros que o produziu:
  // enquanto a chave atual for outra, a página está carregando.
  const chave = `${status}|${category}|${reloadKey}`;
  const [dados, setDados] = useState<{ chave: string; tickets: Ticket[]; erro: boolean } | null>(null);
  const loading = dados?.chave !== chave;
  const error = !loading && Boolean(dados?.erro);
  const tickets = dados?.chave === chave && !dados.erro ? dados.tickets : [];

  // Mudar qualquer filtro da exclusão em massa invalida a pré-visualização.
  const mudarBulk = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setBulkCount(null);
  };

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
      const r = await api.get('/tickets/admin/bulk-preview', { params: bulkParams() });
      setBulkCount(r.data.count);
    } catch {
      setBulkError('Não foi possível pré-visualizar a exclusão.');
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (bulkCount === null) return;
    if (!window.confirm(`Excluir permanentemente ${bulkCount} chamado(s)? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      await api.delete('/tickets/admin/bulk', { params: bulkParams() });
      setBulkCount(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      setReloadKey((k) => k + 1);
    } catch {
      setBulkError('Não foi possível excluir os chamados.');
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteOne = async (id: string, title: string) => {
    if (!window.confirm(`Excluir o chamado "${title}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/tickets/${id}`);
      setReloadKey((k) => k + 1);
    } catch {
      window.alert('Não foi possível excluir o chamado.');
    }
  };

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelado = false;
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    api.get('/tickets', { params })
      .then((r) => { if (!cancelado) setDados({ chave, tickets: r.data, erro: false }); })
      .catch(() => { if (!cancelado) setDados({ chave, tickets: [], erro: true }); });
    return () => { cancelado = true; };
  }, [status, category, reloadKey, chave]);

  const abertos = tickets.filter((t) => t.status === 'ABERTO').length;

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = termo
    ? tickets.filter((t) =>
        t.title.toLocaleLowerCase('pt-BR').includes(termo)
        || t.requester.name.toLocaleLowerCase('pt-BR').includes(termo))
    : tickets;
  const temFiltro = Boolean(status || category || termo);

  const cabecalho = (
    <tr>
      <th>Chamado</th>
      <th>Categoria</th>
      <th>Urgência</th>
      <th>Status</th>
      <th>Solicitante</th>
      <th>Atualizado</th>
      {isAdmin && <th><span className="sr-only">Ações</span></th>}
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<TicketIcon size={22} />}
      title={temFiltro ? 'Nenhum chamado com esses filtros' : 'Nenhum chamado ainda'}
      action={<Link className="btn btn-primary" to="/tickets/new">Abrir chamado</Link>}
    >
      {temFiltro
        ? 'Tente limpar a busca ou escolher outro status e categoria.'
        : 'Quando alguém abrir um chamado, ele aparece aqui.'}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Chamados"
        description={loading ? 'Carregando…' : `${tickets.length} chamado${tickets.length === 1 ? '' : 's'} na lista, ${abertos} em aberto`}
      />

      <main className="page-body">
        <div className="toolbar">
          <Field
            label="Buscar nesta lista"
            className="toolbar-grow"
            hint="Filtra por título ou solicitante os chamados já carregados; não consulta o servidor."
          >
            {(ctl) => (
              <div className="search-bar">
                <Search size={16} aria-hidden="true" />
                <input
                  {...ctl}
                  type="search"
                  placeholder="Título ou solicitante"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            )}
          </Field>
          <Field label="Status">
            {(ctl) => (
              <select {...ctl} value={status} onChange={(e) => setFiltro('status', e.target.value)} className="field">
                {statuses.map((s) => <option key={s} value={s}>{statusFilterLabel[s]}</option>)}
              </select>
            )}
          </Field>
          <Field label="Categoria">
            {(ctl) => (
              <select {...ctl} value={category} onChange={(e) => setFiltro('category', e.target.value)} className="field">
                {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
              </select>
            )}
          </Field>
        </div>

        {error ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={reload}>Tentar novamente</Button>}
          >
            Não foi possível carregar os chamados.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={isAdmin ? 7 : 6} head={cabecalho} />
            </div>
            <div className="md:hidden stack" aria-busy="true">
              <div className="skeleton h-[72px]" />
              <div className="skeleton h-[72px]" />
              <div className="skeleton h-[72px]" />
            </div>
          </>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table isEmpty={visiveis.length === 0} empty={vazio} head={cabecalho}>
                {visiveis.map((t) => (
                  <tr key={t.id} className="table-row" onClick={() => navigate(`/tickets/${t.id}`)}>
                    <td>
                      <div className="row">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="font-medium no-underline hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.title}
                        </Link>
                        <code className="ticket-id" title={t.id}>{idCurto(t.id)}</code>
                      </div>
                    </td>
                    <td>{categoryLabel[t.category] ?? t.category}</td>
                    <td><UrgencyBadge urgency={t.urgency} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="muted">{t.requester.name}</td>
                    <td className="muted whitespace-nowrap" title={formatDateTime(t.updatedAt)}>{formatRelative(t.updatedAt)}</td>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Excluir chamado"
                          title="Excluir chamado"
                          icon={<Trash2 size={16} />}
                          onClick={() => deleteOne(t.id, t.title)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {visiveis.length === 0 && <div className="card">{vazio}</div>}
              {visiveis.map((t) => (
                <div key={t.id}>
                  <Link to={`/tickets/${t.id}`} className="ticket-card">
                    <p className="ticket-card-title">{t.title}</p>
                    <div className="ticket-card-meta">
                      <StatusBadge status={t.status} />
                      <UrgencyBadge urgency={t.urgency} />
                      <span className="pill pill-muted">{categoryLabel[t.category] ?? t.category}</span>
                      <code className="ticket-id" title={t.id}>{idCurto(t.id)}</code>
                    </div>
                    <p className="ticket-card-sub">
                      {t.requester.name} · atualizado <span title={formatDateTime(t.updatedAt)}>{formatRelative(t.updatedAt)}</span>
                    </p>
                  </Link>
                  {isAdmin && (
                    <div className="flex justify-end mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => deleteOne(t.id, t.title)}
                      >
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
          <details className="card mt-6">
            <summary className="cursor-pointer font-semibold">Ferramentas de administrador</summary>
            <div className="mt-4 stack">
              <h3>Excluir em massa</h3>
              <p className="muted text-sm-2">
                Remove permanentemente os chamados que correspondem ao período e à categoria escolhidos.
                Pré-visualize antes de confirmar.
              </p>
              <div className="toolbar">
                <Field label="De">
                  {(ctl) => <input {...ctl} type="date" value={bulkFrom} onChange={(e) => mudarBulk(setBulkFrom)(e.target.value)} className="field" />}
                </Field>
                <Field label="Até">
                  {(ctl) => <input {...ctl} type="date" value={bulkTo} onChange={(e) => mudarBulk(setBulkTo)(e.target.value)} className="field" />}
                </Field>
                <Field label="Categoria">
                  {(ctl) => (
                    <select {...ctl} value={bulkCategory} onChange={(e) => mudarBulk(setBulkCategory)(e.target.value)} className="field">
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
                  {bulkCount} chamado(s) serão excluídos com os filtros selecionados. Esta ação não pode ser desfeita.
                </Notice>
              )}
              {bulkCount === 0 && (
                <p className="muted text-sm-2">Nenhum chamado corresponde aos filtros selecionados.</p>
              )}
              {!hasBulkFilter && (
                <p className="muted text-sm-2">Informe ao menos um filtro (período ou categoria) para excluir em massa.</p>
              )}
            </div>
          </details>
        )}
      </main>
    </>
  );
}
