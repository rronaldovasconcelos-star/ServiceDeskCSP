import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', adminOnly: true },
  { to: '/tickets', label: 'Chamados', adminOnly: false },
  { to: '/tickets/new', label: 'Novo Chamado', adminOnly: false },
  { to: '/users', label: 'Usuários', adminOnly: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 bg-blue-800 text-white flex flex-col shadow-lg">
        <div className="px-6 py-5 border-b border-blue-700">
          <h1 className="text-base font-bold leading-tight">Colégio Santa Paula</h1>
          <p className="text-blue-200 text-xs mt-1">Portal de Chamados</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === 'ADMIN')
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                  location.pathname === item.to
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-blue-100 hover:bg-blue-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="px-4 py-4 border-t border-blue-700">
          <p className="text-blue-200 text-xs truncate">{user?.name}</p>
          <p className="text-blue-300 text-xs truncate">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full text-left text-xs text-blue-200 hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
