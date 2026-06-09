import 'dotenv/config';
import app from './app.js';
import { env } from './config/env.js';
import { initMaintenanceScheduler } from './modules/maintenances/maintenances.scheduler.js';
import { initReminderScheduler } from './modules/reminders/reminders.scheduler.js';
import { initBackupScheduler } from './modules/backup/backup.scheduler.js';

app.listen(env.port, () => {
  console.log(`[server] Running on http://localhost:${env.port} (${env.nodeEnv})`);
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
});
