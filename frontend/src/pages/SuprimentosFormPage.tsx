import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
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

  const handleSubmit = async (e: FormEvent) => {
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
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">Novo Pedido de Suprimento</h2>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Item *</label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(groupedItems).map(([cat, catItems]) => (
              <optgroup key={cat} label={cat}>
                {catItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedItem && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Unidade: {selectedItem.unit}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade *</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urgência *</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Informações adicionais (opcional)"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !itemId}
            className="px-6 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Enviando...' : 'Enviar Pedido'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/suprimentos')}
            className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
