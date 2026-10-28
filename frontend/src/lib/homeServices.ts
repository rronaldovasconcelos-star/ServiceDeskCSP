import type { LucideIcon } from 'lucide-react';
import {
  PlusCircle, Ticket, PackagePlus, Package, FolderOpen, Receipt, BookOpen,
  CalendarClock, Bell, HardDrive, BriefcaseBusiness, LayoutDashboard, BarChart3,
  Users, DatabaseBackup, MessageSquare, Headset,
} from 'lucide-react';
import { canAccess } from './modules';

export interface HomeService {
  key: string;
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Módulo exigido; sem ele, todo usuário autenticado vê o serviço. */
  module?: string;
  /** Ação principal da página inicial. */
  primary?: boolean;
}

/** Catálogo de serviços da página inicial, na ordem de exibição. */
export const HOME_SERVICES: HomeService[] = [
  { key: 'abrir-chamado', to: '/tickets/new', label: 'Abrir chamado', description: 'Suporte de TI, manutenção, pedagógico ou administrativo', icon: PlusCircle, primary: true },
  { key: 'meus-chamados', to: '/tickets', label: 'Meus chamados', description: 'Acompanhe status e responda à equipe', icon: Ticket },
  { key: 'pedir-suprimento', to: '/suprimentos/new', label: 'Pedir suprimento', description: 'Material de escritório, limpeza e pedagógico', icon: PackagePlus },
  { key: 'suprimentos', to: '/suprimentos', label: 'Pedidos de suprimentos', description: 'Veja o andamento dos seus pedidos', icon: Package },
  { key: 'arquivos', to: '/arquivos', label: 'Meus arquivos', description: 'Planejamentos, atividades e documentos no Drive', icon: FolderOpen },
  { key: 'holerites', to: '/holerites', label: 'Meus holerites', description: 'Baixe o seu demonstrativo mensal', icon: Receipt },
  { key: 'catalogo', to: '/suprimentos/catalogo', label: 'Catálogo', description: 'Itens disponíveis para pedido', icon: BookOpen, module: 'catalogo' },
  { key: 'manutencoes', to: '/manutencoes', label: 'Manutenções', description: 'Agenda de manutenções programadas', icon: CalendarClock, module: 'manutencoes' },
  { key: 'lembretes', to: '/lembretes', label: 'Lembretes', description: 'Avisos de material por WhatsApp', icon: Bell, module: 'lembretes' },
  { key: 'repositorio', to: '/repositorio', label: 'Repositório', description: 'Arquivos de toda a escola', icon: HardDrive, module: 'repositorio' },
  { key: 'rh', to: '/holerites/rh', label: 'RH · Holerites', description: 'Importar a folha e vincular colaboradores', icon: BriefcaseBusiness, module: 'rh' },
  { key: 'dashboard', to: '/dashboard', label: 'Painel', description: 'Indicadores de chamados e suprimentos', icon: LayoutDashboard, module: 'dashboard' },
  { key: 'relatorios', to: '/relatorios', label: 'Relatórios', description: 'Relatórios e exportações', icon: BarChart3, module: 'relatorios' },
  { key: 'users', to: '/users', label: 'Usuários', description: 'Contas, perfis e módulos', icon: Users, module: 'users' },
  { key: 'backups', to: '/backups', label: 'Backups', description: 'Cópias de segurança do portal', icon: DatabaseBackup, module: 'backups' },
  { key: 'whatsapp', to: '/whatsapp', label: 'WhatsApp', description: 'Conexão e envios', icon: MessageSquare, module: 'whatsapp' },
  { key: 'bot', to: '/whatsapp-suporte', label: 'Bot de suporte', description: 'Abertura de chamados pelo WhatsApp', icon: Headset, module: 'bot' },
];

type AccessUser = { role?: string; modules?: string[] } | null | undefined;

/** Serviços visíveis para o usuário: sem módulo exigido, ou com o módulo liberado. */
export function servicesFor(user: AccessUser): HomeService[] {
  return HOME_SERVICES.filter((s) => !s.module || canAccess(user, s.module));
}
