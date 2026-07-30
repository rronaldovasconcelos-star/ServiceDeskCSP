import 'dotenv/config';
import app from './app.js';
import { env } from './config/env.js';
import { initMaintenanceScheduler } from './modules/maintenances/maintenances.scheduler.js';
import { initReminderScheduler } from './modules/reminders/reminders.scheduler.js';
import { initBackupScheduler } from './modules/backup/backup.scheduler.js';
import { initHoleriteScheduler } from './modules/holerites/holerites.scheduler.js';

/**
 * Avisa no boot se o canal WhatsApp está mal configurado. Notificação é
 * fire-and-forget: sem isso, uma env faltando só apareceria quando alguém
 * reclamasse de não ter recebido a mensagem.
 */
function checkWhatsAppConfig(): void {
  if (env.whatsappProvider === 'cloud') {
    const faltando = [
      !env.cloudApiPhoneNumberId && 'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
      !env.cloudApiToken && 'WHATSAPP_CLOUD_TOKEN',
    ].filter(Boolean);
    if (faltando.length) {
      console.error(
        `[WhatsApp] provider=cloud mas faltam ${faltando.join(', ')} — ` +
          'as mensagens vão apenas para o log (mock). Ver docs/whatsapp-cloud-api.md.',
      );
    } else {
      console.log('[WhatsApp] canal oficial (Cloud API) ativo.');
    }
  } else if (env.whatsappProvider === 'evolution' && !env.evolutionApiUrl) {
    console.error('[WhatsApp] provider=evolution mas EVOLUTION_API_URL está vazio — caindo no mock.');
  } else if (env.whatsappProvider === 'mock') {
    console.warn('[WhatsApp] provider=mock — nenhuma mensagem será entregue de verdade.');
  }
}

app.listen(env.port, () => {
  console.log(`[server] Running on http://localhost:${env.port} (${env.nodeEnv})`);
  checkWhatsAppConfig();
  // Schedulers ficam no server (não no app) para não rodar em testes que importam o app.
  if (env.maintenanceSchedulerEnabled) {
    initMaintenanceScheduler();
  }
  if (env.reminderSchedulerEnabled) {
    initReminderScheduler();
  }
  if (env.backupSchedulerEnabled) {
    initBackupScheduler();
  }
  initHoleriteScheduler();
});
