import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  isActive: boolean;
}

const emptyForm = { name: '', email: '', password: '', role: 'USER', phone: '' };

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin',
  GESTOR: 'Gestor',
  USER: 'Usuário',
};

const roleBadge: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  GESTOR: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  USER: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

function UserModal({
  editing,
  form,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  editing: User | null;
  form: typeof emptyForm;
  error: string;
  onChange: (f: typeof emptyForm) => void;
  onSubmit: (e: { preventDefault(): void }) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {editing ? 'Editar Usuário' : 'Novo Usuário'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-3">
          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nome *</label>
            <input
              placeholder="Nome completo"
              required
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email *</label>
            <input
              type="email"
              placeholder="email@exemplo.com"
              required
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {editing ? 'Nova senha (deixe vazio para manter)' : 'Senha *'}
            </label>
            <input
              type="password"
              placeholder="••••••••"
              required={!editing}
              value={form.password}
              onChange={(e) => onChange({ ...form, password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">WhatsApp</label>
            <input
              placeholder="5511999999999"
              value={form.phone}
              onChange={(e) => onChange({ ...form, phone: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Perfil *</label>
            <select
              value={form.role}
              onChange={(e) => onChange({ ...form, role: e.target.value })}
              className={inputCls}
            >
              <option value="USER">Usuário Comum</option>
              <option value="GESTOR">Gestor</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800 font-medium transition-colors">
              {editing ? 'Salvar alterações' : 'Criar usuário'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/users').then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone ?? '' });
    setError('');
    setShowForm(true);
  };
  const closeModal = () => setShowForm(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      if (!payload.password) delete (payload as Record<string, string>).password;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Usuários</h2>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-800">
          + Novo Usuário
        </button>
      </div>

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
        <p className="text-slate-500 dark:text-slate-400">Carregando...</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Perfil</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${roleBadge[u.role] ?? roleBadge.USER}`}>
                        {roleLabel[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'}`}>
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => openEdit(u)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
                        Editar
                      </button>
                      <button onClick={() => toggleActive(u)} className="text-slate-500 dark:text-slate-400 hover:underline text-xs">
                        {u.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 ${!u.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{u.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${roleBadge[u.role] ?? roleBadge.USER}`}>
                    {roleLabel[u.role] ?? u.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">{u.email}</p>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'}`}>
                    {u.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(u)} className="text-blue-600 dark:text-blue-400 text-xs font-medium">
                      Editar
                    </button>
                    <button onClick={() => toggleActive(u)} className="text-slate-500 dark:text-slate-400 text-xs">
                      {u.isActive ? 'Desativar' : 'Ativar'}
                    </button>
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
