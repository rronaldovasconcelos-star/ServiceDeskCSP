import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import {
  createTicketForUser,
  TICKET_CATEGORIES,
  TICKET_URGENCIES,
  type TicketCategory,
  type TicketUrgency,
} from '../tickets/tickets.service.js';
import { generateOtp, verifyOtpCode } from '../auth/auth.controller.js';
import { sendBotReply } from '../bot/bot.sender.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';

/**
 * Ponte HTTP para o bot de suporte rodando no n8n. O n8n orquestra a conversa e
 * chama estes endpoints para as operações de dados, mantendo o portal (SQLite)
 * como fonte de verdade. Protegido por segredo no path (mesmo padrão do webhook
 * do bot — ver bot.controller.ts). O OTP é gerado e enviado AQUI; nunca volta ao n8n.
 */

const emailSchema = z.string().email();

function guard(req: Request, res: Response): boolean {
  if (!env.botBridgeSecret || req.params.secret !== env.botBridgeSecret) {
    res.status(404).json({ error: 'not found' });
    return false;
  }
  return true;
}

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

/** Avisa admins sobre novo cadastro pendente (port de bot.registration.ts). */
async function notifyAdminsNewSignup(name: string, email: string): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { phone: true } });
  for (const admin of admins) {
    void sendWhatsApp(
      admin.phone,
      `🔔 Novo cadastro (via WhatsApp) aguardando aprovação no Portal CSP:\n` +
        `*${name}* (${email})\n\nAcesse "Usuários" para aprovar.`,
    );
  }
}

/** Estado do cadastro de um número. */
export async function lookup(req: Request, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const phone = normalizeBrazilPhone((req.body as { phone?: string })?.phone);
  if (!phone) {
    res.json({ status: 'unknown' });
    return;
  }
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    res.json({ status: 'unknown' });
    return;
  }
  const status = user.isActive ? 'active' : user.phoneVerified ? 'inactive' : 'pending';
  res.json({ status, name: user.name });
}

/** Inicia/atualiza o cadastro pendente e dispara o OTP (enviado pelo backend). */
export async function register(req: Request, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const body = (req.body ?? {}) as { phone?: string; name?: string; email?: string };
  const phone = normalizeBrazilPhone(body.phone);
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();

  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  if (name.length < 3 || !name.includes(' ')) {
    res.json({ error: 'invalid_name' });
    return;
  }
  if (!emailSchema.safeParse(email).success) {
    res.json({ error: 'invalid_email' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;
  if (existing) {
    if (existing.isActive || existing.phoneVerified) {
      res.json({ emailInUse: true });
      return;
    }
    await prisma.user.update({ where: { id: existing.id }, data: { name, phone } });
    userId = existing.id;
  } else {
    const passwordHash = await bcrypt.hash(randomPassword(), 10);
    const created = await prisma.user.create({
      data: { name, email, phone, passwordHash, role: 'USER', isActive: false, phoneVerified: false },
    });
    userId = created.id;
  }

  const code = await generateOtp(userId, 'REGISTER');
  const first = name.split(' ')[0] ?? name;
  await sendBotReply(
    phone,
    `${first}, seu código de verificação é: *${code}*\n\n` +
      `Digite o código aqui para confirmar (expira em ${env.otpExpiresMinutes} minutos).`,
  );
  res.json({ ok: true });
}

/** Valida o OTP; em sucesso marca verificado e avisa admins. */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const body = (req.body ?? {}) as { phone?: string; code?: string };
  const phone = normalizeBrazilPhone(body.phone);
  const code = (body.code ?? '').trim();
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    res.json({ result: 'NONE' });
    return;
  }
  const result = await verifyOtpCode(user.id, code, 'REGISTER');
  if (result === 'OK') {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
    await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
    void notifyAdminsNewSignup(user.name, user.email);
  }
  res.json({ result });
}

/** Abre um chamado em nome do usuário (ativo). Notifica solicitante + admins. */
export async function openTicket(req: Request, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const body = (req.body ?? {}) as {
    phone?: string;
    title?: string;
    description?: string;
    category?: string;
    urgency?: string;
  };
  const phone = normalizeBrazilPhone(body.phone);
  const title = (body.title ?? '').trim();
  const description = (body.description ?? '').trim();
  const category = body.category ?? '';
  const urgency = body.urgency ?? '';

  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  if (!title || !description) {
    res.json({ error: 'missing_fields' });
    return;
  }
  if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
    res.json({ error: 'invalid_category' });
    return;
  }
  if (!(TICKET_URGENCIES as readonly string[]).includes(urgency)) {
    res.json({ error: 'invalid_urgency' });
    return;
  }

  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    res.json({ error: 'unknown_user' });
    return;
  }
  if (!user.isActive) {
    res.json({ error: 'not_active' });
    return;
  }

  const ticket = await createTicketForUser(user.id, {
    title,
    description,
    category: category as TicketCategory,
    urgency: urgency as TicketUrgency,
  });
  res.json({ ticketId: ticket.id });
}
