import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  ANOS_LETIVOS, SEGMENTOS, SERIES_BY_SEGMENTO, ETAPAS, DISCIPLINAS, TIPOS_MATERIAL,
  disciplinasFor, tiposFor, labelFor,
} from '../lib/taxonomy';
import PageHeader from '../components/PageHeader';
import { Button, Card, Modal, Table } from '../components/ui';

interface Reminder {
  id: string;
  name: string;
  messageExtra: string | null;
  recurrence: string;
  nextRunAt: string;
  status: string;
  anoLetivo: string | null;
  segmento: string | null;
  serie: string | null;
  etapa: string | null;
  disciplina: string | null;
  tipoMaterial: string | null;
  audience: string;
  recipientIds: string | null;
}

interface UserOption { id: string; name: string; }

const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
const recurrenceLabel: Record<string, string> = {
  NONE: 'Pontual', DAILY: 'Diária', WEEKLY: 'Semanal', MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual',
};
const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', DONE: 'Concluído', CANCELLED: 'Cancelado',
};
/** Tom da pílula de status (classes `.pill-*` do index.css). */
const statusTom: Record<string, string> = {
  ACTIVE: 'teal', PAUSED: 'amber', DONE: 'muted', CANCELLED: 'coral',
};

interface FormState {
  name: string;
  recurrence: string;
  nextRunAt: string;
  anoLetivo: string;
  segmento: string;
  serie: string;
  etapa: string;
  disciplina: string;
  tipoMaterial: string;
  audience: 'ALL' | 'SELECTED';
  recipientIds: string[];
  messageExtra: string;
}

const emptyForm: FormState = {
  name: '', recurrence: 'MONTHLY', nextRunAt: '',
  anoLetivo: '', segmento: '', serie: '', etapa: '', disciplina: '', tipoMaterial: '',
  audience: 'ALL', recipientIds: [], messageExtra: '',
};

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit',
};

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${statusTom[status] ?? 'muted'}`}>{statusLabel[status] ?? status}</span>;
}

// Espelha buildReminderMessage do backend, para a prévia.
function previewMessage(f: FormState): string {
  const partes: string[] = [];
  if (f.tipoMaterial) partes.push(labelFor('tipoMaterial', f.tipoMaterial));
  if (f.disciplina) partes.push(`de ${labelFor('disciplina', f.disciplina)}`);
  const ctx: string[] = [];
  if (f.segmento) ctx.push(labelFor('segmento', f.segmento));
  if (f.serie) ctx.push(labelFor('serie', f.serie));
  if (f.etapa) ctx.push(labelFor('etapa', f.etapa));
  if (f.anoLetivo) ctx.push(f.anoLetivo);
  let alvo = partes.join(' ');
  if (ctx.length) alvo += ` — ${ctx.join(' / ')}`;
  const linhas = [
    '📚 Lembrete de material',
    alvo
      ? `Olá [professor]! Consta que você ainda não enviou: ${alvo}.`
      : `Olá [professor]! Lembrete para enviar seu material no portal.`,
  ];
  if (f.messageExtra.trim()) linhas.push(f.messageExtra.trim());
  linhas.push('Envie pelo portal: Meus Arquivos.');
  return linhas.join('\n');
}

function classTags(r: Reminder) {
  const axes: [Parameters<typeof labelFor>[0] | 'anoLetivo', string | null][] = [
    ['segmento', r.segmento], ['serie', r.serie], ['etapa', r.etapa],
    ['disciplina', r.disciplina], ['tipoMaterial', r.tipoMaterial],
  ];
  const tags = axes.filter(([, v]) => v).map(([axis, v]) => labelFor(axis as Parameters<typeof labelFor>[0], v));
  if (r.anoLetivo) tags.unshift(r.anoLetivo);
  if (tags.length === 0) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tags.map((t, i) => (
        <span key={i} className="pill pill-muted">{t}</span>
      ))}
    </div>
  );
}

function ReminderModal({
  editId, form, users, saving, error, onChange, onSubmit, onClose,
}: {
  editId: string | null;
  form: FormState;
  users: UserOption[];
  saving: boolean;
  error: string;
  onChange: (f: FormState) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
  onClose: () => void;
}) {
  const serieOptions = form.segmento ? SERIES_BY_SEGMENTO[form.segmento] ?? [] : [];
  // Com segmento definido, restringe ao vocabulário dele; sem segmento, vale tudo.
  const disciplinaOptions = form.segmento ? disciplinasFor(form.segmento) : DISCIPLINAS;
  const tipoOptions = form.segmento ? tiposFor(form.segmento) : TIPOS_MATERIAL;
  // Trocar o segmento pode invalidar série/disciplina/tipo já escolhidos → reseta.
  const setSegmento = (v: string) =>
    onChange({ ...form, segmento: v, serie: '', disciplina: '', tipoMaterial: '' });
  const toggleRecipient = (id: string) => {
    const has = form.recipientIds.includes(id);
    onChange({ ...form, recipientIds: has ? form.recipientIds.filter((x) => x !== id) : [...form.recipientIds, id] });
  };

  const radioLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' };

  return (
    <Modal
      open
      title={editId ? 'Editar lembrete' : 'Novo lembrete de material'}
      onClose={onClose}
      maxWidth={560}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-lembrete" disabled={saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar lembrete'}
          </Button>
        </>
      )}
    >
      <form id="form-lembrete" onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div className="pill pill-coral" style={{ whiteSpace: 'normal', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius-tile)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="field-label">Nome do lembrete *</label>
          <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Provas da 2ª etapa" className="field" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Recorrência *</label>
            <select value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} className="field">
              {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Próximo disparo *</label>
            <input type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required className="field" />
          </div>
        </div>

        {/* Classificação alvo */}
        <div>
          <label className="field-label">Classificação (opcional — habilita "só lembrar quem não enviou")</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <select value={form.anoLetivo} onChange={(e) => onChange({ ...form, anoLetivo: e.target.value })} className="field">
              <option value="">Ano...</option>
              {ANOS_LETIVOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={form.segmento} onChange={(e) => setSegmento(e.target.value)} className="field">
              <option value="">Segmento...</option>
              {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={form.serie} onChange={(e) => onChange({ ...form, serie: e.target.value })} disabled={!form.segmento} className="field">
              <option value="">Série...</option>
              {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={form.etapa} onChange={(e) => onChange({ ...form, etapa: e.target.value })} className="field">
              <option value="">Etapa...</option>
              {ETAPAS.map((e2) => <option key={e2.code} value={e2.code}>{e2.label}</option>)}
            </select>
            <select value={form.disciplina} onChange={(e) => onChange({ ...form, disciplina: e.target.value })} className="field">
              <option value="">Disciplina...</option>
              {disciplinaOptions.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
            <select value={form.tipoMaterial} onChange={(e) => onChange({ ...form, tipoMaterial: e.target.value })} className="field">
              <option value="">Tipo...</option>
              {tipoOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Destinatários */}
        <div>
          <label className="field-label">Destinatários *</label>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <label style={radioLabel}>
              <input type="radio" checked={form.audience === 'ALL'} onChange={() => onChange({ ...form, audience: 'ALL' })} /> Todos os professores
            </label>
            <label style={radioLabel}>
              <input type="radio" checked={form.audience === 'SELECTED'} onChange={() => onChange({ ...form, audience: 'SELECTED' })} /> Selecionar
            </label>
          </div>
          {form.audience === 'SELECTED' && (
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-tile)', padding: 8 }}>
              {users.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Nenhum usuário.</p>
              ) : users.map((u) => (
                <label key={u.id} style={{ ...radioLabel, gap: 8, padding: '3px 0' }}>
                  <input type="checkbox" checked={form.recipientIds.includes(u.id)} onChange={() => toggleRecipient(u.id)} /> {u.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="field-label">Mensagem adicional (opcional)</label>
          <textarea value={form.messageExtra} onChange={(e) => onChange({ ...form, messageExtra: e.target.value })} rows={2} placeholder="Ex: Prazo final nesta sexta." className="field" style={{ resize: 'none' }} />
        </div>

        {/* Prévia */}
        <div>
          <label className="field-label">Prévia da mensagem</label>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-tile)', padding: '10px 12px' }}>
            {previewMessage(form)}
          </pre>
        </div>
      </form>
    </Modal>
  );
}

export default function LembretesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState<Reminder[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/reminders').then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/users/directory').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const openNew = () => { setEditId(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (r: Reminder) => {
    setEditId(r.id);
    let recipientIds: string[] = [];
    try { recipientIds = r.recipientIds ? JSON.parse(r.recipientIds) : []; } catch { recipientIds = []; }
    setForm({
      name: r.name, recurrence: r.recurrence, nextRunAt: isoToLocalInput(r.nextRunAt),
      anoLetivo: r.anoLetivo ?? '', segmento: r.segmento ?? '', serie: r.serie ?? '',
      etapa: r.etapa ?? '', disciplina: r.disciplina ?? '', tipoMaterial: r.tipoMaterial ?? '',
      audience: r.audience === 'SELECTED' ? 'SELECTED' : 'ALL', recipientIds,
      messageExtra: r.messageExtra ?? '',
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
        recurrence: form.recurrence,
        nextRunAt: new Date(form.nextRunAt).toISOString(),
        anoLetivo: form.anoLetivo || null,
        segmento: form.segmento || null,
        serie: form.serie || null,
        etapa: form.etapa || null,
        disciplina: form.disciplina || null,
        tipoMaterial: form.tipoMaterial || null,
        audience: form.audience,
        recipientIds: form.recipientIds,
        messageExtra: form.messageExtra || null,
      };
      if (editId) await api.put(`/reminders/${editId}`, payload);
      else await api.post('/reminders', payload);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao salvar lembrete.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (r: Reminder) => {
    const next = r.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    await api.patch(`/reminders/${r.id}/status`, { status: next });
    load();
  };

  const runNow = async (r: Reminder) => {
    if (!window.confirm(`Disparar o lembrete "${r.name}" agora para quem ainda não enviou?`)) return;
    const res = await api.post(`/reminders/${r.id}/run-now`);
    const sent = res.data?.sent ?? 0;
    window.alert(`${sent} aviso(s) enviado(s) por WhatsApp.`);
    load();
  };

  const remove = async (r: Reminder) => {
    if (!window.confirm(`Excluir o lembrete "${r.name}"? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/reminders/${r.id}`);
    load();
  };

  const audienceLabel = (r: Reminder) => {
    if (r.audience === 'ALL') return 'Todos os professores';
    let n = 0;
    try { n = r.recipientIds ? JSON.parse(r.recipientIds).length : 0; } catch { n = 0; }
    return `${n} selecionado(s)`;
  };

  const actions = (r: Reminder) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <button onClick={() => openEdit(r)} style={{ ...linkBtn, color: 'var(--electric)' }}>Editar</button>
      {(r.status === 'ACTIVE' || r.status === 'PAUSED') && (
        <button onClick={() => toggleStatus(r)} style={{ ...linkBtn, color: 'var(--text-secondary)', fontWeight: 400 }}>
          {r.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </button>
      )}
      <button onClick={() => runNow(r)} style={{ ...linkBtn, color: 'var(--teal)' }}>Disparar agora</button>
      {isAdmin && (
        <button onClick={() => remove(r)} style={{ ...linkBtn, color: 'var(--coral)' }}>Excluir</button>
      )}
    </div>
  );

  const ativos = items.filter((r) => r.status === 'ACTIVE').length;
  const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <PageHeader
        title="Lembretes de material"
        subtitle={loading ? 'Carregando…' : `${items.length} lembrete${items.length === 1 ? '' : 's'} cadastrado${items.length === 1 ? '' : 's'}, ${ativos} ativo${ativos === 1 ? '' : 's'}`}
        actions={<Button variant="secondary" icon={<Plus size={16} />} onClick={openNew}>Novo lembrete</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {showForm && (
          <ReminderModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table
                isEmpty={items.length === 0}
                empty="Nenhum lembrete cadastrado."
                head={(
                  <tr>
                    <th>Nome</th>
                    <th>Recorrência</th>
                    <th>Próximo</th>
                    <th>Alvo</th>
                    <th>Classificação</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                )}
              >
                {items.map((r) => (
                  <tr key={r.id} className="table-row" style={{ opacity: r.status === 'ACTIVE' ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{recurrenceLabel[r.recurrence] ?? r.recurrence}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtData(r.nextRunAt)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{audienceLabel(r)}</td>
                    <td>{classTags(r)}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{actions(r)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {items.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum lembrete cadastrado.</p>}
              {items.map((r) => (
                <Card key={r.id} style={{ padding: 14, opacity: r.status === 'ACTIVE' ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{r.name}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <span className="pill pill-muted">{recurrenceLabel[r.recurrence] ?? r.recurrence}</span>
                    <span className="pill pill-muted">{fmtData(r.nextRunAt)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Alvo: {audienceLabel(r)}</p>
                  <div style={{ marginBottom: 10 }}>{classTags(r)}</div>
                  {actions(r)}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
