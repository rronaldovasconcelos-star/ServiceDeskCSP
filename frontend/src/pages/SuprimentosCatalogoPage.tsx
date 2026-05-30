import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';

interface SupplyItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  description?: string;
  isActive: boolean;
}

const categories = ['PAPEL', 'TONER', 'LIMPEZA', 'INFORMATICA', 'OUTROS'];

const emptyForm = { name: '', unit: '', category: 'PAPEL', description: '' };

const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

function ItemModal({
  editId,
  form,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  editId: string | null;
  form: typeof emptyForm;
  saving: boolean;
  error: string;
  onChange: (f: typeof emptyForm) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {editId ? 'Editar Item' : 'Novo Item'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-3">
          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                required
                placeholder="Ex: Papel A4"
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Unidade *</label>
              <input
                value={form.unit}
                onChange={(e) => onChange({ ...form, unit: e.target.value })}
                required
                placeholder="resma, unidade, caixa..."
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Categoria *</label>
              <select
                value={form.category}
                onChange={(e) => onChange({ ...form, category: e.target.value })}
                className={inputCls}
              >
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Descrição</label>
              <input
                value={form.description}
                onChange={(e) => onChange({ ...form, description: e.target.value })}
                placeholder="Opcional"
                className={inputCls}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar item'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuprimentosCatalogoPage() {
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/suprimentos/items').then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Catálogo de Suprimentos</h2>
        <button onClick={openNew} className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800">
          + Novo Item
        </button>
      </div>

      {showForm && (
        <ItemModal
          editId={editId}
          form={form}
          saving={saving}
          error={error}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={closeModal}
        />
      )}

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">Nenhum item no catálogo.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Unidade</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 ${!item.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.category}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.unit}</td>
                    <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">{item.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${item.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {item.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          Editar
                        </button>
                        <button onClick={() => toggleActive(item.id)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
                          {item.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 ${!item.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{item.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${item.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {item.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{item.category}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{item.unit}</span>
                </div>
                {item.description && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">{item.description}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={() => openEdit(item)} className="text-blue-600 dark:text-blue-400 text-xs font-medium">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(item.id)} className="text-slate-500 dark:text-slate-400 text-xs">
                    {item.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
