import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';

/**
 * Centraliza as notificações WhatsApp de chamados.
 * Toda interação (abertura, mudança de status, atribuição, comentário) dispara
 * uma mensagem para os interessados. Tudo é fire-and-forget: uma falha no
 * WhatsApp nunca interrompe a operação principal do chamado.
 */

const STATUS_LABELS: Record<string, string> = {
  ABERTO: 'Aberto',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  REJEITADO: 'Rejeitado',
};

interface TicketRef {
  id: string;
  title: string;
  category: string;
  urgency: string;
  requesterId: string;
}

/** Envia a mesma mensagem para vários telefones, ignorando os nulos. */
async function notifyPhones(phones: Array<string | null | undefined>, text: string): Promise<void> {
  const seen = new Set<string>();
  for (const phone of phones) {
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    await sendWhatsApp(phone, text);
  }
}

/** Telefones de todos os admins/gestores ativos. */
async function getApproverPhones(): Promise<Array<string | null>> {
  const approvers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
    select: { phone: true },
  });
  return approvers.map((a) => a.phone);
}

/** Notificação de abertura de chamado. */
export async function notifyTicketCreated(
  ticket: TicketRef,
  requesterName: string,
  requesterPhone: string | null | undefined,
): Promise<void> {
  // Confirmação para o solicitante
  const requesterMsg = `📋 Seu chamado foi aberto com sucesso!\n*${ticket.title}*\nCategoria: ${ticket.category}\nUrgência: ${ticket.urgency}\nVocê será avisado a cada atualização.`;
  await sendWhatsApp(requesterPhone, requesterMsg);

  // Alerta para admins/gestores
  const approverMsg = `📋 Novo chamado aberto!\n*${ticket.title}*\nCategoria: ${ticket.category}\nUrgência: ${ticket.urgency}\nSolicitante: ${requesterName}`;
  await notifyPhones(await getApproverPhones(), approverMsg);
}

/** Notificação de mudança de status (cobre todas as transições, incluindo cancelamento). */
export async function notifyStatusChanged(ticket: TicketRef, newStatus: string): Promise<void> {
  const requester = await prisma.user.findUnique({
    where: { id: ticket.requesterId },
    select: { phone: true },
  });

  const label = STATUS_LABELS[newStatus] ?? newStatus;
  const detail: Record<string, string> = {
    APROVADO: 'Em breve será atendido.',
    REJEITADO: 'Entre em contato para mais informações.',
    EM_ANDAMENTO: 'Já estamos trabalhando nele.',
    CONCLUIDO: 'Qualquer dúvida, abra um novo chamado.',
    CANCELADO: 'Caso precise, abra um novo chamado.',
  };
  const icon: Record<string, string> = {
    APROVADO: '✅', REJEITADO: '❌', EM_ANDAMENTO: '🔧', CONCLUIDO: '✅', CANCELADO: '🚫',
  };

  const msg = `${icon[newStatus] ?? '🔔'} Status do seu chamado: *${label}*\n*${ticket.title}*${detail[newStatus] ? `\n${detail[newStatus]}` : ''}`;
  await sendWhatsApp(requester?.phone, msg);
}

/** Notificação de atribuição/remoção de responsável. */
export async function notifyAssigned(
  ticket: TicketRef,
  assigneeName: string | null | undefined,
): Promise<void> {
  const requester = await prisma.user.findUnique({
    where: { id: ticket.requesterId },
    select: { phone: true },
  });

  const msg = assigneeName
    ? `👤 Seu chamado foi atribuído a *${assigneeName}*.\n*${ticket.title}*`
    : `👤 O responsável pelo seu chamado foi removido.\n*${ticket.title}*`;
  await sendWhatsApp(requester?.phone, msg);
}

/**
 * Notificação de novo comentário. Avisa a "outra parte":
 * se quem comentou foi o solicitante, avisa os admins/gestores;
 * se foi um privilegiado, avisa o solicitante.
 */
export async function notifyComment(
  ticket: TicketRef,
  message: string,
  authorName: string,
  authorIsPrivileged: boolean,
): Promise<void> {
  const snippet = message.length > 200 ? `${message.slice(0, 197)}...` : message;
  const text = `💬 Nova mensagem no chamado:\n*${ticket.title}*\n${authorName}: ${snippet}`;

  if (authorIsPrivileged) {
    const requester = await prisma.user.findUnique({
      where: { id: ticket.requesterId },
      select: { phone: true },
    });
    await sendWhatsApp(requester?.phone, text);
  } else {
    await notifyPhones(await getApproverPhones(), text);
  }
}
