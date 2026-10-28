import { useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2, Users as UsersIcon } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../lib/modules';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, Fieldset, Modal, Notice, Table } from '../components/ui';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  phoneVerified?: boolean;
  isActive: boolean;
  modules?: string[];
}

interface FormState {
  name: string;
  email: string;
  password: string;
  role: string;
  phone: string;
  modules: string[];
}

// Estado visível na lista: Ativo (verde-água), Pendente de aprovação (âmbar) ou Inativo (coral).
function statusInfo(u: User): { label: string; tom: string } {
  if (u.isActive) return { label: 'Ativo', tom: 'teal' };
  if (u.phoneVerified) return { label: 'Pendente', tom: 'amber' };
  return { label: 'Inativo', tom: 'coral' };
}

function toggleLabel(u: User): string {
  if (u.isActive) return 'Desativar';
  return u.phoneVerified ? 'Aprovar' : 'Ativar';
}

const emptyForm: FormState = { name: '', email: '', password: '', role: 'USER', phone: '', modules: [] };

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin',
  GESTOR: 'Gestor',
  USER: 'Usuário',
};

const roleTom: Record<string, string> = {
  ADMIN: 'violet',
  GESTOR: 'teal',
  USER: 'muted',
};

function StatusPill({ u }: { u: User }) {
  const { label, tom } = statusInfo(u);
  return (
    <span className={`pill pill-${tom}`}>
      <span className="pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function UserModal({
  editing,
  form,
  error,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  editing: User | null;
  form: FormState;
  error: string;
  saving: boolean;
  onChange: (f: FormState) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
  onClose: () => void;
}) {
  const toggleModule = (key: string) => {
    const has = form.modules.includes(key);
    onChange({ ...form, modules: has ? form.modules.filter((m) => m !== key) : [...form.modules, key] });
  };

  return (
    <Modal
      open
      title={editing ? 'Editar usuário' : 'Novo usuário'}
      onClose={onClose}
      maxWidth={520}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" form="form-usuario" loading={saving}>
            {editing ? 'Salvar alterações' : 'Criar usuário'}
          </Button>
        </>
      )}
    >
      <form id="form-usuario" onSubmit={onSubmit} className="stack">
        {error && <Notice kind="danger">{error}</Notice>}

        <Fieldset legend="Dados da pessoa">
          <Field label="Nome" required>
            {(ctl) => (
              <input {...ctl} className="field" placeholder="Nome completo" required value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })} data-autofocus />
            )}
          </Field>
          <div className="form-grid-2">
            <Field label="Email" required>
              {(ctl) => (
                <input {...ctl} className="field" type="email" placeholder="email@exemplo.com" required value={form.email}
                  onChange={(e) => onChange({ ...form, email: e.target.value })} />
              )}
            </Field>
            <Field label="WhatsApp" hint="Só números, com DDI e DDD">
              {(ctl) => (
                <input {...ctl} className="field" placeholder="5511999999999" value={form.phone}
                  onChange={(e) => onChange({ ...form, phone: e.target.value })} />
              )}
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Acesso">
          <div className="form-grid-2">
            <Field label={editing ? 'Nova senha' : 'Senha'} required={!editing} hint={editing ? 'Deixe vazio para manter a atual' : undefined}>
              {(ctl) => (
                <input {...ctl} className="field" type="password" placeholder="••••••••" required={!editing} value={form.password}
                  autoComplete="new-password" onChange={(e) => onChange({ ...form, password: e.target.value })} />
              )}
            </Field>
            <Field label="Perfil" required>
              {(ctl) => (
                <select {...ctl} className="field" value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value })}>
                  <option value="USER">Usuário Comum</option>
                  <option value="GESTOR">Gestor</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              )}
            </Field>
          </div>
        </Fieldset>

        {/* Módulos liberados — só para não-admins (ADMIN tem acesso total). */}
        <Fieldset legend="Módulos liberados" hint="Chamados, Suprimentos e Meus Arquivos estão sempre disponíveis.">
          {form.role === 'ADMIN' ? (
            <p className="muted text-sm-2">Administrador tem acesso a todos os módulos.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 bg-(--bg) border border-(--line) rounded-(--radius-sm)" role="group" aria-label="Módulos liberados">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-[13px] cursor-pointer min-h-7">
                  <input
                    type="checkbox"
                    className="accent-(--primary) cursor-pointer"
                    checked={form.modules.includes(m.key)}
                    onChange={() => toggleModule(m.key)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </Fieldset>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const load = () => {
    api.get('/users')
      .then((r) => { setUsers(r.data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone ?? '', modules: u.modules ?? [] });
    setError('');
    setShowForm(true);
  };
  const closeModal = () => setShowForm(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: Partial<FormState> = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) {
        await api.put(`/users/${editing.id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    await api.patch(`/users/${u.id}/toggle-active`);
    load();
  };

  const resetPassword = async (u: User) => {
    if (!confirm(`Enviar um código de redefinição de senha para ${u.name} via WhatsApp?\n\nA senha atual continua válida até o usuário concluir a troca.`)) return;
    setNotice(null);
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      setNotice({ kind: 'success', text: res.data?.message ?? `Código de redefinição enviado para ${u.name}.` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice({ kind: 'danger', text: msg ?? 'Erro ao enviar o código de redefinição.' });
    }
  };

  const removeUser = async (u: User) => {
    if (!confirm(`Excluir PERMANENTEMENTE o usuário "${u.name}"?\n\nIsto apaga também todos os chamados, arquivos e histórico dele. Esta ação NÃO pode ser desfeita.`)) return;
    if (!confirm(`Confirma a exclusão definitiva de "${u.name}"? Última chance.`)) return;
    setNotice(null);
    try {
      await api.delete(`/users/${u.id}`);
      setNotice({ kind: 'success', text: `Usuário "${u.name}" excluído.` });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice({ kind: 'danger', text: msg ?? 'Erro ao excluir o usuário.' });
    }
  };

  const ativos = users.filter((u) => u.isActive).length;
  const pendentes = users.filter((u) => !u.isActive && u.phoneVerified).length;

  const acoes = (u: User) => {
    const aprovar = !u.isActive && Boolean(u.phoneVerified);
    return (
      <div className="row">
        <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(u)}>Editar</Button>
        <Button variant={aprovar ? 'secondary' : 'ghost'} size="sm" onClick={() => toggleActive(u)}>{toggleLabel(u)}</Button>
        <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => resetPassword(u)}>Redefinir senha</Button>
        {currentUser?.id !== u.id && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Excluir usuário ${u.name}`}
            title="Excluir usuário"
            icon={<Trash2 size={16} />}
            onClick={() => removeUser(u)}
          />
        )}
      </div>
    );
  };

  const cabecalho = (
    <tr>
      <th>Nome</th>
      <th>Email</th>
      <th>Perfil</th>
      <th>Status</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<UsersIcon size={22} />}
      title="Nenhum usuário cadastrado"
      action={<Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>Novo usuário</Button>}
    >
      Cadastre as pessoas que vão usar o portal e escolha o perfil de cada uma.
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Usuários"
        description={loading ? 'Carregando…' : `${users.length} cadastrado${users.length === 1 ? '' : 's'} · ${ativos} ativo${ativos === 1 ? '' : 's'}${pendentes ? ` · ${pendentes} aguardando aprovação` : ''}`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>Novo usuário</Button>}
      />

      <main className="page-body stack">
        {notice && (
          <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>
        )}

        {showForm && (
          <UserModal
            editing={editing}
            form={form}
            error={error}
            saving={saving}
            onChange={setForm}
            onSubmit={handleSubmit}
            onClose={closeModal}
          />
        )}

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={() => { setLoading(true); load(); }}>Tentar novamente</Button>}
          >
            Não foi possível carregar os usuários.
          </Notice>
        ) : loading ? (
          <>
            <div className="hidden md:block">
              <Table loading rows={6} cols={5} head={cabecalho} />
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
              <Table isEmpty={users.length === 0} empty={vazio} head={cabecalho}>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="muted">{u.email}</td>
                    <td><span className={`pill pill-${roleTom[u.role] ?? 'muted'}`}>{roleLabel[u.role] ?? u.role}</span></td>
                    <td><StatusPill u={u} /></td>
                    <td>{acoes(u)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden stack">
              {users.length === 0 && <div className="card">{vazio}</div>}
              {users.map((u) => (
                <div key={u.id} className={`ticket-card ${u.isActive ? '' : 'opacity-70'}`.trim()}>
                  <p className="ticket-card-title">{u.name}</p>
                  <div className="ticket-card-meta">
                    <StatusPill u={u} />
                    <span className={`pill pill-${roleTom[u.role] ?? 'muted'}`}>{roleLabel[u.role] ?? u.role}</span>
                  </div>
                  <p className="ticket-card-sub truncate mb-2">{u.email}</p>
                  {acoes(u)}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
