import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  ANOS_LETIVOS, SEGMENTOS, SERIES_BY_SEGMENTO, ETAPAS, DISCIPLINAS, TIPOS_MATERIAL, labelFor,
} from '../lib/taxonomy';

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
const statusColor: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' },
  PAUSED: { bg: 'rgba(234,179,8,0.14)', color: '#ca8a04' },
  DONE: { bg: 'rgba(100,116,139,0.14)', color: '#64748b' },
  CANCELLED: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {tags.map((t, i) => (
        <span key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{t}</span>
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
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const serieOptions = form.segmento ? SERIES_BY_SEGMENTO[form.segmento] ?? [] : [];
  const setSegmento = (v: string) => onChange({ ...form, segmento: v, serie: '' });
  const toggleRecipient = (id: string) => {
    const has = form.recipientIds.includes(id);
    onChange({ ...form, recipientIds: has ? form.recipientIds.filter((x) => x !== id) : [...form.recipientIds, id] });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />
      <div style={{ position: 'relative', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {editId ? 'Editar Lembrete' : 'Novo Lembrete de Material'}
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
            <label style={labelStyle}>Nome do lembrete *</label>
            <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} required placeholder="Ex: Provas da 2ª etapa" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Recorrência *</label>
              <select value={form.recurrence} onChange={(e) => onChange({ ...form, recurrence: e.target.value })} style={inputStyle}>
                {RECURRENCES.map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Próximo disparo *</label>
              <input type="datetime-local" value={form.nextRunAt} onChange={(e) => onChange({ ...form, nextRunAt: e.target.value })} required style={inputStyle} />
            </div>
          </div>

          {/* Classificação alvo */}
          <div>
            <label style={labelStyle}>Classificação (opcional — habilita "só lembrar quem não enviou")</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              <select value={form.anoLetivo} onChange={(e) => onChange({ ...form, anoLetivo: e.target.value })} style={inputStyle}>
                <option value="">Ano...</option>
                {ANOS_LETIVOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={form.segmento} onChange={(e) => setSegmento(e.target.value)} style={inputStyle}>
                <option value="">Segmento...</option>
                {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              <select value={form.serie} onChange={(e) => onChange({ ...form, serie: e.target.value })} disabled={!form.segmento} style={inputStyle}>
                <option value="">Série...</option>
                {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              <select value={form.etapa} onChange={(e) => onChange({ ...form, etapa: e.target.value })} style={inputStyle}>
                <option value="">Etapa...</option>
                {ETAPAS.map((e2) => <option key={e2.code} value={e2.code}>{e2.label}</option>)}
              </select>
              <select value={form.disciplina} onChange={(e) => onChange({ ...form, disciplina: e.target.value })} style={inputStyle}>
                <option value="">Disciplina...</option>
                {DISCIPLINAS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
              <select value={form.tipoMaterial} onChange={(e) => onChange({ ...form, tipoMaterial: e.target.value })} style={inputStyle}>
                <option value="">Tipo...</option>
                {TIPOS_MATERIAL.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Destinatários */}
          <div>
            <label style={labelStyle}>Destinatários *</label>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" checked={form.audience === 'ALL'} onChange={() => onChange({ ...form, audience: 'ALL' })} /> Todos os professores
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="radio" checked={form.audience === 'SELECTED'} onChange={() => onChange({ ...form, audience: 'SELECTED' })} /> Selecionar
              </label>
            </div>
            {form.audience === 'SELECTED' && (
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px' }}>
                {users.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Nenhum usuário.</p>
                ) : users.map((u) => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.recipientIds.includes(u.id)} onChange={() => toggleRecipient(u.id)} /> {u.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Mensagem adicional (opcional)</label>
            <textarea value={form.messageExtra} onChange={(e) => onChange({ ...form, messageExtra: e.target.value })} rows={2} placeholder="Ex: Prazo final nesta sexta." style={{ ...inputStyle, resize: 'none' }} />
          </div>

          {/* Prévia */}
          <div>
            <label style={labelStyle}>Prévia da mensagem</label>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
              {previewMessage(form)}
            </pre>
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Criar lembrete'}
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
    api.get('/users').then((r) => setUsers(r.data)).catch(() => {});
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
      <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', padding: 0, fontWeight: 500 }}>Editar</button>
      {(r.status === 'ACTIVE' || r.status === 'PAUSED') && (
        <button onClick={() => toggleStatus(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', padding: 0 }}>
          {r.status === 'PAUSED' ? 'Retomar' : 'Pausar'}
        </button>
      )}
      <button onClick={() => runNow(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d9488', fontSize: '12px', padding: 0, fontWeight: 500 }}>Disparar agora</button>
      {isAdmin && (
        <button onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0, fontWeight: 500 }}>Excluir</button>
      )}
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Lembretes de Material</h2>
        <button onClick={openNew} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
          + Novo Lembrete
        </button>
      </div>

      {showForm && (
        <ReminderModal editId={editId} form={form} users={users} saving={saving} error={error} onChange={setForm} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum lembrete cadastrado.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Recorrência</th>
                  <th style={thStyle}>Próximo</th>
                  <th style={thStyle}>Alvo</th>
                  <th style={thStyle}>Classificação</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: r.status === 'ACTIVE' ? 1 : 0.6 }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{recurrenceLabel[r.recurrence] ?? r.recurrence}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{new Date(r.nextRunAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{audienceLabel(r)}</td>
                    <td style={{ padding: '10px 16px' }}>{classTags(r)}</td>
                    <td style={{ padding: '10px 16px' }}>{chip(statusLabel[r.status] ?? r.status, statusColor[r.status] ?? statusColor.DONE)}</td>
                    <td style={{ padding: '10px 16px' }}>{actions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {items.map((r) => (
              <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', opacity: r.status === 'ACTIVE' ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{r.name}</span>
                  {chip(statusLabel[r.status] ?? r.status, statusColor[r.status] ?? statusColor.DONE)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{recurrenceLabel[r.recurrence] ?? r.recurrence}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{new Date(r.nextRunAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 6px' }}>Alvo: {audienceLabel(r)}</p>
                <div style={{ marginBottom: '10px' }}>{classTags(r)}</div>
                {actions(r)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
