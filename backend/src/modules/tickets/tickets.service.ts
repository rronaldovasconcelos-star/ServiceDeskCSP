import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notifyTicketCreated } from './tickets.notifications.js';

export const TICKET_CATEGORIES = ['TI', 'MANUTENCAO', 'PEDAGOGICO', 'ADMINISTRATIVO', 'OUTROS'] as const;
export const TICKET_URGENCIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  urgency: TicketUrgency;
}

export const ticketSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  urgency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  requester: { select: { id: true, name: true, email: true, phone: true } },
  assignee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TicketSelect;

/**
 * Cria um chamado em nome de um usuário, registra o histórico de abertura e
 * dispara as notificações WhatsApp (solicitante + admins/gestores).
 * Usado tanto pelo endpoint HTTP quanto pelo bot de suporte do WhatsApp.
 */
export async function createTicketForUser(requesterId: string, data: CreateTicketInput) {
  const ticket = await prisma.ticket.create({
    data: { ...data, status: 'ABERTO', requesterId },
    select: ticketSelect,
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId: ticket.id,
      authorId: requesterId,
      type: 'STATUS_CHANGE',
      message: 'Chamado aberto',
      toStatus: 'ABERTO',
    },
  });

  // Notifica solicitante (confirmação) + admins/gestores
  await notifyTicketCreated(
    { id: ticket.id, title: ticket.title, category: ticket.category, urgency: ticket.urgency, requesterId: ticket.requester.id },
    ticket.requester.name,
    ticket.requester.phone,
  );

  return ticket;
}
