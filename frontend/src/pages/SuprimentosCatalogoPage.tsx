import { useEffect, useState } from 'react';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Modal, Notice, Table } from '../components/ui';

interface SupplyItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  description?: string;
  isActive: boolean;
}

const categories = ['PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS'];
const categoryLabel: Record<string, string> = {
  PAPEL: 'Papel', TONER: 'Toner', LIMPEZA: 'Limpeza', INFORMATICA: 'Informática', OUTROS: 'Outros',
};
const emptyForm = { name: '', unit: '', category: 'PAPEL', description: '' };

export default function SuprimentosCatalogoPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Exclusão em massa (admin)
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPreview, setBulkPreview] = useState<{ count: number; blocked: number } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/suprimentos/items')
      .then((r) => { setItems(r.data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const bulkParams = () => {
    const params: Record<string, string> = {};
    if (bulkFrom) params.from = bulkFrom;
    if (bulkTo) params.to = bulkTo;
    if (bulkCategory) params.category = bulkCategory;
    return params;
  };
  const hasBulkFilter = Boolean(bulkFrom || bulkTo || bulkCategory);

  useEffect(() => { setBulkPreview(null); }, [bulkFrom, bulkTo, bulkCategory]);

  const previewBulk = async () => {
    setBulkBusy(true);
    setBulkError('');
    try {
      const r = await api.get('/suprimentos/items/admin/bulk-preview', { params: bulkParams() });
      setBulkPreview(r.data);
    } catch {
      setBulkError('Não foi possível pré-visualizar a exclusão.');
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (!bulkPreview) return;
    if (!window.confirm(`Excluir permanentemente ${bulkPreview.count} item(ns) do catálogo? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      await api.delete('/suprimentos/items/admin/bulk', { params: bulkParams() });
      setBulkPreview(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      load();
    } catch {
      setBulkError('Não foi possível excluir os itens.');
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o item "${name}" do catálogo? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/suprimentos/items/${id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Erro ao excluir item.');
    }
  };

  const openNew = () => { setEditId(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (item: SupplyItem) => {
    setEditId(item.id);
    setForm({ name: item.name, unit: item.unit, category: item.category, description: item.description ?? '' });
    setError('');
    setShowForm(true);
  };
  const closeModal = () => setShowForm(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, description: form.description || undefined };
      if (editId) {
        await api.put(`/suprimentos/items/${editId}`, payload);
      } else {
        await api.post('/suprimentos/items', payload);
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string) => {
    await api.patch(`/suprimentos/items/${id}/toggle-active`);
    load();
  };

  const ativoPill = (isActive: boolean) => (
    <span className={`pill ${isActive ? 'pill-teal' : 'pill-muted'}`}>
      <span className="pill-dot" aria-hidden="true" />
      {isActive ? 'Ativo' : 'Inativo'}
    </span>
  );

  const acoes = (item: SupplyItem) => (
    <div className="row justify-end md:justify-start">
      <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(item)}>Editar</Button>
      <Button variant="ghost" size="sm" onClick={() => toggleActive(item.id)}>{item.isActive ? 'Desativar' : 'Ativar'}</Button>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Excluir ${item.name}`}
          title="Excluir item"
          icon={<Trash2 size={16} />}
          onClick={() => deleteItem(item.id, item.name)}
        />
      )}
    </div>
  );

  const ativos = items.filter((i) => i.isActive).length;

  const cabecalho = (
    <tr>
      <th>Nome</th>
      <th>Categoria</th>
      <th>Unidade</th>
      <th>Descrição</th>
      <th>Status</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<BookOpen size={22} />}
      title="Nenhum item no catálogo"
      action={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Novo item</Button>}
    >
      Crie o primeiro em Novo item. Os itens do catálogo são o que as pessoas podem pedir.
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Catálogo de suprimentos"
        description={loading ? 'Carregando…' : `${items.length} ${items.length === 1 ? 'item' : 'itens'}, ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}`}
        backTo="/suprimentos"
        backLabel="Pedidos de suprimentos"
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Novo item</Button>}
      />

      <main className="page-body stack">
        <Modal
          open={showForm}
          title={editId ? 'Editar item' : 'Novo item'}
          onClose={closeModal}
          footer={(
            <>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button type="submit" variant="primary" form="form-item" loading={saving}>
                {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar item'}
              </Button>
            </>
          )}
        >
          <form id="form-item" onSubmit={handleSubmit} className="stack">
            {error && <Notice kind="danger">{error}</Notice>}
            <div className="form-grid-2">
              <Field label="Nome" required>
                {(ctl) => (
                  <input {...ctl} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Papel A4" className="field" data-autofocus />
                )}
              </Field>
              <Field label="Unidade" required hint="Como o item é contado: resma, unidade, caixa…">
                {(ctl) => (
                  <input {...ctl} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="resma, unidade..." className="field" />
                )}
              </Field>
              <Field label="Categoria">
                {(ctl) => (
                  <select {...ctl} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="field">
                    {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Descrição" hint="Opcional">
                {(ctl) => (
                  <input {...ctl} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className="field" />
                )}
              </Field>
            </div>
          </form>
        </Modal>

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>}
          >
            Não foi possível carregar o catálogo.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={6} head={cabecalho} />
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
              <Table isEmpty={items.length === 0} empty={vazio} head={cabecalho}>
                {items.map((item) => (
                  <tr key={item.id} className={item.isActive ? undefined : 'opacity-60'}>
                    <td className="font-medium">{item.name}</td>
                    <td className="muted">{categoryLabel[item.category] ?? item.category}</td>
                    <td className="muted">{item.unit}</td>
                    <td className="muted text-xs">{item.description ?? '—'}</td>
                    <td>{ativoPill(item.isActive)}</td>
                    <td>{acoes(item)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {items.length === 0 && <div className="card">{vazio}</div>}
              {items.map((item) => (
                <div key={item.id} className={`ticket-card ${item.isActive ? '' : 'opacity-60'}`.trim()}>
                  <p className="ticket-card-title">{item.name}</p>
                  <div className="ticket-card-meta">
                    {ativoPill(item.isActive)}
                    <span className="pill pill-muted">{categoryLabel[item.category] ?? item.category}</span>
                    <span className="pill pill-muted">{item.unit}</span>
                  </div>
                  {item.description && <p className="ticket-card-sub mb-2">{item.description}</p>}
                  {acoes(item)}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ferramentas de administrador — exclusão em massa, restrita ao ADMIN */}
        {isAdmin && (
          <Card title="Excluir itens em massa" className="mt-6">
            <div className="stack">
              <p className="muted text-sm-2">
                Remove permanentemente os itens que correspondem ao período e ao tipo escolhidos.
                Itens com pedidos vinculados não são excluídos. Pré-visualize antes de confirmar.
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
                      <option value="">Todas as categorias</option>
                      {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                    </select>
                  )}
                </Field>
                <div className="row">
                  <Button variant="secondary" onClick={previewBulk} disabled={!hasBulkFilter} loading={bulkBusy && bulkPreview === null}>
                    Pré-visualizar
                  </Button>
                  {bulkPreview && (
                    <Button variant="danger" onClick={runBulkDelete} disabled={bulkPreview.count === 0} loading={bulkBusy && bulkPreview !== null}>
                      Excluir {bulkPreview.count}
                    </Button>
                  )}
                </div>
              </div>
              {bulkError && <Notice kind="danger">{bulkError}</Notice>}
              {bulkPreview && bulkPreview.count > 0 && (
                <Notice kind="warning">
                  {bulkPreview.count} item(ns) serão excluídos.
                  {bulkPreview.blocked > 0 && ` ${bulkPreview.blocked} item(ns) com pedidos vinculados serão ignorados.`}
                </Notice>
              )}
              {bulkPreview && bulkPreview.count === 0 && (
                <p className="muted text-sm-2">
                  Nenhum item elegível para exclusão.
                  {bulkPreview.blocked > 0 && ` ${bulkPreview.blocked} item(ns) com pedidos vinculados serão ignorados.`}
                </p>
              )}
              {!hasBulkFilter && (
                <p className="muted text-sm-2">Informe ao menos um filtro (período ou tipo). Itens com pedidos vinculados não são excluídos.</p>
              )}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
