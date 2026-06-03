import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface Maintenance {
  id: string;
  name: string;
  description: string;
  urgency: string;
  recurrence: string;
  nextRunAt: string;
  leadDays: number;
  status: string;
  lastTicketId: string | null;
  responsavel: { id: string; name: string };
}

interface UserOption { id: string; name: string; }

const URGENCIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
const recurrenceLabel: Record<string, string> = {
  NONE: 'Pontual', DAILY: 'Diária', WEEKLY: 'Semanal', MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual',
};
const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativa', PAUSED: 'Pausada', DONE: 'Concluída', CANCELLED: 'Cancelada',
};
const statusColor: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' },
  PAUSED: { bg: 'rgba(234,179,8,0.14)', color: '#ca8a04' },
  DONE: { bg: 'rgba(100,116,139,0.14)', color: '#64748b' },
  CANCELLED: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
};

const emptyForm = {
  name: '', description: '', urgency: 'MEDIA', recurrence: 'NONE',
  nextRunAt: '', leadDays: '0', responsavelId: '',
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '8px 12px', fontSize: '13px', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '5px',
};
const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};

/** ISO (UTC) → valor para <input type="datetime-local"> em horário local. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function chip(text: string, c: { bg: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: c.bg, color: c.color }}>
      {text}
    </span>
  );
}

function MaintenanceModal({
  editId, form, users, saving, error, onChange, onSubmit, onClose,
}: {
  editId: string | null;
  form: typeof emptyForm;
  users: UserOption[];
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
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />
      <div style={{ position: 'relative', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {editId ? 'Editar Manutenção' : 'Nova Manutenção Programada'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Nome *</label>
            <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Revisão do ar-condicionado" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Descrição *</label>
            <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} required rows={3} placeholder="O que deve ser feito" style={{ ...inputStyle, resize: 'none' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Urgência *</label>
              <select value={form.urgency} onChange={(e) => onChange({ ...form, urgency: e.target.value })} style={inputStyle}>
                {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Recorrência *</label>
              <select value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} style={inputStyle}>
                {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Início (1ª ocorrência) *</label>
              <input type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Lembrete (dias antes)</label>
              <input type="number" min={0} max={365} value={form.leadDays} onChange={(e) => onChange({ ...form, leadDays: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Responsável *</label>
            <select value={form.responsavelId} onChange={(e) => onChange({ ...form, responsavelId: e.target.value })} required style={inputStyle}>
              <option value="">Selecione...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar manutenção'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManutencoesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState<Maintenance[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/maintenances').then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/users').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const openNew = () => { setEditId(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (m: Maintenance) => {
    setEditId(m.id);
    setForm({
      name: m.name, description: m.description, urgency: m.urgency, recurrence: m.recurrence,
      nextRunAt: isoToLocalInput(m.nextRunAt), leadDays: String(m.leadDays), responsavelId: m.responsavel.id,
    });
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        urgency: form.urgency,
        recurrence: form.recurrence,
        // datetime-local (horário local) → ISO/UTC absoluto
        nextRunAt: new Date(form.nextRunAt).toISOString(),
        leadDays: Number(form.leadDays) || 0,
        responsavelId: form.responsavelId,
      };
      if (editId) {
        await api.put(`/maintenances/${editId}`, payload);
      } else {
        await api.post('/maintenances', payload);
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao salvar manutenção.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (m: Maintenance) => {
    const next = m.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    await api.patch(`/maintenances/${m.id}/status`, { status: next });
    load();
  };

  const runNow = async (m: Maintenance) => {
    if (!window.confirm(`Gerar o chamado da manutenção "${m.name}" agora?`)) return;
    await api.post(`/maintenances/${m.id}/run-now`);
    load();
  };

  const remove = async (m: Maintenance) => {
    if (!window.confirm(`Excluir a manutenção "${m.name}"? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/maintenances/${m.id}`);
    load();
  };

  const actions = (m: Maintenance) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
      <button onClick={() => openEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', padding: 0, fontWeight: 500 }}>Editar</button>
      {(m.status === 'ACTIVE' || m.status === 'PAUSED') && (
        <button onClick={() => toggleStatus(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', padding: 0 }}>
          {m.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </button>
      )}
      <button onClick={() => runNow(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d9488', fontSize: '12px', padding: 0, fontWeight: 500 }}>Gerar agora</button>
      {isAdmin && (
        <button onClick={() => remove(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0, fontWeight: 500 }}>Excluir</button>
      )}
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Manutenções Programadas</h2>
        <button onClick={openNew} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
          + Nova Manutenção
        </button>
      </div>

      {showForm && (
        <MaintenanceModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhuma manutenção programada.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Recorrência</th>
                  <th style={thStyle}>Próxima</th>
                  <th style={thStyle}>Responsável</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m, i) => (
                  <tr key={m.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: m.status === 'ACTIVE' ? 1 : 0.6 }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{recurrenceLabel[m.recurrence] ?? m.recurrence}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{new Date(m.nextRunAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{m.responsavel.name}</td>
                    <td style={{ padding: '10px 16px' }}>{chip(statusLabel[m.status] ?? m.status, statusColor[m.status] ?? statusColor.DONE)}</td>
                    <td style={{ padding: '10px 16px' }}>{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {items.map((m) => (
              <div key={m.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', opacity: m.status === 'ACTIVE' ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{m.name}</span>
                  {chip(statusLabel[m.status] ?? m.status, statusColor[m.status] ?? statusColor.DONE)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{recurrenceLabel[m.recurrence] ?? m.recurrence}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{new Date(m.nextRunAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>Responsável: {m.responsavel.name}</p>
                {actions(m)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
