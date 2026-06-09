import { prisma } from '../../lib/prisma.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { nextFutureRun, type Recurrence } from '../maintenances/maintenances.service.js';
import { labelFor } from '../files/taxonomy.js';

export const reminderSelect = {
  id: true,
  name: true,
  messageExtra: true,
  recurrence: true,
  nextRunAt: true,
  lastRunAt: true,
  status: true,
  anoLetivo: true,
  segmento: true,
  serie: true,
  etapa: true,
  disciplina: true,
  tipoMaterial: true,
  audience: true,
  recipientIds: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
};

export interface ReminderRecord {
  id: string;
  name: string;
  messageExtra: string | null;
  recurrence: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  status: string;
  anoLetivo: string | null;
  segmento: string | null;
  serie: string | null;
  etapa: string | null;
  disciplina: string | null;
  tipoMaterial: string | null;
  audience: string;
  recipientIds: string | null;
  createdAt: Date;
}

/**
 * Monta a mensagem do lembrete a partir da classificação preenchida. Só inclui os
 * eixos definidos; sem classificação, usa um texto genérico. `messageExtra` é
 * anexado quando presente.
 */
export function buildReminderMessage(r: ReminderRecord, nome: string): string {
  const partes: string[] = [];
  if (r.tipoMaterial) partes.push(labelFor('tipoMaterial', r.tipoMaterial));
  if (r.disciplina) partes.push(`de ${labelFor('disciplina', r.disciplina)}`);

  const contexto: string[] = [];
  if (r.segmento) contexto.push(labelFor('segmento', r.segmento));
  if (r.serie) contexto.push(labelFor('serie', r.serie));
  if (r.etapa) contexto.push(labelFor('etapa', r.etapa));
  if (r.anoLetivo) contexto.push(r.anoLetivo);

  let alvo = partes.join(' ');
  if (contexto.length) alvo += ` — ${contexto.join(' / ')}`;

  const linhas = [
    '📚 Lembrete de material',
    alvo
      ? `Olá ${nome}! Consta que você ainda não enviou: *${alvo}*.`
      : `Olá ${nome}! Lembrete para enviar seu material no portal.`,
  ];
  if (r.messageExtra && r.messageExtra.trim()) linhas.push(r.messageExtra.trim());
  linhas.push('Envie pelo portal: *Meus Arquivos*.');
  return linhas.join('\n');
}

/** Filtro de File a partir dos eixos NÃO nulos do lembrete (o que conta como "cumprido"). */
function classificationWhere(r: ReminderRecord): Record<string, string> {
  const w: Record<string, string> = {};
  if (r.anoLetivo) w.anoLetivo = r.anoLetivo;
  if (r.segmento) w.segmento = r.segmento;
  if (r.serie) w.serie = r.serie;
  if (r.etapa) w.etapa = r.etapa;
  if (r.disciplina) w.disciplina = r.disciplina;
  if (r.tipoMaterial) w.tipoMaterial = r.tipoMaterial;
  return w;
}

/**
 * Processa um lembrete: monta a audiência, descobre quem JÁ enviou material da
 * classificação no ciclo atual (desde lastRunAt ?? createdAt) e dispara WhatsApp
 * só para os faltantes (deduplicando por número normalizado). Por fim avança o
 * agendamento. Retorna quantas mensagens foram enviadas.
 *
 * `base` define a partir de quando recalcular o próximo disparo: o scheduler passa
 * `r.nextRunAt` (mantém cadência); o "disparar agora" passa `now`.
 */
export async function processReminder(r: ReminderRecord, now: Date, base: Date = r.nextRunAt): Promise<number> {
  // 1) Audiência (sempre ativos e com telefone)
  const where: Record<string, unknown> = { isActive: true, phone: { not: null } };
  if (r.audience === 'SELECTED') {
    let ids: string[] = [];
    try { ids = JSON.parse(r.recipientIds ?? '[]'); } catch { ids = []; }
    where.id = { in: ids };
  } else {
    where.role = 'USER'; // "todos os professores"
  }
  const audience = await prisma.user.findMany({ where, select: { id: true, name: true, phone: true } });

  let sent = 0;
  if (audience.length > 0) {
    // 2) Quem já cumpriu no ciclo
    const windowStart = r.lastRunAt ?? r.createdAt;
    const done = await (prisma as any).file.findMany({
      where: {
        ownerId: { in: audience.map((u) => u.id) },
        uploadedAt: { gte: windowStart },
        ...classificationWhere(r),
      },
      select: { ownerId: true },
    });
    const doneSet = new Set<string>(done.map((d: { ownerId: string }) => d.ownerId));

    // 3) Faltantes → WhatsApp (dedupe por número normalizado)
    const seen = new Set<string>();
    for (const u of audience) {
      if (doneSet.has(u.id) || !u.phone) continue;
      const key = normalizeBrazilPhone(u.phone) ?? u.phone;
      if (seen.has(key)) continue;
      seen.add(key);
      await sendWhatsApp(u.phone, buildReminderMessage(r, u.name));
      sent += 1;
    }
  }

  // 4) Avançar agendamento
  if (r.recurrence === 'NONE') {
    await prisma.materialReminder.update({ where: { id: r.id }, data: { status: 'DONE', lastRunAt: now } });
  } else {
    await prisma.materialReminder.update({
      where: { id: r.id },
      data: { nextRunAt: nextFutureRun(base, r.recurrence as Recurrence, now), lastRunAt: now },
    });
  }
  return sent;
}
