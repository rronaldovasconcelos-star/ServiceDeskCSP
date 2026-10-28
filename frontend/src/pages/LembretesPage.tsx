import { useEffect, useState } from 'react';
import { BellRing, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  ANOS_LETIVOS, SEGMENTOS, SERIES_BY_SEGMENTO, ETAPAS, DISCIPLINAS, TIPOS_MATERIAL,
  disciplinasFor, tiposFor, labelFor,
} from '../lib/taxonomy';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, Fieldset, Modal, Notice, Table } from '../components/ui';
import { formatDateTime } from '../lib/dates';

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
  if (tags.length === 0) return <span className="muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
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

  return (
    <Modal
      open
      title={editId ? 'Editar lembrete' : 'Novo lembrete de material'}
      onClose={onClose}
      maxWidth={600}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" form="form-lembrete" loading={saving}>
            {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar lembrete'}
          </Button>
        </>
      )}
    >
      <form id="form-lembrete" onSubmit={onSubmit} className="stack">
        {error && <Notice kind="danger">{error}</Notice>}

        <Fieldset legend="Agendamento">
          <Field label="Nome do lembrete" required>
            {(ctl) => (
              <input {...ctl} value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Provas da 2ª etapa" className="field" data-autofocus />
            )}
          </Field>
          <div className="form-grid-2">
            <Field label="Recorrência" required>
              {(ctl) => (
                <select {...ctl} value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} className="field">
                  {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
                </select>
              )}
            </Field>
            <Field label="Próximo disparo" required>
              {(ctl) => (
                <input {...ctl} type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required className="field" />
              )}
            </Field>
          </div>
        </Fieldset>

        {/* Classificação alvo */}
        <Fieldset legend="Classificação" hint='Opcional — habilita "só lembrar quem não enviou".'>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Ano">
              {(ctl) => (
                <select {...ctl} value={form.anoLetivo} onChange={(e) => onChange({ ...form, anoLetivo: e.target.value })} className="field">
                  <option value="">Ano...</option>
                  {ANOS_LETIVOS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </Field>
            <Field label="Segmento">
              {(ctl) => (
                <select {...ctl} value={form.segmento} onChange={(e) => setSegmento(e.target.value)} className="field">
                  <option value="">Segmento...</option>
                  {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Série" hint={form.segmento ? undefined : 'Escolha o segmento antes'}>
              {(ctl) => (
                <select {...ctl} value={form.serie} onChange={(e) => onChange({ ...form, serie: e.target.value })} disabled={!form.segmento} className="field">
                  <option value="">Série...</option>
                  {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Etapa">
              {(ctl) => (
                <select {...ctl} value={form.etapa} onChange={(e) => onChange({ ...form, etapa: e.target.value })} className="field">
                  <option value="">Etapa...</option>
                  {ETAPAS.map((e2) => <option key={e2.code} value={e2.code}>{e2.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Disciplina">
              {(ctl) => (
                <select {...ctl} value={form.disciplina} onChange={(e) => onChange({ ...form, disciplina: e.target.value })} className="field">
                  <option value="">Disciplina...</option>
                  {disciplinaOptions.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Tipo">
              {(ctl) => (
                <select {...ctl} value={form.tipoMaterial} onChange={(e) => onChange({ ...form, tipoMaterial: e.target.value })} className="field">
                  <option value="">Tipo...</option>
                  {tipoOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              )}
            </Field>
          </div>
        </Fieldset>

        {/* Destinatários */}
        <Fieldset legend="Destinatários">
          <div className="choice-grid" role="radiogroup" aria-label="Destinatários">
            <label className="choice">
              <input type="radio" name="audience" checked={form.audience === 'ALL'} onChange={() => onChange({ ...form, audience: 'ALL' })} />
              <span className="choice-title">Todos os professores</span>
            </label>
            <label className="choice">
              <input type="radio" name="audience" checked={form.audience === 'SELECTED'} onChange={() => onChange({ ...form, audience: 'SELECTED' })} />
              <span className="choice-title">Selecionar</span>
            </label>
          </div>
          {form.audience === 'SELECTED' && (
            <div className="max-h-40 overflow-y-auto border border-(--line) rounded-(--radius-sm) p-2" role="group" aria-label="Professores selecionados">
              {users.length === 0 ? (
                <p className="muted text-xs m-0">Nenhum usuário.</p>
              ) : users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-[13px] py-1 cursor-pointer">
                  <input type="checkbox" className="accent-(--primary)" checked={form.recipientIds.includes(u.id)} onChange={() => toggleRecipient(u.id)} /> {u.name}
                </label>
              ))}
            </div>
          )}
        </Fieldset>

        <Fieldset legend="Mensagem">
          <Field label="Mensagem adicional" hint="Opcional">
            {(ctl) => (
              <textarea {...ctl} value={form.messageExtra} onChange={(e) => onChange({ ...form, messageExtra: e.target.value })} rows={2} placeholder="Ex: Prazo final nesta sexta." className="field min-h-[64px]" />
            )}
          </Field>

          {/* Prévia */}
          <div className="field-wrap">
            <p className="field-label" id="previa-lembrete">Prévia da mensagem</p>
            <pre
              aria-labelledby="previa-lembrete"
              className="m-0 whitespace-pre-wrap break-words [font-family:inherit] text-xs muted bg-(--bg) border border-(--line) rounded-(--radius-sm) px-3 py-2.5"
            >
              {previewMessage(form)}
            </pre>
          </div>
        </Fieldset>
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
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/reminders')
      .then((r) => { setItems(r.data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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
    <div className="row">
      <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(r)}>Editar</Button>
      {(r.status === 'ACTIVE' || r.status === 'PAUSED') && (
        <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)}>
          {r.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </Button>
      )}
      <Button variant="ghost" size="sm" icon={<Send size={14} />} onClick={() => runNow(r)}>Disparar agora</Button>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Excluir lembrete ${r.name}`}
          title="Excluir lembrete"
          icon={<Trash2 size={16} />}
          onClick={() => remove(r)}
        />
      )}
    </div>
  );

  const ativos = items.filter((r) => r.status === 'ACTIVE').length;

  const cabecalho = (
    <tr>
      <th>Nome</th>
      <th>Recorrência</th>
      <th>Próximo</th>
      <th>Alvo</th>
      <th>Classificação</th>
      <th>Status</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<BellRing size={22} />}
      title="Nenhum lembrete cadastrado"
      action={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Novo lembrete</Button>}
    >
      Crie um lembrete e os professores que ainda não enviaram o material recebem o aviso por WhatsApp.
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Lembretes de material"
        description={loading ? 'Carregando…' : `${items.length} lembrete${items.length === 1 ? '' : 's'} cadastrado${items.length === 1 ? '' : 's'}, ${ativos} ativo${ativos === 1 ? '' : 's'}`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Novo lembrete</Button>}
      />

      <main className="page-body stack">
        {showForm && (
          <ReminderModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
        )}

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>}
          >
            Não foi possível carregar os lembretes.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={7} head={cabecalho} />
            </div>
            <div className="md:hidden stack" aria-busy="true">
              <div className="skeleton h-[120px]" />
              <div className="skeleton h-[120px]" />
              <div className="skeleton h-[120px]" />
            </div>
          </>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table isEmpty={items.length === 0} empty={vazio} head={cabecalho}>
                {items.map((r) => (
                  <tr key={r.id} className={r.status === 'ACTIVE' ? undefined : 'opacity-60'}>
                    <td className="font-medium">{r.name}</td>
                    <td className="muted">{recurrenceLabel[r.recurrence] ?? r.recurrence}</td>
                    <td className="muted whitespace-nowrap">{formatDateTime(r.nextRunAt)}</td>
                    <td className="muted">{audienceLabel(r)}</td>
                    <td>{classTags(r)}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{actions(r)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {items.length === 0 && <div className="card">{vazio}</div>}
              {items.map((r) => (
                <div key={r.id} className={`ticket-card ${r.status === 'ACTIVE' ? '' : 'opacity-70'}`.trim()}>
                  <p className="ticket-card-title">{r.name}</p>
                  <div className="ticket-card-meta">
                    <StatusPill status={r.status} />
                    <span className="pill pill-muted">{recurrenceLabel[r.recurrence] ?? r.recurrence}</span>
                    <span className="pill pill-muted">{formatDateTime(r.nextRunAt)}</span>
                  </div>
                  <p className="ticket-card-sub mb-1.5">Alvo: {audienceLabel(r)}</p>
                  <div className="mb-2.5">{classTags(r)}</div>
                  {actions(r)}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
