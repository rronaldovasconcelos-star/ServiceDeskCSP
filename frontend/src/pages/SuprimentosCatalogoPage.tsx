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

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: '13px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '5px',
};

function ItemModal({
  editId, form, saving, error, onChange, onSubmit, onClose,
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />
      <div style={{ position: 'relative', width: '100%', maxWidth: '440px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {editId ? 'Editar Item' : 'Novo Item'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', borderRadius: 'var(--radius-sm)', display: 'flex' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Papel A4" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Unidade *</label>
              <input value={form.unit} onChange={(e) => onChange({ ...form, unit: e.target.value })} required placeholder="resma, unidade..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Categoria *</label>
              <select value={form.category} onChange={(e) => onChange({ ...form, category: e.target.value })} style={inputStyle}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Descrição</label>
              <input value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="Opcional" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 1, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar item'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

  const activeBadge = (isActive: boolean) => ({
    display: 'inline-block' as const,
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 500,
    background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
    color: isActive ? '#16a34a' : '#64748b',
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Catálogo de Suprimentos</h2>
        <button
          onClick={openNew}
          style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
        >
          + Novo Item
        </button>
      </div>

      {showForm && (
        <ItemModal editId={editId} form={form} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={closeModal} />
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum item no catálogo.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Categoria</th>
                  <th style={thStyle}>Unidade</th>
                  <th style={thStyle}>Descrição</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: item.isActive ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{item.category}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.description ?? '—'}</td>
                    <td style={{ padding: '10px 16px' }}><span style={activeBadge(item.isActive)}>{item.isActive ? 'Ativo' : 'Inativo'}</span></td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', padding: 0, fontWeight: 500 }}>
                          Editar
                        </button>
                        <button onClick={() => toggleActive(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', padding: 0 }}>
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
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', opacity: item.isActive ? 1 : 0.6 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{item.name}</span>
                  <span style={activeBadge(item.isActive)}>{item.isActive ? 'Ativo' : 'Inativo'}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{item.category}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{item.unit}</span>
                </div>
                {item.description && (
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>{item.description}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
                  <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', padding: 0, fontWeight: 500 }}>
                    Editar
                  </button>
                  <button onClick={() => toggleActive(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', padding: 0 }}>
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
