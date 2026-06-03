import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const isProduction = optional('NODE_ENV', 'development') === 'production';

// Valor default histórico do JWT_SECRET — rejeitado em produção para impedir que
// tokens sejam forjados com um segredo público conhecido.
const INSECURE_JWT_DEFAULT = 'change-me-in-production-super-secret-key';

/**
 * Lê um segredo que NÃO pode ficar no valor default em produção. Em dev usa o
 * fallback; em produção, exige um valor próprio e aborta o boot se ausente ou
 * igual ao default inseguro.
 */
function requiredSecretInProd(key: string, devFallback: string): string {
  const value = process.env[key];
  if (isProduction) {
    if (!value) throw new Error(`Missing required env variable in production: ${key}`);
    if (value === devFallback) {
      throw new Error(`${key} está com o valor default inseguro — defina um segredo próprio em produção.`);
    }
    return value;
  }
  return value ?? devFallback;
}

export const env = {
  port: parseInt(optional('PORT', '3001'), 10),
  jwtSecret: requiredSecretInProd('JWT_SECRET', INSECURE_JWT_DEFAULT),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  nodeEnv: optional('NODE_ENV', 'development'),

  // Origens permitidas pelo CORS em produção (CSV). Em desenvolvimento qualquer
  // origem é liberada (ver app.ts). Default = domínio oficial do portal.
  corsOrigins: optional('CORS_ALLOWED_ORIGINS', 'https://servicedeskcsp.com.br')
    .split(',').map((s) => s.trim()).filter(Boolean),

  // Scheduler de manutenções programadas (gera chamados no vencimento)
  maintenanceSchedulerEnabled: optional('MAINTENANCE_SCHEDULER_ENABLED', 'true') === 'true',

  // Auto-cadastro / OTP
  otpExpiresMinutes: parseInt(optional('OTP_EXPIRES_MINUTES', '10'), 10),
  allowSelfRegistration: optional('ALLOW_SELF_REGISTRATION', 'true') === 'true',

  // Seed
  seedAdminEmail: optional('SEED_ADMIN_EMAIL', 'admin@santiagopaula.com.br'),
  seedAdminPassword: optional('SEED_ADMIN_PASSWORD', 'Admin@123'),
  seedAdminName: optional('SEED_ADMIN_NAME', 'Administrador'),

  // WhatsApp (Evolution API)
  whatsappProvider: optional('WHATSAPP_PROVIDER', 'mock'), // 'evolution' | 'mock'
  evolutionApiUrl: optional('EVOLUTION_API_URL', ''),
  evolutionApiKey: optional('EVOLUTION_API_KEY', ''),
  evolutionInstance: optional('EVOLUTION_INSTANCE', ''),

  // Bot de suporte (recebe mensagens e abre chamados via WhatsApp)
  botEnabled: optional('BOT_ENABLED', 'false') === 'true',
  botWebhookSecret: optional('BOT_WEBHOOK_SECRET', ''),
  // Números que o bot NUNCA deve atender (ex: outros bots no mesmo WhatsApp/Evolution),
  // para evitar loops bot-a-bot. CSV de números; normalizados na comparação.
  // Default inclui a Sofia (admissões) — 5531988031221.
  botIgnoredNumbers: (optional('BOT_IGNORED_NUMBERS', '') + ',553188031221')
    .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean),
  // Instância Evolution dedicada ao bot de suporte. Vazio = reusa a de notificações.
  supportEvolutionInstance: optional('SUPPORT_EVOLUTION_INSTANCE', '') || optional('EVOLUTION_INSTANCE', ''),
  // Anthropic Claude — classificação de chamados a partir de texto livre
  anthropicApiKey: optional('ANTHROPIC_API_KEY', ''),
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-haiku-4-5'),

  // Agente IA (Sofia) — Central de Comando. Proxy para a API admin do bot.
  agentAdminUrl: optional('AGENT_ADMIN_URL', ''),        // ex: http://IP_DO_VPS:3001
  agentAdminSecret: optional('AGENT_ADMIN_SECRET', ''),  // = WEBHOOK_SECRET do bot

  // Uploads (Repositório de arquivos)
  uploadDir: optional('UPLOAD_DIR', 'uploads'),
  maxFileSizeMb: parseInt(optional('MAX_FILE_SIZE_MB', '100'), 10),
  storageProvider: optional('STORAGE_PROVIDER', 'local'), // 'local' | 'google-drive'

  // Google Drive — OAuth2 (usado quando STORAGE_PROVIDER=google-drive)
  googleDriveRootFolderId: optional('GOOGLE_DRIVE_ROOT_FOLDER_ID', ''),
  googleOauthClientId: optional('GOOGLE_OAUTH_CLIENT_ID', ''),
  googleOauthClientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET', ''),
  googleOauthRefreshToken: optional('GOOGLE_OAUTH_REFRESH_TOKEN', ''),

  // Login com Google (Google Identity Services). Client ID tipo "Web" cujo
  // token é validado como audience. Pode ser o mesmo do Drive se for Web.
  googleLoginClientId: optional('GOOGLE_LOGIN_CLIENT_ID', '') || optional('GOOGLE_OAUTH_CLIENT_ID', ''),
};
