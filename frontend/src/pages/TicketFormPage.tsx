import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

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
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <h2
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          Novo Chamado
        </h2>

        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-sm)',
              color: '#ef4444',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div>
            <label style={labelStyle}>Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={inputStyle}
              placeholder="Descreva brevemente o problema"
            />
          </div>

          <div>
            <label style={labelStyle}>Descrição *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              style={{ ...inputStyle, resize: 'none' }}
              placeholder="Forneça mais detalhes sobre o problema"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Categoria *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={inputStyle}
              >
                <option value="TI">TI</option>
                <option value="MANUTENCAO">Manutenção</option>
                <option value="PEDAGOGICO">Pedagógico</option>
                <option value="ADMINISTRATIVO">Administrativo</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Urgência *</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                style={inputStyle}
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'filter 0.15s',
              }}
            >
              {loading ? 'Abrindo...' : 'Abrir Chamado'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/tickets')}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
