import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, Modal, Table } from '../components/ui';

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

const linkBtn = (cor: string): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', color: cor, fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit',
});

export default function SuprimentosCatalogoPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = () => {
    setLoading(true);
    api.get('/suprimentos/items').then((r) => setItems(r.data)).finally(() => setLoading(false));
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
    try {
      const r = await api.get('/suprimentos/items/admin/bulk-preview', { params: bulkParams() });
      setBulkPreview(r.data);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (!bulkPreview) return;
    if (!window.confirm(`Excluir permanentemente ${bulkPreview.count} item(ns) do catálogo? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    try {
      await api.delete('/suprimentos/items/admin/bulk', { params: bulkParams() });
      setBulkPreview(null);
      setBulkFrom('');
      setBulkTo('');
      setBulkCategory('');
      load();
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
    <span className={`pill ${isActive ? 'pill-teal' : 'pill-muted'}`}>{isActive ? 'Ativo' : 'Inativo'}</span>
  );

  const acoes = (item: SupplyItem) => (
    <div style={{ display: 'flex', gap: 14 }}>
      <button onClick={() => openEdit(item)} style={linkBtn('var(--electric)')}>Editar</button>
      <button onClick={() => toggleActive(item.id)} style={linkBtn('var(--text-secondary)')}>{item.isActive ? 'Desativar' : 'Ativar'}</button>
      {isAdmin && <button onClick={() => deleteItem(item.id, item.name)} style={linkBtn('var(--coral)')}>Excluir</button>}
    </div>
  );

  const ativos = items.filter((i) => i.isActive).length;

  return (
    <>
      <PageHeader
        title="Catálogo de suprimentos"
        subtitle={loading ? 'Carregando…' : `${items.length} ${items.length === 1 ? 'item' : 'itens'}, ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}`}
        actions={<Button variant="secondary" icon={<Plus size={16} />} onClick={openNew}>Novo item</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Modal
          open={showForm}
          title={editId ? 'Editar item' : 'Novo item'}
          onClose={closeModal}
          footer={(
            <>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button type="submit" form="form-item" disabled={saving}>{saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar item'}</Button>
            </>
          )}
        >
          <form id="form-item" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <div role="alert" style={{ padding: '10px 12px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Nome</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Papel A4" className="field" />
              </div>
              <div>
                <label className="field-label">Unidade</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="resma, unidade..." className="field" />
              </div>
              <div>
                <label className="field-label">Categoria</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="field">
                  {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Descrição</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className="field" />
              </div>
            </div>
          </form>
        </Modal>

        {isAdmin && (
          <Card title="Excluir itens em massa" style={{ padding: '16px 20px' }}>
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
                <option value="">Todas as categorias</option>
                {categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
              </select>
              <Button variant="ghost" onClick={previewBulk} disabled={!hasBulkFilter || bulkBusy}>Pré-visualizar</Button>
              {bulkPreview && (
                <Button variant="danger" onClick={runBulkDelete} disabled={bulkPreview.count === 0 || bulkBusy}>Excluir {bulkPreview.count}</Button>
              )}
            </div>
            {bulkPreview && (
              <p style={{ fontSize: 12, color: bulkPreview.count > 0 ? 'var(--coral)' : 'var(--text-secondary)', margin: '10px 0 0' }}>
                {bulkPreview.count > 0 ? `${bulkPreview.count} item(ns) serão excluídos.` : 'Nenhum item elegível para exclusão.'}
                {bulkPreview.blocked > 0 && ` ${bulkPreview.blocked} item(ns) com pedidos vinculados serão ignorados.`}
              </p>
            )}
            {!hasBulkFilter && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
                Informe ao menos um filtro (período ou tipo). Itens com pedidos vinculados não são excluídos.
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
                isEmpty={items.length === 0}
                empty="Nenhum item no catálogo. Crie o primeiro em Novo item."
                head={(
                  <tr>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Unidade</th>
                    <th>Descrição</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                )}
              >
                {items.map((item) => (
                  <tr key={item.id} className="table-row" style={{ opacity: item.isActive ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{categoryLabel[item.category] ?? item.category}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{item.unit}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.description ?? '—'}</td>
                    <td>{ativoPill(item.isActive)}</td>
                    <td>{acoes(item)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {items.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum item no catálogo.</p>}
              {items.map((item) => (
                <Card key={item.id} style={{ padding: 14, opacity: item.isActive ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                    {ativoPill(item.isActive)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span className="pill pill-muted">{categoryLabel[item.category] ?? item.category}</span>
                    <span className="pill pill-muted">{item.unit}</span>
                  </div>
                  {item.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>{item.description}</p>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{acoes(item)}</div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
