import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, Modal, Table } from '../components/ui';

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
/** Tom da pílula de status (classes `.pill-*` do index.css). */
const statusTom: Record<string, string> = {
  ACTIVE: 'teal', PAUSED: 'amber', DONE: 'muted', CANCELLED: 'coral',
};

const emptyForm = {
  name: '', description: '', urgency: 'MEDIA', recurrence: 'NONE',
  nextRunAt: '', leadDays: '0', responsavelId: '',
};

/** ISO (UTC) → valor para <input type="datetime-local"> em horário local. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${statusTom[status] ?? 'muted'}`}>{statusLabel[status] ?? status}</span>;
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit',
};

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
  return (
    <Modal
      open
      title={editId ? 'Editar manutenção' : 'Nova manutenção programada'}
      onClose={onClose}
      maxWidth={520}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-manutencao" disabled={saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar manutenção'}
          </Button>
        </>
      )}
    >
      <form id="form-manutencao" onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div className="pill pill-coral" style={{ whiteSpace: 'normal', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius-tile)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="field-label">Nome *</label>
          <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Revisão do ar-condicionado" className="field" />
        </div>
        <div>
          <label className="field-label">Descrição *</label>
          <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} required rows={3} placeholder="O que deve ser feito" className="field" style={{ resize: 'none' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Urgência *</label>
            <select value={form.urgency} onChange={(e) => onChange({ ...form, urgency: e.target.value })} className="field">
              {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Recorrência *</label>
            <select value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} className="field">
              {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Início (1ª ocorrência) *</label>
            <input type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required className="field" />
          </div>
          <div>
            <label className="field-label">Lembrete (dias antes)</label>
            <input type="number" min={0} max={365} value={form.leadDays} onChange={(e) => onChange({ ...form, leadDays: e.target.value })} className="field" />
          </div>
        </div>

        <div>
          <label className="field-label">Responsável *</label>
          <select value={form.responsavelId} onChange={(e) => onChange({ ...form, responsavelId: e.target.value })} required className="field">
            <option value="">Selecione...</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
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
    api.get('/users/directory').then((r) => setUsers(r.data)).catch(() => {});
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <button onClick={() => openEdit(m)} style={{ ...linkBtn, color: 'var(--electric)' }}>Editar</button>
      {(m.status === 'ACTIVE' || m.status === 'PAUSED') && (
        <button onClick={() => toggleStatus(m)} style={{ ...linkBtn, color: 'var(--text-secondary)', fontWeight: 400 }}>
          {m.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </button>
      )}
      <button onClick={() => runNow(m)} style={{ ...linkBtn, color: 'var(--teal)' }}>Gerar agora</button>
      {isAdmin && (
        <button onClick={() => remove(m)} style={{ ...linkBtn, color: 'var(--coral)' }}>Excluir</button>
      )}
    </div>
  );

  const ativas = items.filter((m) => m.status === 'ACTIVE').length;
  const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <PageHeader
        title="Manutenções programadas"
        subtitle={loading ? 'Carregando…' : `${items.length} manutenç${items.length === 1 ? 'ão' : 'ões'} cadastrada${items.length === 1 ? '' : 's'}, ${ativas} ativa${ativas === 1 ? '' : 's'}`}
        actions={<Button variant="secondary" icon={<Plus size={16} />} onClick={openNew}>Nova manutenção</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {showForm && (
          <MaintenanceModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table
                isEmpty={items.length === 0}
                empty="Nenhuma manutenção programada."
                head={(
                  <tr>
                    <th>Nome</th>
                    <th>Recorrência</th>
                    <th>Próxima</th>
                    <th>Responsável</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                )}
              >
                {items.map((m) => (
                  <tr key={m.id} className="table-row" style={{ opacity: m.status === 'ACTIVE' ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{recurrenceLabel[m.recurrence] ?? m.recurrence}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtData(m.nextRunAt)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{m.responsavel.name}</td>
                    <td><StatusPill status={m.status} /></td>
                    <td>{actions(m)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {items.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhuma manutenção programada.</p>}
              {items.map((m) => (
                <Card key={m.id} style={{ padding: 14, opacity: m.status === 'ACTIVE' ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{m.name}</span>
                    <StatusPill status={m.status} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span className="pill pill-muted">{recurrenceLabel[m.recurrence] ?? m.recurrence}</span>
                    <span className="pill pill-muted">{fmtData(m.nextRunAt)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px' }}>Responsável: {m.responsavel.name}</p>
                  {actions(m)}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
