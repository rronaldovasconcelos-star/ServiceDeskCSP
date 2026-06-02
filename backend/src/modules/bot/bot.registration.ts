import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { generateOtp, verifyOtpCode } from '../auth/auth.controller.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';
import { sendBotReply } from './bot.sender.js';
import { BotSessionData, LoadedSession, resetSession, saveSession } from './bot.session.js';

const emailSchema = z.string().email();

/**
 * Inicia o auto-cadastro de um número desconhecido: pede o nome e move para REG_NAME.
 */
export async function startRegistration(phone: string): Promise<void> {
  await saveSession(phone, 'REG_NAME', { reg: {} });
  await sendBotReply(
    phone,
    'Olá! 👋 Não encontrei seu número no Portal CSP.\n\n' +
      'Vou te cadastrar rapidinho. Para começar, qual é o seu *nome completo*?',
  );
}

/** Gera uma senha aleatória forte (o usuário define a definitiva depois via "Esqueci minha senha"). */
function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function sendRegistrationOtp(userId: string, phone: string, firstName: string): Promise<void> {
  const code = await generateOtp(userId, 'REGISTER');
  await sendBotReply(
    phone,
    `${firstName}, seu código de verificação é: *${code}*\n\n` +
      `Digite o código aqui para confirmar (expira em ${env.otpExpiresMinutes} minutos).`,
  );
}

/** Notifica admins sobre um novo cadastro pendente de aprovação (fire-and-forget). */
async function notifyAdminsNewSignup(name: string, email: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { phone: true },
  });
  for (const admin of admins) {
    void sendWhatsApp(
      admin.phone,
      `🔔 Novo cadastro (via WhatsApp) aguardando aprovação no Portal CSP:\n` +
        `*${name}* (${email})\n\nAcesse "Usuários" para aprovar.`,
    );
  }
}

/**
 * Conduz o auto-cadastro pelo chat. Recebe o telefone já normalizado, o texto
 * da mensagem e a sessão atual (estado REG_*). Retorna após enviar a resposta.
 */
export async function handleRegistration(phone: string, text: string, session: LoadedSession): Promise<void> {
  const data: BotSessionData = session.data ?? {};
  const reg = data.reg ?? {};

  switch (session.state) {
    case 'REG_NAME': {
      const name = text.trim();
      if (name.length < 3 || !name.includes(' ')) {
        await sendBotReply(phone, 'Por favor, informe seu *nome completo* (nome e sobrenome).');
        return;
      }
      await saveSession(phone, 'REG_EMAIL', { reg: { ...reg, name } });
      await sendBotReply(phone, `Prazer, ${name.split(' ')[0]}! Agora me informe seu *e-mail*.`);
      return;
    }

    case 'REG_EMAIL': {
      const email = text.trim().toLowerCase();
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) {
        await sendBotReply(phone, 'E-mail inválido. Por favor, digite um e-mail válido (ex: nome@escola.com.br).');
        return;
      }

      const name = reg.name ?? 'Usuário';
      const existing = await prisma.user.findUnique({ where: { email } });

      let userId: string;
      if (existing) {
        if (existing.isActive || existing.phoneVerified) {
          await sendBotReply(
            phone,
            'Esse e-mail já possui cadastro no portal. Se for você, use a opção *Esqueci minha senha* no portal. ' +
              'Caso queira cadastrar outro e-mail, digite-o agora.',
          );
          return; // permanece em REG_EMAIL
        }
        // Cadastro pendente/não verificado → atualiza e reaproveita.
        await prisma.user.update({ where: { id: existing.id }, data: { name, phone } });
        userId = existing.id;
      } else {
        const passwordHash = await bcrypt.hash(randomPassword(), 10);
        const created = await prisma.user.create({
          data: { name, email, phone, passwordHash, role: 'USER', isActive: false, phoneVerified: false },
        });
        userId = created.id;
      }

      await saveSession(phone, 'REG_OTP', { reg: { ...reg, name, email, userId } });
      await sendRegistrationOtp(userId, phone, name.split(' ')[0] ?? name);
      return;
    }

    case 'REG_OTP': {
      const code = text.trim();
      if (!reg.userId) {
        // Estado inconsistente — recomeça o cadastro.
        await startRegistration(phone);
        return;
      }
      const result = await verifyOtpCode(reg.userId, code, 'REGISTER');
      if (result === 'OK') {
        await prisma.user.update({ where: { id: reg.userId }, data: { phoneVerified: true } });
        await prisma.verificationCode.deleteMany({ where: { userId: reg.userId } });
        await resetSession(phone);
        await notifyAdminsNewSignup(reg.name ?? 'Usuário', reg.email ?? '');
        await sendBotReply(
          phone,
          '✅ Cadastro confirmado! Sua conta está *aguardando aprovação* de um administrador.\n\n' +
            'Assim que liberada, você poderá abrir chamados por aqui. Para definir sua senha de acesso ao portal, ' +
            'use a opção *Esqueci minha senha* na tela de login.',
        );
        return;
      }
      const messages: Record<string, string> = {
        WRONG: 'Código incorreto. Tente novamente ou aguarde para receber um novo.',
        EXPIRED: 'Código expirado. Vou te enviar um novo.',
        NONE: 'Não há código pendente. Vou te enviar um novo.',
        TOO_MANY: 'Muitas tentativas. Vou te enviar um novo código.',
      };
      await sendBotReply(phone, messages[result] ?? 'Não consegui validar o código.');
      if (result !== 'WRONG') {
        await sendRegistrationOtp(reg.userId, phone, (reg.name ?? 'Usuário').split(' ')[0] ?? 'Usuário');
      }
      return;
    }

    default:
      // Não deveria chegar aqui; por segurança reinicia.
      await startRegistration(phone);
  }
}
