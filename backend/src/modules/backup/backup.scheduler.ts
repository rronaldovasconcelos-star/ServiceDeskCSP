import { env } from '../../config/env.js';
import { isBackupConfigured, createBackup, listBackups } from './backup.service.js';

const TICK_MS = 10 * 60_000; // checa a cada 10 min

let running = false; // trava anti-overlap entre ticks

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Um ciclo do scheduler de backup:
 * roda o backup diário quando chega a hora configurada (BACKUP_HOUR) e ainda não
 * houve nenhum backup no dia de hoje. A verificação usa o backup mais recente no
 * Drive como fonte da verdade — assim sobrevive a reinícios do container sem
 * duplicar (idempotente por dia).
 */
export async function runBackupTick(now: Date = new Date()): Promise<void> {
  if (now.getHours() < env.backupHour) return;

  const backups = await listBackups();
  const latest = backups[0];
  if (latest && sameDay(new Date(latest.createdAt), now)) return; // já tem backup hoje

  const created = await createBackup();
  console.log(`[backup-scheduler] backup diário criado: ${created.name}`);
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runBackupTick();
  } catch (err) {
    console.error('[backup-scheduler] erro no tick:', err);
  } finally {
    running = false;
  }
}

/** Inicia o scheduler de backup automático (checa a cada 10 min). */
export function initBackupScheduler(): void {
  if (!isBackupConfigured()) {
    console.log('[backup-scheduler] inativo (Google Drive não configurado)');
    return;
  }
  console.log(`[backup-scheduler] ativo (backup diário às ${env.backupHour}h, retenção ${env.backupRetention})`);
  void tick();
  const handle = setInterval(() => void tick(), TICK_MS);
  handle.unref?.(); // não impede o processo de encerrar
}
