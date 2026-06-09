import { prisma } from '../../lib/prisma.js';
import { reminderSelect, processReminder, type ReminderRecord } from './reminders.service.js';

const TICK_MS = 60_000; // checa a cada 60s
let running = false; // trava anti-overlap entre ticks

/**
 * Um ciclo: pega os lembretes vencidos (ACTIVE, nextRunAt <= agora) e processa
 * cada um (dispara WhatsApp só para quem não enviou e reagenda). Falha de um
 * lembrete não derruba o tick.
 */
export async function runReminderTick(now: Date = new Date()): Promise<void> {
  const due = (await prisma.materialReminder.findMany({
    where: { status: 'ACTIVE', nextRunAt: { lte: now } },
    select: reminderSelect,
  })) as unknown as ReminderRecord[];

  for (const r of due) {
    try {
      const sent = await processReminder(r, now);
      console.log(`[reminder-scheduler] "${r.name}": ${sent} aviso(s) enviado(s)`);
    } catch (err) {
      console.error(`[reminder-scheduler] falha ao processar ${r.id}:`, err);
    }
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runReminderTick();
  } catch (err) {
    console.error('[reminder-scheduler] erro no tick:', err);
  } finally {
    running = false;
  }
}

/** Inicia o scheduler: executa uma vez no boot e depois a cada 60s. */
export function initReminderScheduler(): void {
  console.log('[reminder-scheduler] ativo (checa a cada 60s)');
  void tick();
  const handle = setInterval(() => void tick(), TICK_MS);
  handle.unref?.();
}
