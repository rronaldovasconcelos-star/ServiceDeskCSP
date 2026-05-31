import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Package,
  BookOpen,
  FolderOpen,
  HardDrive,
  Users,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
  MessageSquare,
  Bot,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/tickets', label: 'Chamados', icon: Ticket, adminOnly: false },
  { to: '/tickets/new', label: 'Novo Chamado', icon: PlusCircle, adminOnly: false },
  { to: '/suprimentos', label: 'Suprimentos', icon: Package, adminOnly: false },
  { to: '/suprimentos/catalogo', label: 'Catálogo', icon: BookOpen, adminOnly: true },
  { to: '/arquivos', label: 'Meus Arquivos', icon: FolderOpen, adminOnly: false },
  { to: '/repositorio', label: 'Repositório', icon: HardDrive, adminOnly: true, gestorAllowed: true },
  { to: '/users', label: 'Usuários', icon: Users, adminOnly: true },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, adminOnly: true },
  { to: '/agente', label: 'Agente IA', icon: Bot, adminOnly: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fecha sidebar ao navegar (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fecha sidebar ao pressionar Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Trava scroll do body quando sidebar está aberta no mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const filteredNav = navItems.filter((item) =>
    !item.adminOnly ||
    user?.role === 'ADMIN' ||
    (item.gestorAllowed && user?.role === 'GESTOR')
  );

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        className="flex flex-col items-center px-4 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <img
          src="/logo.jpg"
          alt="Colégio Santa Paula"
          className="w-14 h-14 object-contain rounded-xl shadow-lg mb-2 bg-white p-0.5"
        />
        <p className="text-xs font-bold text-center leading-tight" style={{ color: 'var(--text-primary)' }}>
          Colégio Santa Paula
        </p>
        <span
          className="text-xs mt-1 px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(77,142,240,0.15)', color: 'var(--accent)' }}
        >
          Portal de Chamados
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5" aria-label="Navegação principal">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={`sidebar-link${active ? ' active' : ''}`}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 1.8} style={{ flexShrink: 0 }} />
              <span className="link-label">{item.label}</span>
              {active && <ChevronRight size={11} style={{ flexShrink: 0, opacity: 0.6 }} />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'rgba(77,142,240,0.2)', color: 'var(--accent)' }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.name}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleLogout}
            className="sidebar-link flex-1"
            style={{ border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}
            aria-label="Sair do sistema"
          >
            <LogOut size={13} />
            <span className="link-label">Sair</span>
          </button>
          <button
            onClick={toggle}
            className="sidebar-link shrink-0"
            style={{ border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>

      {/* Sidebar desktop — 192px fixo em md+ */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{ width: '192px', background: 'var(--bg-sidebar)', boxShadow: '2px 0 8px rgba(0,0,0,0.3)' }}
        aria-label="Menu de navegação"
      >
        {sidebarContent}
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar mobile — slide-in */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-sidebar)', boxShadow: '4px 0 24px rgba(0,0,0,0.5)' }}
        aria-label="Menu de navegação"
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 rounded-lg p-1.5 transition-colors"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          aria-label="Fechar menu"
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar mobile */}
        <header
          className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <img
            src="/logo.jpg"
            alt="Colégio Santa Paula"
            className="w-8 h-8 object-contain rounded-lg bg-white p-0.5"
          />
          <span className="flex-1 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Portal de Chamados
          </span>
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Conteúdo da página */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer global */}
        <footer
          className="shrink-0"
          style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)', padding: '10px 24px' }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>
              © 2026 <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Colégio Santa Paula</span>
              {' '}· Portal de Chamados · Todos os direitos reservados
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>
              Desenvolvido por{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>Ronaldo Vasconcelos</span>
              {' '}· v1.0
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
