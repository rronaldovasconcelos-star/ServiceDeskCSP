import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { canAccess } from '../lib/modules';
import DevCredit from './DevCredit';
import {
  Home,
  LayoutDashboard,
  BarChart3,
  Ticket,
  Plus,
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
  Headset,
  CalendarClock,
  Bell,
  DatabaseBackup,
  Receipt,
  BriefcaseBusiness,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Chave do módulo que controla o acesso. Sem `module` = todo usuário autenticado vê. Ver lib/modules.ts. */
  module?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Navegação em grupos (Jira SM / Zendesk). "Novo chamado" vive na topbar, não aqui.
const navGroups: NavGroup[] = [
  {
    label: 'Atendimento',
    items: [
      { to: '/', label: 'Início', icon: Home },
      { to: '/tickets', label: 'Chamados', icon: Ticket },
      { to: '/suprimentos', label: 'Suprimentos', icon: Package },
      { to: '/suprimentos/catalogo', label: 'Catálogo', icon: BookOpen, module: 'catalogo' },
      { to: '/manutencoes', label: 'Manutenções', icon: CalendarClock, module: 'manutencoes' },
      { to: '/lembretes', label: 'Lembretes', icon: Bell, module: 'lembretes' },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { to: '/arquivos', label: 'Meus arquivos', icon: FolderOpen },
      { to: '/holerites', label: 'Meus holerites', icon: Receipt },
      { to: '/holerites/rh', label: 'RH · Holerites', icon: BriefcaseBusiness, module: 'rh' },
      { to: '/repositorio', label: 'Repositório', icon: HardDrive, module: 'repositorio' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/dashboard', label: 'Painel', icon: LayoutDashboard, module: 'dashboard' },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, module: 'relatorios' },
      { to: '/users', label: 'Usuários', icon: Users, module: 'users' },
      { to: '/backups', label: 'Backups', icon: DatabaseBackup, module: 'backups' },
    ],
  },
  {
    label: 'Automação',
    items: [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, module: 'whatsapp' },
      { to: '/whatsapp-suporte', label: 'Bot de suporte', icon: Headset, module: 'bot' },
    ],
  },
];

/**
 * Escolhe o item ativo pelo melhor prefixo: `/` só casa exato; para os demais,
 * vence o `to` mais longo que seja igual ao caminho ou prefixo de segmento dele.
 * Assim `/tickets/abc` → Chamados, `/suprimentos/catalogo` → Catálogo, `/holerites/rh` → RH.
 */
function bestMatch(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const { to } of items) {
    if (to === '/') {
      if (pathname === '/') return '/';
      continue;
    }
    const casa = pathname === to || pathname.startsWith(to + '/');
    if (casa && (best === null || to.length > best.length)) best = to;
  }
  return best;
}

const SIDEBAR_WIDTH = 240;
const DRAWER_WIDTH = 280;

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const estavaAberta = useRef(false);

  // Fecha a gaveta ao navegar (mobile) — ajuste de estado derivado, feito na
  // renderização (padrão recomendado pelo React em vez de setState em efeito).
  const [rotaAnterior, setRotaAnterior] = useState(location.pathname);
  if (rotaAnterior !== location.pathname) {
    setRotaAnterior(location.pathname);
    setSidebarOpen(false);
  }

  // Fecha a gaveta com Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Trava o scroll do fundo com a gaveta aberta e cuida do foco
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    if (sidebarOpen) {
      closeBtnRef.current?.focus();
      estavaAberta.current = true;
    } else if (estavaAberta.current) {
      estavaAberta.current = false;
      menuBtnRef.current?.focus();
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const gruposVisiveis = navGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.module || canAccess(user, item.module)) }))
    .filter((g) => g.items.length > 0);

  const todosItens = gruposVisiveis.flatMap((g) => g.items);
  const ativo = bestMatch(location.pathname, todosItens);

  const inicial = user?.name?.trim().charAt(0).toUpperCase() || '?';
  const temaLabel = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';

  const brand = (
    <Link to="/" className="sidebar-brand">
      <img src="/logo.png" alt="" />
      <div className="min-w-0">
        <p className="sidebar-brand-name truncate">Colégio Santa Paula</p>
        <p className="sidebar-brand-sub truncate">Central de Suporte</p>
      </div>
    </Link>
  );

  const nav = (
    <nav className="sidebar-nav" aria-label="Navegação principal">
      {gruposVisiveis.map((grupo) => (
        <div key={grupo.label}>
          <p className="sidebar-group">{grupo.label}</p>
          {grupo.items.map((item) => {
            const Icon = item.icon;
            const isActive = ativo === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`sidebar-link${isActive ? ' active' : ''}`}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span className="link-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const foot = <div className="sidebar-foot">v2.1</div>;

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>

      {/* Sidebar desktop */}
      <aside
        className="sidebar hidden md:flex shrink-0 sticky top-0 h-screen"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {brand}
        {nav}
        {foot}
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
        className={`sidebar fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: DRAWER_WIDTH, boxShadow: 'var(--shadow-lg)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="btn btn-ghost btn-icon absolute top-3 right-2"
          style={{ color: 'var(--on-navy)' }}
          aria-label="Fechar menu"
        >
          <X size={20} />
        </button>
        {brand}
        {nav}
        {foot}
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Barra de topo (todos os tamanhos) */}
        <header className="topbar">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="btn btn-ghost btn-icon md:hidden"
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <Menu size={22} />
          </button>
          <Link to="/" className="topbar-brand md:hidden">
            <img src="/logo.png" alt="" />
            <span className="truncate hidden min-[400px]:inline">Central de Suporte</span>
          </Link>
          <div className="topbar-spacer" />
          <Link to="/tickets/new" className="btn btn-primary" aria-label="Abrir chamado">
            <Plus size={16} />
            <span className="hidden min-[520px]:inline">Abrir chamado</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="btn btn-ghost btn-icon"
            aria-label={temaLabel}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="user-chip">
            <span className="user-chip-avatar" aria-hidden="true">{inicial}</span>
            <div className="hidden sm:block min-w-0">
              <p className="user-chip-name">{user?.name}</p>
              <p className="user-chip-sub">{user?.email}</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              aria-label="Sair do sistema"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <div id="conteudo" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>

        {/* Rodapé */}
        <footer className="shrink-0 border-t px-6 py-2.5" style={{ borderColor: 'var(--line)' }}>
          <div className="max-w-[1280px] mx-auto flex items-center justify-between flex-wrap gap-1">
            <p className="muted text-[11px]">
              © 2026 <span className="font-medium" style={{ color: 'var(--text)' }}>Colégio Santa Paula</span>
              {' '}· Central de Suporte · Todos os direitos reservados
            </p>
            <p className="muted text-[11px]">
              <DevCredit variant="onSurface" />
              {' '}· v2.1
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
