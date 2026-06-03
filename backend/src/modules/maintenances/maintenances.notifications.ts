import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';

/**
 * Notificações WhatsApp das manutenções programadas. Tudo fire-and-forget: uma
 * falha no WhatsApp nunca interrompe o cadastro nem o scheduler.
 */

const RECURRENCE_LABELS: Record<string, string> = {
  NONE: 'Pontual',
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

interface MaintenanceRef {
  name: string;
  description: string;
  urgency: string;
  recurrence: string;
  nextRunAt: Date;
  responsavel: { name: string; phone: string | null };
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Telefones do responsável + admins/gestores ativos, deduplicados. */
async function recipients(responsavelPhone: string | null): Promise<Array<string | null>> {
  const approvers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
    select: { phone: true },
  });
  return [responsavelPhone, ...approvers.map((a) => a.phone)];
}

/**
 * Envia a mesma mensagem para vários telefones, deduplicando pelo número
 * normalizado (+55DDN...). Sem isso, o mesmo WhatsApp gravado em formatos
 * diferentes (ex.: "5531..." e "+5531...") receberia a mensagem duplicada.
 */
async function notifyPhones(phones: Array<string | null>, text: string): Promise<void> {
  const seen = new Set<string>();
  for (const phone of phones) {
    if (!phone) continue;
    const key = normalizeBrazilPhone(phone) ?? phone;
    if (seen.has(key)) continue;
    seen.add(key);
    await sendWhatsApp(phone, text);
  }
}

/** Aviso de cadastro da manutenção programada. */
export async function notifyMaintenanceCreated(m: MaintenanceRef): Promise<void> {
  const text =
    `🗓️ Manutenção programada cadastrada!\n` +
    `*${m.name}*\n` +
    `Recorrência: ${RECURRENCE_LABELS[m.recurrence] ?? m.recurrence}\n` +
    `Início: ${fmtDate(m.nextRunAt)}\n` +
    `Responsável: ${m.responsavel.name}`;
  await notifyPhones(await recipients(m.responsavel.phone), text);
}

/** Lembrete de antecedência (X dias antes do início). */
export async function notifyMaintenanceReminder(m: MaintenanceRef): Promise<void> {
  const text =
    `⏰ Lembrete: manutenção se aproxima!\n` +
    `*${m.name}*\n` +
    `Início previsto: ${fmtDate(m.nextRunAt)}\n` +
    `Responsável: ${m.responsavel.name}`;
  await notifyPhones(await recipients(m.responsavel.phone), text);
}

/** Aviso de vencimento — o chamado foi aberto no backlog. */
export async function notifyMaintenanceDue(m: MaintenanceRef, ticketTitle: string): Promise<void> {
  const text =
    `🔧 Manutenção iniciada — chamado aberto!\n` +
    `*${ticketTitle}*\n` +
    `Urgência: ${m.urgency}\n` +
    `Responsável: ${m.responsavel.name}\n` +
    `O chamado já está no quadro para atendimento.`;
  await notifyPhones(await recipients(m.responsavel.phone), text);
}
