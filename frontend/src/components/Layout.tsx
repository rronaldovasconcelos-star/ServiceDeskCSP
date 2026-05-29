import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Package,
  BookOpen,
  Users,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/tickets', label: 'Chamados', icon: Ticket, adminOnly: false },
  { to: '/tickets/new', label: 'Novo Chamado', icon: PlusCircle, adminOnly: false },
  { to: '/suprimentos', label: 'Suprimentos', icon: Package, adminOnly: false },
  { to: '/suprimentos/catalogo', label: 'Catálogo', icon: BookOpen, adminOnly: true },
  { to: '/users', label: 'Usuários', icon: Users, adminOnly: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <aside
        className="w-64 flex flex-col shadow-xl"
        style={{ background: 'linear-gradient(180deg, #0f2662 0%, #1a3a8a 60%, #1e4db0 100%)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center px-6 py-6 border-b border-white/10">
          <img
            src="/logo.jpg"
            alt="Colégio Santa Paula"
            className="w-20 h-20 object-contain rounded-xl shadow-lg mb-3 bg-white p-1"
          />
          <h1 className="text-white text-sm font-bold text-center leading-tight">Colégio Santa Paula</h1>
          <span
            className="text-xs font-medium mt-1 px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(125,179,211,0.25)', color: '#b8d8ed' }}
          >
            Portal de Chamados
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === 'ADMIN')
            .map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                    active
                      ? 'text-white shadow-md'
                      : 'text-blue-200 hover:text-white hover:bg-white/10'
                  }`}
                  style={active ? { background: 'rgba(255,255,255,0.18)' } : {}}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={14} className="opacity-60" />}
                </Link>
              );
            })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: 'rgba(125,179,211,0.4)' }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name}</p>
              <p className="text-blue-300 text-xs truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 flex-1 text-xs text-blue-300 hover:text-white transition-colors py-1.5 px-2 rounded-lg hover:bg-white/10"
            >
              <LogOut size={14} />
              Sair
            </button>
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-blue-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
