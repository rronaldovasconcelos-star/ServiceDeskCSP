import { useEffect, useState } from 'react';
import { CalendarClock, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, Fieldset, Modal, Notice, Table } from '../components/ui';
import { formatDateTime } from '../lib/dates';

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
  return (
    <span className={`pill pill-${statusTom[status] ?? 'muted'}`}>
      <span className="pill-dot" aria-hidden="true" />
      {statusLabel[status] ?? status}
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
  return (
    <Modal
      open
      title={editId ? 'Editar manutenção' : 'Nova manutenção programada'}
      onClose={onClose}
      maxWidth={560}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" form="form-manutencao" loading={saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar manutenção'}
          </Button>
        </>
      )}
    >
      <form id="form-manutencao" onSubmit={onSubmit} className="stack">
        {error && <Notice kind="danger">{error}</Notice>}

        <Fieldset legend="O que será feito">
          <Field label="Nome" required>
            {(ctl) => (
              <input {...ctl} value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Revisão do ar-condicionado" className="field" data-autofocus />
            )}
          </Field>
          <Field label="Descrição" required>
            {(ctl) => (
              <textarea {...ctl} value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} required rows={3} placeholder="O que deve ser feito" className="field" />
            )}
          </Field>
          <Field label="Urgência" required>
            {(ctl) => (
              <select {...ctl} value={form.urgency} onChange={(e) => onChange({ ...form, urgency: e.target.value })} className="field">
                {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </Field>
        </Fieldset>

        <Fieldset legend="Agendamento" hint="O chamado é gerado automaticamente na data; o lembrete avisa o responsável antes.">
          <div className="form-grid-2">
            <Field label="Recorrência" required>
              {(ctl) => (
                <select {...ctl} value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} className="field">
                  {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
                </select>
              )}
            </Field>
            <Field label="Início (1ª ocorrência)" required>
              {(ctl) => (
                <input {...ctl} type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required className="field" />
              )}
            </Field>
            <Field label="Lembrete (dias antes)" hint="0 = sem lembrete antecipado">
              {(ctl) => (
                <input {...ctl} type="number" min={0} max={365} value={form.leadDays} onChange={(e) => onChange({ ...form, leadDays: e.target.value })} className="field" />
              )}
            </Field>
            <Field label="Responsável" required>
              {(ctl) => (
                <select {...ctl} value={form.responsavelId} onChange={(e) => onChange({ ...form, responsavelId: e.target.value })} required className="field">
                  <option value="">Selecione...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </Field>
          </div>
        </Fieldset>
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
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/maintenances')
      .then((r) => { setItems(r.data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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
    <div className="row">
      <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(m)}>Editar</Button>
      {(m.status === 'ACTIVE' || m.status === 'PAUSED') && (
        <Button variant="ghost" size="sm" onClick={() => toggleStatus(m)}>
          {m.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </Button>
      )}
      <Button variant="ghost" size="sm" icon={<Play size={14} />} onClick={() => runNow(m)}>Gerar agora</Button>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Excluir manutenção ${m.name}`}
          title="Excluir manutenção"
          icon={<Trash2 size={16} />}
          onClick={() => remove(m)}
        />
      )}
    </div>
  );

  const ativas = items.filter((m) => m.status === 'ACTIVE').length;

  const cabecalho = (
    <tr>
      <th>Nome</th>
      <th>Recorrência</th>
      <th>Próxima</th>
      <th>Responsável</th>
      <th>Status</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<CalendarClock size={22} />}
      title="Nenhuma manutenção programada"
      action={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nova manutenção</Button>}
    >
      Cadastre uma manutenção e o chamado é gerado sozinho na data combinada.
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Manutenções programadas"
        description={loading ? 'Carregando…' : `${items.length} manutenç${items.length === 1 ? 'ão' : 'ões'} cadastrada${items.length === 1 ? '' : 's'}, ${ativas} ativa${ativas === 1 ? '' : 's'}`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nova manutenção</Button>}
      />

      <main className="page-body stack">
        {showForm && (
          <MaintenanceModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
        )}

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>}
          >
            Não foi possível carregar as manutenções.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={6} head={cabecalho} />
            </div>
            <div className="md:hidden stack" aria-busy="true">
              <div className="skeleton h-[110px]" />
              <div className="skeleton h-[110px]" />
              <div className="skeleton h-[110px]" />
            </div>
          </>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table isEmpty={items.length === 0} empty={vazio} head={cabecalho}>
                {items.map((m) => (
                  <tr key={m.id} className={m.status === 'ACTIVE' ? undefined : 'opacity-60'}>
                    <td className="font-medium">{m.name}</td>
                    <td className="muted">{recurrenceLabel[m.recurrence] ?? m.recurrence}</td>
                    <td className="muted whitespace-nowrap">{formatDateTime(m.nextRunAt)}</td>
                    <td className="muted">{m.responsavel.name}</td>
                    <td><StatusPill status={m.status} /></td>
                    <td>{actions(m)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {items.length === 0 && <div className="card">{vazio}</div>}
              {items.map((m) => (
                <div key={m.id} className={`ticket-card ${m.status === 'ACTIVE' ? '' : 'opacity-70'}`.trim()}>
                  <p className="ticket-card-title">{m.name}</p>
                  <div className="ticket-card-meta">
                    <StatusPill status={m.status} />
                    <span className="pill pill-muted">{recurrenceLabel[m.recurrence] ?? m.recurrence}</span>
                    <span className="pill pill-muted">{formatDateTime(m.nextRunAt)}</span>
                  </div>
                  <p className="ticket-card-sub mb-2">Responsável: {m.responsavel.name}</p>
                  {actions(m)}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
