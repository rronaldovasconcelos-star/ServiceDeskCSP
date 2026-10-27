import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card } from '../components/ui';

export default function TicketFormPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TI');
  const [urgency, setUrgency] = useState('BAIXA');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/tickets', { title, description, category, urgency });
      navigate(`/tickets/${res.data.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao abrir chamado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Novo chamado" subtitle="Descreva o problema e a equipe responsável recebe na hora." />

      <div className="page-body" style={{ maxWidth: 640 }}>
        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <Card raised>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="field-label">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="field" placeholder="Descreva brevemente o problema" />
            </div>

            <div>
              <label className="field-label">Descrição</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} className="field" style={{ resize: 'vertical' }} placeholder="Forneça mais detalhes sobre o problema" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="field-label">Categoria</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="field">
                  <option value="TI">TI</option>
                  <option value="MANUTENCAO">Manutenção</option>
                  <option value="PEDAGOGICO">Pedagógico</option>
                  <option value="ADMINISTRATIVO">Administrativo</option>
                  <option value="OUTROS">Outros</option>
                </select>
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

            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button type="submit" disabled={loading}>{loading ? 'Abrindo...' : 'Abrir chamado'}</Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/tickets')}>Cancelar</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
