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

  // Scheduler de lembretes de material (avisa professores via WhatsApp)
  reminderSchedulerEnabled: optional('REMINDER_SCHEDULER_ENABLED', 'true') === 'true',

  // Backup automático para o Google Drive
  backupSchedulerEnabled: optional('BACKUP_SCHEDULER_ENABLED', 'true') === 'true',
  backupHour: parseInt(optional('BACKUP_HOUR', '3'), 10),        // hora local do servidor (0-23)
  backupRetention: parseInt(optional('BACKUP_RETENTION', '30'), 10), // qtd de backups mantidos no Drive

  // Auto-cadastro / OTP
  otpExpiresMinutes: parseInt(optional('OTP_EXPIRES_MINUTES', '10'), 10),
  allowSelfRegistration: optional('ALLOW_SELF_REGISTRATION', 'true') === 'true',

  // Seed
  seedAdminEmail: optional('SEED_ADMIN_EMAIL', 'admin@santiagopaula.com.br'),
  seedAdminPassword: optional('SEED_ADMIN_PASSWORD', 'Admin@123'),
  seedAdminName: optional('SEED_ADMIN_NAME', 'Administrador'),

  // WhatsApp (Evolution API)
  whatsappProvider: optional('WHATSAPP_PROVIDER', 'mock'), // 'cloud' | 'evolution' | 'mock'
  evolutionApiUrl: optional('EVOLUTION_API_URL', ''),
  evolutionApiKey: optional('EVOLUTION_API_KEY', ''),
  evolutionInstance: optional('EVOLUTION_INSTANCE', ''),

  // WhatsApp Business Cloud API (canal OFICIAL da Meta — usado quando
  // WHATSAPP_PROVIDER=cloud). Número não sofre ban por uso legítimo, mas toda
  // mensagem iniciada pelo negócio exige template aprovado.
  // Ver docs/whatsapp-cloud-api.md para como obter cada valor.
  cloudApiPhoneNumberId: optional('WHATSAPP_CLOUD_PHONE_NUMBER_ID', ''),
  cloudApiToken: optional('WHATSAPP_CLOUD_TOKEN', ''),
  cloudApiVersion: optional('WHATSAPP_CLOUD_API_VERSION', 'v23.0'),
  // App Secret do app da Meta — valida a assinatura do webhook (X-Hub-Signature-256).
  // Opcional: sem ele, o segredo na URL segue sendo a única barreira.
  cloudApiAppSecret: optional('WHATSAPP_CLOUD_APP_SECRET', ''),
  // WABA ID — necessário só para gerenciar templates (script provision-templates).
  cloudApiWabaId: optional('WHATSAPP_CLOUD_WABA_ID', ''),
  cloudApiTemplateLanguage: optional('WHATSAPP_CLOUD_TEMPLATE_LANG', 'pt_BR'),

  // Uploads (Repositório de arquivos)
  uploadDir: optional('UPLOAD_DIR', 'uploads'),
  maxFileSizeMb: parseInt(optional('MAX_FILE_SIZE_MB', '100'), 10),
  storageProvider: optional('STORAGE_PROVIDER', 'local'), // 'local' | 'google-drive'
  // URL pública da API, usada nos links `ms-word:ofe|u|...` do Office. Vazio =
  // deduz da própria requisição (protocolo + host, atrás do Traefik).
  publicApiUrl: optional('PUBLIC_API_URL', ''),

  // Google Drive — OAuth2 (usado quando STORAGE_PROVIDER=google-drive)
  googleDriveRootFolderId: optional('GOOGLE_DRIVE_ROOT_FOLDER_ID', ''),
  googleOauthClientId: optional('GOOGLE_OAUTH_CLIENT_ID', ''),
  googleOauthClientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET', ''),
  googleOauthRefreshToken: optional('GOOGLE_OAUTH_REFRESH_TOKEN', ''),

  // Login com Google (Google Identity Services). Client ID tipo "Web" cujo
  // token é validado como audience. Pode ser o mesmo do Drive se for Web.
  googleLoginClientId: optional('GOOGLE_LOGIN_CLIENT_ID', '') || optional('GOOGLE_OAUTH_CLIENT_ID', ''),

  // Holerites — cabeçalho do PDF (o TXT da folha traz o nome da empresa truncado
  // em 42 caracteres e não traz endereço) e importação automática do Drive.
  holeriteEmpresaNome: optional('HOLERITE_EMPRESA_NOME', 'SEBASTIANA CABRAL DE SOUSA PEREIRA - COLEGIO SANTA PAULA'),
  holeriteEmpresaEndereco: optional('HOLERITE_EMPRESA_ENDERECO', 'Rua Adelia Hilbert Teixeira, 421 - Bairro Diamante - Belo Horizonte'),
  // Pasta no Drive (dentro da raiz do portal) onde o RH deposita os TXT da folha.
  holeriteDriveFolder: optional('HOLERITE_DRIVE_FOLDER', 'Holerites'),
  // Importação automática: o portal olha a pasta a cada N minutos (0 = desligado).
  holeriteDriveIntervalMin: parseInt(optional('HOLERITE_DRIVE_INTERVAL_MIN', '30'), 10),
};
