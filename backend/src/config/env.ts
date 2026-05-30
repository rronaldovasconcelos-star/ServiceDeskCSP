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
