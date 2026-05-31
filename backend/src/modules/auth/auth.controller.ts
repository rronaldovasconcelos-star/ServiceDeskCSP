import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { sendWhatsApp, sendWhatsAppStrict } from '../../services/whatsapp/index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    // Senha correta, mas conta ainda não liberada: dá mensagem específica.
    if (!user.isActive) {
      const error = !user.phoneVerified
        ? 'Verifique seu telefone para concluir o cadastro.'
        : 'Conta aguardando aprovação do administrador.';
      res.status(403).json({ error });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true },
  });
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }
  res.json(user);
}

// ---------------------------------------------------------------------------
// Auto-cadastro com verificação por WhatsApp (OTP)
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(1),
  password: z.string().min(6),
});

const OTP_LENGTH = 6;

/**
 * Gera, persiste e envia um código OTP para o usuário. Lança erro se o envio falhar.
 * `type` distingue o OTP de cadastro ("REGISTER") do de redefinição de senha ("RESET").
 * `buildMessage` permite customizar o texto enviado por WhatsApp (default: cadastro).
 */
async function issueOtp(
  userId: string,
  phone: string,
  name: string,
  type: 'REGISTER' | 'RESET' = 'REGISTER',
  buildMessage?: (code: string, firstName: string) => string,
): Promise<void> {
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60_000);

  // Remove códigos antigos e grava o novo (um código ativo por usuário).
  await prisma.verificationCode.deleteMany({ where: { userId } });
  await prisma.verificationCode.create({ data: { userId, codeHash, type, expiresAt } });

  const firstName = name.split(' ')[0] ?? name;
  const message = buildMessage
    ? buildMessage(code, firstName)
    : `Olá, ${firstName}! Seu código de verificação do Portal CSP é: *${code}*\n\n` +
      `Ele expira em ${env.otpExpiresMinutes} minutos. Se você não solicitou, ignore esta mensagem.`;
  await sendWhatsAppStrict(phone, message);
}

/** Mensagem WhatsApp do código de redefinição de senha. Exportada p/ uso pelo módulo de usuários. */
export function resetOtpMessage(code: string, firstName: string): string {
  return (
    `Olá, ${firstName}! Foi solicitada a redefinição da sua senha no Portal CSP.\n\n` +
    `Seu código é: *${code}*\n\n` +
    `Acesse "Esqueci minha senha" no portal e informe este código. ` +
    `Ele expira em ${env.otpExpiresMinutes} minutos. Se você não solicitou, ignore esta mensagem.`
  );
}

/** Dispara um OTP de redefinição de senha. Exportada p/ uso pelo módulo de usuários (admin). */
export async function issueResetOtp(userId: string, phone: string, name: string): Promise<void> {
  await issueOtp(userId, phone, name, 'RESET', resetOtpMessage);
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.allowSelfRegistration) {
      res.status(403).json({ error: 'Cadastro público desativado.' });
      return;
    }

    const data = registerSchema.parse(req.body);

    const phone = normalizeBrazilPhone(data.phone);
    if (!phone) {
      res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (ex: (31) 98436-7833).' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });

    let userId: string;
    if (existing) {
      // Já existe e está ativo ou já verificado → não permite recadastro.
      if (existing.isActive || existing.phoneVerified) {
        res.status(409).json({ error: 'E-mail já cadastrado.' });
        return;
      }
      // Cadastro pendente/não verificado → atualiza dados e reenvia OTP.
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: data.name, phone, passwordHash },
      });
      userId = existing.id;
    } else {
      try {
        const created = await prisma.user.create({
          data: {
            name: data.name,
            email: data.email,
            phone,
            passwordHash,
            role: 'USER',
            isActive: false,
            phoneVerified: false,
          },
        });
        userId = created.id;
      } catch (err) {
        // Race condition: dois cadastros simultâneos com o mesmo e-mail.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          res.status(409).json({ error: 'E-mail já cadastrado.' });
          return;
        }
        throw err;
      }
    }

    try {
      await issueOtp(userId, phone, data.name);
    } catch (err) {
      console.error('[WhatsApp][OTP]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Não foi possível enviar o código por WhatsApp. Verifique o número e tente novamente.' });
      return;
    }

    res.status(200).json({ userId, message: 'Código de verificação enviado por WhatsApp.' });
  } catch (err) {
    next(err);
  }
}

const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  code: z.string().min(1),
});

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, code } = verifyOtpSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Cadastro não encontrado.' });
      return;
    }
    if (user.phoneVerified) {
      res.status(409).json({ error: 'Telefone já verificado.' });
      return;
    }

    const record = await prisma.verificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      res.status(400).json({ error: 'Nenhum código pendente. Solicite um novo código.' });
      return;
    }
    if (record.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
      return;
    }
    if (record.attempts >= 5) {
      res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
      return;
    }

    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 },
      });
      res.status(400).json({ error: 'Código incorreto.' });
      return;
    }

    // Sucesso: marca telefone verificado, limpa códigos. Conta segue inativa (aguarda admin).
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: true } });
    await prisma.verificationCode.deleteMany({ where: { userId } });

    // Notifica admins sobre o novo cadastro pendente (fire-and-forget).
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { phone: true },
    });
    for (const admin of admins) {
      void sendWhatsApp(
        admin.phone,
        `🔔 Novo cadastro aguardando aprovação no Portal CSP:\n` +
          `*${user.name}* (${user.email})\n\nAcesse "Usuários" para aprovar.`,
      );
    }

    res.json({ message: 'Telefone verificado! Aguarde a aprovação do administrador.' });
  } catch (err) {
    next(err);
  }
}

const resendOtpSchema = z.object({ userId: z.string().min(1) });

export async function resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = resendOtpSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.phone) {
      res.status(404).json({ error: 'Cadastro não encontrado.' });
      return;
    }
    if (user.phoneVerified) {
      res.status(409).json({ error: 'Telefone já verificado.' });
      return;
    }

    // Rate-limit: bloqueia reenvio se o último código foi criado há menos de 60s.
    const last = await prisma.verificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < 60_000) {
      const wait = Math.ceil((60_000 - (Date.now() - last.createdAt.getTime())) / 1000);
      res.status(429).json({ error: `Aguarde ${wait}s para reenviar o código.` });
      return;
    }

    try {
      await issueOtp(userId, user.phone, user.name);
    } catch (err) {
      console.error('[WhatsApp][OTP]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Não foi possível enviar o código por WhatsApp.' });
      return;
    }

    res.json({ message: 'Novo código enviado por WhatsApp.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Redefinição de senha via OTP por WhatsApp
// ---------------------------------------------------------------------------

const requestResetSchema = z.object({ email: z.string().email() });

/**
 * Solicita um código de redefinição de senha (fluxo público "Esqueci minha senha").
 * Resposta sempre genérica para não revelar quais e-mails existem.
 */
export async function requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = requestResetSchema.parse(req.body);
    const genericMsg = 'Se houver uma conta com este e-mail, enviaremos um código por WhatsApp.';

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.phone) {
      res.json({ message: genericMsg });
      return;
    }

    // Rate-limit: bloqueia novo envio se o último código foi criado há menos de 60s.
    const last = await prisma.verificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < 60_000) {
      const wait = Math.ceil((60_000 - (Date.now() - last.createdAt.getTime())) / 1000);
      res.status(429).json({ error: `Aguarde ${wait}s para solicitar um novo código.` });
      return;
    }

    try {
      await issueResetOtp(user.id, user.phone, user.name);
    } catch (err) {
      console.error('[WhatsApp][RESET]', err instanceof Error ? err.message : err);
      // Mantém resposta genérica para não vazar existência da conta.
    }

    res.json({ message: genericMsg });
  } catch (err) {
    next(err);
  }
}

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  password: z.string().min(6),
});

/** Conclui a redefinição: valida o código RESET e grava a nova senha. */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, code, password } = resetPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(400).json({ error: 'Código inválido ou expirado.' });
      return;
    }

    const record = await prisma.verificationCode.findFirst({
      where: { userId: user.id, type: 'RESET' },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      res.status(400).json({ error: 'Nenhum código pendente. Solicite um novo código.' });
      return;
    }
    if (record.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
      return;
    }
    if (record.attempts >= 5) {
      res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
      return;
    }

    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 },
      });
      res.status(400).json({ error: 'Código incorreto.' });
      return;
    }

    // Sucesso: grava nova senha e limpa os códigos pendentes.
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.verificationCode.deleteMany({ where: { userId: user.id } });

    // Confirmação por WhatsApp (fire-and-forget).
    const firstName = user.name.split(' ')[0] ?? user.name;
    void sendWhatsApp(
      user.phone,
      `✅ ${firstName}, sua senha do Portal CSP foi redefinida com sucesso.\n\n` +
        `Se não foi você, entre em contato com o administrador imediatamente.`,
    );

    res.json({ message: 'Senha redefinida com sucesso! Você já pode entrar.' });
  } catch (err) {
    next(err);
  }
}
