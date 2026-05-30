import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface SupplyItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

export default function SuprimentosFormPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState('MEDIA');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/suprimentos/items').then((r) => {
      setItems(r.data);
      if (r.data.length > 0) setItemId(r.data[0].id);
    });
  }, []);

  const selectedItem = items.find((i) => i.id === itemId);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/suprimentos/requests', { itemId, quantity, urgency, notes: notes || undefined });
      navigate(`/suprimentos/${res.data.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao abrir pedido.');
    } finally {
      setLoading(false);
    }
  };

  const groupedItems = items.reduce<Record<string, SupplyItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  };

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

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px', textAlign: 'center' }}>
          Novo Pedido de Suprimento
        </h2>

        {error && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label style={labelStyle}>Item *</label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} required style={inputStyle}>
              {Object.entries(groupedItems).map(([cat, catItems]) => (
                <optgroup key={cat} label={cat}>
                  {catItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedItem && (
              <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>Unidade: {selectedItem.unit}</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Quantidade *</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Urgência *</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={inputStyle}>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'none' }}
              placeholder="Informações adicionais (opcional)"
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={loading || !itemId}
              style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: loading || !itemId ? 'not-allowed' : 'pointer', opacity: loading || !itemId ? 0.6 : 1, transition: 'filter 0.15s' }}
            >
              {loading ? 'Enviando...' : 'Enviar Pedido'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/suprimentos')}
              style={{ padding: '8px 20px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
