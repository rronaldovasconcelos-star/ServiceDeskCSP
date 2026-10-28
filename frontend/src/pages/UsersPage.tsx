import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../lib/modules';
import PageHeader from '../components/PageHeader';
import { Button, Card, Modal, Table } from '../components/ui';

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

/** Botão de ação em texto, dentro da linha da tabela / card. */
function LinkButton({ tom = 'muted', bold, onClick, children }: { tom?: 'electric' | 'coral' | 'teal' | 'muted'; bold?: boolean; onClick: () => void; children: string }) {
  const color = tom === 'muted' ? 'var(--text-secondary)' : `var(--${tom})`;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 12, fontWeight: bold ? 600 : 500, padding: 0, fontFamily: 'inherit' }}
    >
      {children}
    </button>
  );
}

function UserModal({
  editing,
  form,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  editing: User | null;
  form: FormState;
  error: string;
  onChange: (f: FormState) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
  onClose: () => void;
}) {
  const toggleModule = (key: string) => {
    const has = form.modules.includes(key);
    onChange({ ...form, modules: has ? form.modules.filter((m) => m !== key) : [...form.modules, key] });
  };

  return (
    <Modal open title={editing ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} maxWidth={460}>
      <form id="form-usuario" onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div>
          <label className="field-label">Nome *</label>
          <input className="field" placeholder="Nome completo" required value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Email *</label>
          <input className="field" type="email" placeholder="email@exemplo.com" required value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="field-label">{editing ? 'Nova senha (deixe vazio para manter)' : 'Senha *'}</label>
          <input className="field" type="password" placeholder="••••••••" required={!editing} value={form.password}
            onChange={(e) => onChange({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="field-label">WhatsApp</label>
          <input className="field" placeholder="5511999999999" value={form.phone}
            onChange={(e) => onChange({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="field-label">Perfil *</label>
          <select className="field" value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value })}>
            <option value="USER">Usuário Comum</option>
            <option value="GESTOR">Gestor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        {/* Módulos liberados — só para não-admins (ADMIN tem acesso total). */}
        <div>
          <label className="field-label">Módulos liberados</label>
          {form.role === 'ADMIN' ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Administrador tem acesso a todos os módulos.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px 12px',
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-tile)',
              }}
            >
              {MODULES.map((m) => (
                <label
                  key={m.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={form.modules.includes(m.key)}
                    onChange={() => toggleModule(m.key)}
                    style={{ accentColor: 'var(--electric)', cursor: 'pointer' }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 0 }}>
            Chamados, Suprimentos e Meus Arquivos estão sempre disponíveis.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit">{editing ? 'Salvar alterações' : 'Criar usuário'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    api.get('/users').then((r) => setUsers(r.data)).finally(() => setLoading(false));
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
    }
  };

  const toggleActive = async (u: User) => {
    await api.patch(`/users/${u.id}/toggle-active`);
    load();
  };

  const resetPassword = async (u: User) => {
    if (!confirm(`Enviar um código de redefinição de senha para ${u.name} via WhatsApp?\n\nA senha atual continua válida até o usuário concluir a troca.`)) return;
    setNotice('');
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      setNotice(res.data?.message ?? `Código de redefinição enviado para ${u.name}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg ?? 'Erro ao enviar o código de redefinição.');
    }
  };

  const removeUser = async (u: User) => {
    if (!confirm(`Excluir PERMANENTEMENTE o usuário "${u.name}"?\n\nIsto apaga também todos os chamados, arquivos e histórico dele. Esta ação NÃO pode ser desfeita.`)) return;
    if (!confirm(`Confirma a exclusão definitiva de "${u.name}"? Última chance.`)) return;
    setNotice('');
    try {
      await api.delete(`/users/${u.id}`);
      setNotice(`Usuário "${u.name}" excluído.`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg ?? 'Erro ao excluir o usuário.');
    }
  };

  const ativos = users.filter((u) => u.isActive).length;
  const pendentes = users.filter((u) => !u.isActive && u.phoneVerified).length;

  const acoes = (u: User) => (
    <>
      <LinkButton tom="electric" onClick={() => openEdit(u)}>Editar</LinkButton>
      <LinkButton tom={!u.isActive && u.phoneVerified ? 'teal' : 'muted'} bold={!u.isActive && u.phoneVerified} onClick={() => toggleActive(u)}>{toggleLabel(u)}</LinkButton>
      <LinkButton onClick={() => resetPassword(u)}>Redefinir senha</LinkButton>
      {currentUser?.id !== u.id && <LinkButton tom="coral" onClick={() => removeUser(u)}>Excluir</LinkButton>}
    </>
  );

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={loading ? 'Carregando…' : `${users.length} cadastrado${users.length === 1 ? '' : 's'} · ${ativos} ativo${ativos === 1 ? '' : 's'}${pendentes ? ` · ${pendentes} aguardando aprovação` : ''}`}
        actions={<Button variant="secondary" icon={<Plus size={16} />} onClick={openCreate}>Novo usuário</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {notice && (
          <Card style={{ padding: '10px 14px', borderLeft: '3px solid var(--electric)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}
              aria-label="Fechar aviso"
            >
              <X size={16} />
            </button>
          </Card>
        )}

        {showForm && (
          <UserModal
            editing={editing}
            form={form}
            error={error}
            onChange={setForm}
            onSubmit={handleSubmit}
            onClose={closeModal}
          />
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table
                isEmpty={users.length === 0}
                empty="Nenhum usuário cadastrado."
                head={(
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Perfil</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                )}
              >
                {users.map((u) => (
                  <tr key={u.id} className="table-row">
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td><span className={`pill pill-${roleTom[u.role] ?? 'muted'}`}>{roleLabel[u.role] ?? u.role}</span></td>
                    <td><span className={`pill pill-${statusInfo(u).tom}`}>{statusInfo(u).label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{acoes(u)}</div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {users.map((u) => (
                <Card key={u.id} style={{ padding: 14, opacity: u.isActive ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{u.name}</span>
                    <span className={`pill pill-${roleTom[u.role] ?? 'muted'}`} style={{ flexShrink: 0 }}>{roleLabel[u.role] ?? u.role}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className={`pill pill-${statusInfo(u).tom}`}>{statusInfo(u).label}</span>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{acoes(u)}</div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
