/**
 * Catálogo de módulos do portal e regra de acesso (espelho de backend/src/lib/modules.ts).
 *
 * BASELINE_MODULES: todo usuário autenticado já tem acesso.
 * MODULES: módulos liberáveis individualmente por usuário (admin marca na tela Usuários).
 *
 * ⚠️ Mantenha em sincronia com o backend.
 */
export const BASELINE_MODULES = ['tickets', 'suprimentos', 'arquivos'];

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'catalogo', label: 'Catálogo de Suprimentos' },
  { key: 'manutencoes', label: 'Manutenções' },
  { key: 'lembretes', label: 'Lembretes' },
  { key: 'repositorio', label: 'Repositório' },
  { key: 'users', label: 'Usuários' },
  { key: 'backups', label: 'Backups' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'bot', label: 'Bot Suporte' },
  { key: 'agente', label: 'Agente IA' },
];

type AccessUser = { role?: string; modules?: string[] } | null | undefined;

/**
 * Regra de acesso efetivo a um módulo:
 *  - ADMIN  → sempre true (superusuário)
 *  - módulo baseline → true p/ qualquer autenticado
 *  - senão  → true se estiver na lista de módulos liberados do usuário
 */
export function canAccess(user: AccessUser, moduleKey: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (BASELINE_MODULES.includes(moduleKey)) return true;
  return (user.modules ?? []).includes(moduleKey);
}
