import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { canAccess } from '../lib/modules';
import DevCredit from './DevCredit';
import {
  LayoutDashboard,
  BarChart3,
  Ticket,
  PlusCircle,
  Package,
  BookOpen,
  FolderOpen,
  HardDrive,
  Users,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  MessageSquare,
  Bot,
  Headset,
  CalendarClock,
  Bell,
  DatabaseBackup,
  Receipt,
  BriefcaseBusiness,
} from 'lucide-react';

// `module` = chave do módulo que controla o acesso ao item. Itens sem `module`
// são baseline (todo usuário autenticado vê). Ver lib/modules.ts (canAccess).
const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, module: 'relatorios' },
  { to: '/tickets', label: 'Chamados', icon: Ticket },
  { to: '/tickets/new', label: 'Novo chamado', icon: PlusCircle },
  { to: '/suprimentos', label: 'Suprimentos', icon: Package },
  { to: '/suprimentos/catalogo', label: 'Catálogo', icon: BookOpen, module: 'catalogo' },
  { to: '/manutencoes', label: 'Manutenções', icon: CalendarClock, module: 'manutencoes' },
  { to: '/lembretes', label: 'Lembretes', icon: Bell, module: 'lembretes' },
  { to: '/arquivos', label: 'Meus arquivos', icon: FolderOpen },
  { to: '/holerites', label: 'Meus holerites', icon: Receipt },
  { to: '/holerites/rh', label: 'RH · Holerites', icon: BriefcaseBusiness, module: 'rh' },
  { to: '/repositorio', label: 'Repositório', icon: HardDrive, module: 'repositorio' },
  { to: '/users', label: 'Usuários', icon: Users, module: 'users' },
  { to: '/backups', label: 'Backups', icon: DatabaseBackup, module: 'backups' },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, module: 'whatsapp' },
  { to: '/whatsapp-suporte', label: 'Bot de suporte', icon: Headset, module: 'bot' },
  { to: '/agente', label: 'Agente IA', icon: Bot, module: 'agente' },
];

const SIDEBAR_WIDTH = 232;

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fecha a gaveta ao navegar (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fecha a gaveta com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Trava o scroll do fundo com a gaveta aberta
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const filteredNav = navItems.filter((item) => !item.module || canAccess(user, item.module));

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4" style={{ borderBottom: '1px solid var(--navy-line)' }}>
        <img
          src="/logo.png"
          alt="Colégio Santa Paula"
          className="w-11 h-11 object-contain bg-white p-0.5"
          style={{ borderRadius: 'var(--radius-tile)' }}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--on-navy)', margin: 0 }}>
            Colégio Santa Paula
          </p>
          <p className="text-xs leading-tight" style={{ color: 'var(--sky)', margin: '2px 0 0', fontWeight: 500 }}>
            Portal de Chamados
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-1 overflow-y-auto" aria-label="Navegação principal">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`sidebar-link${active ? ' active' : ''}`}
            >
              <span className="link-tile"><Icon size={15} strokeWidth={2} /></span>
              <span className="link-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Usuário */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--navy-line)' }}>
        <div className="flex items-center gap-2 mb-2 px-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'var(--electric)', color: 'var(--on-navy)' }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--on-navy)', margin: 0 }}>
              {user?.name}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--on-navy-muted)', margin: 0 }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleLogout} className="sidebar-link flex-1" aria-label="Sair do sistema">
            <span className="link-tile"><LogOut size={14} /></span>
            <span className="link-label">Sair</span>
          </button>
          <button
            onClick={toggle}
            className="sidebar-link shrink-0"
            style={{ padding: '7px 8px' }}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            <span className="link-tile">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>

      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-0 h-screen"
        style={{ width: SIDEBAR_WIDTH, background: 'var(--navy)' }}
        aria-label="Menu de navegação"
      >
        {sidebarContent}
      </aside>

      {/* Fundo escurecido (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Gaveta mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--navy)', boxShadow: 'var(--shadow-navy)' }}
        aria-label="Menu de navegação"
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-3 p-1.5"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-navy-muted)' }}
          aria-label="Fechar menu"
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Barra de topo (mobile) */}
        <header
          className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: 'var(--navy)', color: 'var(--on-navy)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-navy)' }}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <img
            src="/logo.png"
            alt="Colégio Santa Paula"
            className="w-8 h-8 object-contain bg-white p-0.5"
            style={{ borderRadius: 'var(--radius-tile)' }}
          />
          <span className="flex-1 text-sm font-semibold">Portal de Chamados</span>
          <button
            onClick={toggle}
            className="p-1.5"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-navy)' }}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Conteúdo */}
        <div className="flex-1">
          {children}
        </div>

        {/* Rodapé */}
        <footer className="shrink-0" style={{ borderTop: '1px solid var(--border)', padding: '10px 24px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>
              © 2026 <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Colégio Santa Paula</span>
              {' '}· Portal de Chamados · Todos os direitos reservados
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>
              <DevCredit variant="onSurface" />
              {' '}· v2.0
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
