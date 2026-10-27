import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card } from '../components/ui';

interface SupplyItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

const categoryLabel: Record<string, string> = {
  PAPEL: 'Papel', TONER: 'Toner', LIMPEZA: 'Limpeza', INFORMATICA: 'Informática', OUTROS: 'Outros',
};

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

  return (
    <>
      <PageHeader title="Novo pedido de suprimento" subtitle="Escolha o item do catálogo e a quantidade." />

      <div className="page-body" style={{ maxWidth: 640 }}>
        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <Card raised>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="field-label">Item</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required className="field">
                {Object.entries(groupedItems).map(([cat, catItems]) => (
                  <optgroup key={cat} label={categoryLabel[cat] ?? cat}>
                    {catItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedItem && (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>Unidade: {selectedItem.unit}</p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="field-label">Quantidade</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} required className="field" />
              </div>
              <div>
                <label className="field-label">Urgência</label>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="field">
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">Observações</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field" style={{ resize: 'vertical' }} placeholder="Informações adicionais (opcional)" />
            </div>

            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button type="submit" disabled={loading || !itemId}>{loading ? 'Enviando...' : 'Enviar pedido'}</Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/suprimentos')}>Cancelar</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
