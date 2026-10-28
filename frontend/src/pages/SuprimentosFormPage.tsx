import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, Field, Notice } from '../components/ui';

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
  const [itemsError, setItemsError] = useState(false);
  const [itemsKey, setItemsKey] = useState(0);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState('MEDIA');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/suprimentos/items')
      .then((r) => {
        setItems(r.data);
        setItemsError(false);
        if (r.data.length > 0) setItemId(r.data[0].id);
      })
      .catch(() => setItemsError(true));
  }, [itemsKey]);

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
      <PageHeader
        title="Novo pedido de suprimento"
        description="Escolha o item do catálogo e a quantidade."
        backTo="/suprimentos"
        backLabel="Pedidos de suprimentos"
      />

      <main className="page-body max-w-[680px]">
        {error && (
          <Notice kind="danger" className="mb-4" onClose={() => setError('')}>{error}</Notice>
        )}
        {itemsError && (
          <Notice
            kind="danger"
            className="mb-4"
            actions={<Button size="sm" variant="secondary" onClick={() => setItemsKey((k) => k + 1)}>Tentar novamente</Button>}
          >
            Não foi possível carregar o catálogo de itens.
          </Notice>
        )}

        <Card raised>
          <form onSubmit={handleSubmit} className="stack">
            <Field label="Item" required hint={selectedItem ? `Unidade: ${selectedItem.unit}` : undefined}>
              {(ctl) => (
                <select {...ctl} value={itemId} onChange={(e) => setItemId(e.target.value)} required className="field">
                  {Object.entries(groupedItems).map(([cat, catItems]) => (
                    <optgroup key={cat} label={categoryLabel[cat] ?? cat}>
                      {catItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>

            <div className="form-grid-2">
              <Field label="Quantidade" required>
                {(ctl) => (
                  <input {...ctl} type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} required className="field" />
                )}
              </Field>
              <Field label="Urgência">
                {(ctl) => (
                  <select {...ctl} value={urgency} onChange={(e) => setUrgency(e.target.value)} className="field">
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                )}
              </Field>
            </div>

            <Field label="Observações" hint="Informações adicionais (opcional)">
              {(ctl) => (
                <textarea {...ctl} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field" placeholder="Informações adicionais (opcional)" />
              )}
            </Field>

            <div className="form-actions">
              <Button type="submit" variant="primary" disabled={!itemId} loading={loading}>
                {loading ? 'Enviando...' : 'Enviar pedido'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/suprimentos')}>Cancelar</Button>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
