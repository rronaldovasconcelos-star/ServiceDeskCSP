import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';
import { MessageInput } from '../../services/whatsapp/types.js';
import {
  tplChamadoAberto,
  tplChamadoAtribuido,
  tplChamadoComentario,
  tplChamadoNovoGestor,
  tplChamadoStatus,
} from '../../services/whatsapp/templates.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';

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

/**
 * Envia a mesma mensagem para vários telefones, deduplicando pelo número
 * normalizado (+55DDN...) — evita duplicar quando o mesmo WhatsApp está gravado
 * em formatos diferentes (ex.: "5531..." e "+5531...").
 */
async function notifyPhones(phones: Array<string | null | undefined>, message: MessageInput): Promise<void> {
  const seen = new Set<string>();
  for (const phone of phones) {
    if (!phone) continue;
    const key = normalizeBrazilPhone(phone) ?? phone;
    if (seen.has(key)) continue;
    seen.add(key);
    await sendWhatsApp(phone, message);
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
  await sendWhatsApp(requesterPhone, tplChamadoAberto(ticket.title, ticket.category, ticket.urgency));

  // Alerta para admins/gestores
  const approverMsg = tplChamadoNovoGestor(ticket.title, ticket.category, ticket.urgency, requesterName);
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

  const msg = tplChamadoStatus(ticket.title, label, icon[newStatus] ?? '🔔', detail[newStatus] ?? '');
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

  await sendWhatsApp(requester?.phone, tplChamadoAtribuido(ticket.title, assigneeName));
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
  const text = tplChamadoComentario(ticket.title, authorName, snippet);

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
