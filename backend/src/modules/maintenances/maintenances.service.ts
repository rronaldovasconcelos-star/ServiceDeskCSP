import { prisma } from '../../lib/prisma.js';

export const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const MAINTENANCE_URGENCIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

/**
 * Avança uma data conforme a recorrência. `NONE` retorna a mesma data (não
 * reagenda). Meses usam setMonth, que ajusta o overflow de dia automaticamente
 * (ex.: 31/jan + 1 mês → 28/fev).
 */
export function addInterval(date: Date, recurrence: Recurrence): Date {
  const d = new Date(date);
  switch (recurrence) {
    case 'DAILY': d.setDate(d.getDate() + 1); break;
    case 'WEEKLY': d.setDate(d.getDate() + 7); break;
    case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3); break;
    case 'SEMIANNUAL': d.setMonth(d.getMonth() + 6); break;
    case 'ANNUAL': d.setFullYear(d.getFullYear() + 1); break;
    case 'NONE': default: break;
  }
  return d;
}

export const maintenanceSelect = {
  id: true,
  name: true,
  description: true,
  urgency: true,
  recurrence: true,
  nextRunAt: true,
  leadDays: true,
  reminderSent: true,
  status: true,
  lastTicketId: true,
  createdAt: true,
  updatedAt: true,
  responsavel: { select: { id: true, name: true, email: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
};

type MaintenanceForTicket = {
  id: string;
  name: string;
  description: string;
  urgency: string;
  createdById: string;
  responsavelId: string;
};

/**
 * Gera o chamado a partir de uma manutenção vencida. Cria o Ticket direto
 * (categoria MANUTENCAO, status ABERTO = backlog) já atribuído ao responsável —
 * NÃO usa createTicketForUser para controlar o assignee e evitar o aviso padrão
 * (o aviso de vencimento é o notifyMaintenanceDue). Registra o histórico.
 */
export async function generateTicketFromMaintenance(m: MaintenanceForTicket) {
  const ticket = await prisma.ticket.create({
    data: {
      title: `Manutenção: ${m.name}`,
      description: m.description,
      category: 'MANUTENCAO',
      urgency: m.urgency,
      status: 'ABERTO',
      requesterId: m.createdById,
      assigneeId: m.responsavelId,
    },
    select: { id: true, title: true, category: true, urgency: true },
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId: ticket.id,
      authorId: m.createdById,
      type: 'STATUS_CHANGE',
      message: 'Chamado aberto automaticamente — manutenção programada',
      toStatus: 'ABERTO',
    },
  });

  return ticket;
}

/**
 * Calcula a próxima ocorrência ESTRITAMENTE no futuro (> reference), a partir de
 * `base`, somando intervalos. Evita rajada de chamados quando uma recorrente está
 * muito atrasada (ex.: servidor desligado por dias): reagenda num passo só. O cap
 * é só uma salvaguarda contra loop infinito.
 */
export function nextFutureRun(base: Date, recurrence: Recurrence, reference: Date): Date {
  let next = addInterval(base, recurrence);
  let guard = 0;
  while (next <= reference && guard < 10_000) {
    next = addInterval(next, recurrence);
    guard++;
  }
  return next;
}

/**
 * Após gerar o chamado, avança a manutenção: pontual (NONE) vira DONE; recorrente
 * reagenda `nextRunAt` para a próxima ocorrência futura (a partir de `base`) e zera
 * o lembrete. Sempre grava o `lastTicketId`. Usado pelo scheduler e pelo "gerar agora".
 */
export async function advanceMaintenance(
  m: { id: string; recurrence: string },
  base: Date,
  ticketId: string,
  now: Date = new Date(),
) {
  if (m.recurrence === 'NONE') {
    return prisma.scheduledMaintenance.update({
      where: { id: m.id },
      data: { status: 'DONE', lastTicketId: ticketId },
    });
  }
  return prisma.scheduledMaintenance.update({
    where: { id: m.id },
    data: {
      nextRunAt: nextFutureRun(base, m.recurrence as Recurrence, now),
      reminderSent: false,
      lastTicketId: ticketId,
    },
  });
}
