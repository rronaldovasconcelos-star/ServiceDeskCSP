import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optional('PORT', '3001'), 10),
  jwtSecret: optional('JWT_SECRET', 'change-me-in-production-super-secret-key'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  nodeEnv: optional('NODE_ENV', 'development'),

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
};
