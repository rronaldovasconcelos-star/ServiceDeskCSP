import { prisma } from '../../lib/prisma.js';
import { maintenanceSelect, generateTicketFromMaintenance, advanceMaintenance } from './maintenances.service.js';
import { notifyMaintenanceReminder, notifyMaintenanceDue } from './maintenances.notifications.js';

const TICK_MS = 60_000; // checa a cada 60s
const DAY_MS = 24 * 60 * 60 * 1000;

let running = false; // trava anti-overlap entre ticks

/**
 * Um ciclo do scheduler:
 * 1. Vencidas (nextRunAt <= agora, ACTIVE): gera o chamado, avisa e avança
 *    (pontual → DONE; recorrente → reagenda a próxima ocorrência).
 * 2. Lembretes (ACTIVE, reminderSent=false, leadDays>0): se a antecedência já
 *    começou e ainda não venceu, envia o lembrete e marca reminderSent.
 */
export async function runMaintenanceTick(now: Date = new Date()): Promise<void> {
  // 1) Vencidas
  const due = await prisma.scheduledMaintenance.findMany({
    where: { status: 'ACTIVE', nextRunAt: { lte: now } },
    select: maintenanceSelect,
  });

  for (const m of due) {
    try {
      const ticket = await generateTicketFromMaintenance({
        id: m.id, name: m.name, description: m.description, urgency: m.urgency,
        createdById: m.createdBy.id, responsavelId: m.responsavel.id,
      });
      await notifyMaintenanceDue(
        {
          name: m.name, description: m.description, urgency: m.urgency,
          recurrence: m.recurrence, nextRunAt: m.nextRunAt,
          responsavel: { name: m.responsavel.name, phone: m.responsavel.phone },
        },
        ticket.title,
      );
      // Mantém a cadência a partir do prazo previsto, pulando para a próxima
      // ocorrência futura (evita rajada se estiver muito atrasada).
      await advanceMaintenance({ id: m.id, recurrence: m.recurrence }, m.nextRunAt, ticket.id, now);
    } catch (err) {
      console.error(`[maintenance-scheduler] falha ao processar vencida ${m.id}:`, err);
    }
  }

  // 2) Lembretes de antecedência
  const pending = await prisma.scheduledMaintenance.findMany({
    where: { status: 'ACTIVE', reminderSent: false, leadDays: { gt: 0 } },
    select: maintenanceSelect,
  });

  for (const m of pending) {
    const reminderAt = new Date(m.nextRunAt.getTime() - m.leadDays * DAY_MS);
    if (now >= reminderAt && now < m.nextRunAt) {
      try {
        await notifyMaintenanceReminder({
          name: m.name, description: m.description, urgency: m.urgency,
          recurrence: m.recurrence, nextRunAt: m.nextRunAt,
          responsavel: { name: m.responsavel.name, phone: m.responsavel.phone },
        });
        await prisma.scheduledMaintenance.update({ where: { id: m.id }, data: { reminderSent: true } });
      } catch (err) {
        console.error(`[maintenance-scheduler] falha ao enviar lembrete ${m.id}:`, err);
      }
    }
  }
}

async function tick(): Promise<void> {
  if (running) return; // não sobrepõe ticks
  running = true;
  try {
    await runMaintenanceTick();
  } catch (err) {
    console.error('[maintenance-scheduler] erro no tick:', err);
  } finally {
    running = false;
  }
}

/** Inicia o scheduler: executa uma vez no boot e depois a cada 60s. */
export function initMaintenanceScheduler(): void {
  console.log('[maintenance-scheduler] ativo (checa a cada 60s)');
  void tick();
  const handle = setInterval(() => void tick(), TICK_MS);
  handle.unref?.(); // não impede o processo de encerrar
}
