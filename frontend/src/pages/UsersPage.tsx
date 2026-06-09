import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../lib/modules';

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

// Estado visível na lista: Ativo (verde), Pendente de aprovação (âmbar) ou Inativo (vermelho).
function statusInfo(u: User): { label: string; style: React.CSSProperties } {
  if (u.isActive) return { label: 'Ativo', style: { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } };
  if (u.phoneVerified) return { label: 'Pendente', style: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } };
  return { label: 'Inativo', style: { background: 'rgba(239,68,68,0.12)', color: '#ef4444' } };
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

const rolePill: Record<string, { bg: string; color: string }> = {
  ADMIN:  { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  GESTOR: { bg: 'rgba(20,184,166,0.15)', color: '#14b8a6' },
  USER:   { bg: 'rgba(148,163,184,0.12)', color: 'var(--text-secondary)' },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
};

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
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginBottom: 4,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {editing ? 'Editar Usuário' : 'Novo Usuário'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, borderRadius: 6 }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Nome *</label>
            <input placeholder="Nome completo" required value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" placeholder="email@exemplo.com" required value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{editing ? 'Nova senha (deixe vazio para manter)' : 'Senha *'}</label>
            <input type="password" placeholder="••••••••" required={!editing} value={form.password}
              onChange={(e) => onChange({ ...form, password: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input placeholder="5511999999999" value={form.phone}
              onChange={(e) => onChange({ ...form, phone: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Perfil *</label>
            <select value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="USER">Usuário Comum</option>
              <option value="GESTOR">Gestor</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>

          {/* Módulos liberados — só para não-admins (ADMIN tem acesso total). */}
          <div>
            <label style={labelStyle}>Módulos liberados</label>
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
                  borderRadius: 'var(--radius-sm)',
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
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
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

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button
              type="submit"
              style={{ flex: 1, padding: '8px 0', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {editing ? 'Salvar alterações' : 'Criar usuário'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
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

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Usuários</h1>
        <button
          onClick={openCreate}
          style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Novo Usuário
        </button>
      </header>

      {notice && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{notice}</span>
          <button
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
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
        <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div
            className="hidden md:block rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
          >
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(13,24,37,0.6)' }}>
                  {['Nome', 'Email', 'Perfil', 'Status', 'Ações'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr
                    key={u.id}
                    style={{
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className="pill"
                        style={{ ...(rolePill[u.role] ?? rolePill.USER) }}
                      >
                        {roleLabel[u.role] ?? u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="pill" style={statusInfo(u).style}>
                        {statusInfo(u).label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openEdit(u)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500, padding: 0 }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: !u.isActive && u.phoneVerified ? '#22c55e' : 'var(--text-secondary)', fontSize: 12, fontWeight: !u.isActive && u.phoneVerified ? 600 : 400, padding: 0 }}
                        >
                          {toggleLabel(u)}
                        </button>
                        <button
                          onClick={() => resetPassword(u)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 400, padding: 0 }}
                        >
                          Redefinir senha
                        </button>
                        {currentUser?.id !== u.id && (
                          <button
                            onClick={() => removeUser(u)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, fontWeight: 500, padding: 0 }}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  opacity: u.isActive ? 1 : 0.6,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{u.name}</span>
                  <span className="pill" style={{ ...(rolePill[u.role] ?? rolePill.USER), flexShrink: 0 }}>
                    {roleLabel[u.role] ?? u.role}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.email}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="pill" style={statusInfo(u).style}>
                    {statusInfo(u).label}
                  </span>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => openEdit(u)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: !u.isActive && u.phoneVerified ? '#22c55e' : 'var(--text-secondary)', fontSize: 12, fontWeight: !u.isActive && u.phoneVerified ? 600 : 400 }}
                    >
                      {toggleLabel(u)}
                    </button>
                    <button
                      onClick={() => resetPassword(u)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 400 }}
                    >
                      Redefinir senha
                    </button>
                    {currentUser?.id !== u.id && (
                      <button
                        onClick={() => removeUser(u)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, fontWeight: 500 }}
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
