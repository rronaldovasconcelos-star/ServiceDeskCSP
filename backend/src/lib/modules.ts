/**
 * Catálogo canônico de módulos do portal e regra de acesso.
 *
 * BASELINE_MODULES: todo usuário autenticado já tem acesso (não precisam ser liberados).
 * MODULES: módulos "liberáveis" individualmente por usuário (hoje admin-only).
 *
 * ⚠️ Mantenha em sincronia com frontend/src/lib/modules.ts
 */
export const BASELINE_MODULES = ['tickets', 'suprimentos', 'arquivos'] as const;

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
] as const;

export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Faz o parse seguro do campo `modules` (string JSON) do User para um array de chaves. */
export function parseModules(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

/** Mantém apenas chaves de módulos válidas (descarta lixo). */
export function sanitizeModules(modules: string[]): string[] {
  const valid = new Set<string>(MODULE_KEYS);
  return [...new Set(modules.filter((m) => valid.has(m)))];
}
