import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { parseModules } from '../../lib/modules.js';
import { sendWhatsApp } from '../../services/whatsapp/index.js';
import { tplAvisoPortal } from '../../services/whatsapp/templates.js';

/** Emite o JWT do portal, embutindo os módulos liberados (vazio p/ ADMIN, que tem tudo). */
function signToken(user: { id: string; email: string; role: string; name: string; modules: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name, modules: parseModules(user.modules) },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );
}

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

    // Senha correta, mas conta ainda não liberada pelo administrador.
    if (!user.isActive) {
      res.status(403).json({ error: 'Conta aguardando aprovação do administrador.' });
      return;
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        phone: user.phone, modules: parseModules(user.modules),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Login com Google (Google Identity Services)
// ---------------------------------------------------------------------------

const googleSchema = z.object({ credential: z.string().min(1) });

// Cliente reutilizável p/ validar os ID tokens emitidos pelo Google.
const googleClient = new OAuth2Client(env.googleLoginClientId);

/**
 * Login/cadastro via Google. O frontend envia o `credential` (ID token JWT do
 * Google Identity Services); validamos a assinatura e a audience, e então:
 *  - e-mail já existe e ativo   → emite JWT (login direto)
 *  - e-mail existe mas inativo  → 403 (aguardando aprovação)
 *  - e-mail novo                → cria conta inativa (USER) e notifica admins
 */
export async function googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.googleLoginClientId) {
      res.status(503).json({ error: 'Login com Google não está configurado.' });
      return;
    }

    const { credential } = googleSchema.parse(req.body);

    let payload: import('google-auth-library').TokenPayload | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.googleLoginClientId,
      });
      payload = ticket.getPayload();
    } catch {
      res.status(401).json({ error: 'Token do Google inválido.' });
      return;
    }

    if (!payload?.email || !payload.email_verified) {
      res.status(401).json({ error: 'Conta Google sem e-mail verificado.' });
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name ?? email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Primeiro acesso: cria conta inativa, ainda sem telefone. O telefone é
      // obrigatório (fica guardado para os avisos quando o WhatsApp entrar) e é
      // coletado logo abaixo, via fluxo `need_phone`; a notificação aos admins
      // acontece em `setGooglePhone`. Sem senha utilizável (hash aleatório);
      // e-mail já verificado pelo Google.
      const randomHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: randomHash,
          role: 'USER',
          isActive: false,
          phoneVerified: false,
        },
      });
    }

    // Portão do telefone: enquanto não houver número, exige a coleta. Cobre
    // cadastros novos e contas antigas criadas via Google sem telefone.
    if (!user.phone) {
      res.json({ status: 'need_phone', userId: user.id, name: user.name });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Conta aguardando aprovação do administrador.' });
      return;
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        phone: user.phone, modules: parseModules(user.modules),
      },
    });
  } catch (err) {
    next(err);
  }
}

const changePasswordSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
});

/**
 * Troca da própria senha (usuário logado). Exige a senha atual, para um token
 * roubado não servir para trocar a senha. Quem só entra pelo Google tem hash
 * aleatório e nunca acerta a atual: a tela avisa que, nesse caso, não há senha.
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { senhaAtual, novaSenha } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    if (!(await bcrypt.compare(senhaAtual, user.passwordHash))) {
      res.status(400).json({ error: 'A senha atual não confere.' });
      return;
    }
    if (senhaAtual === novaSenha) {
      res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' });
      return;
    }
    const passwordHash = await bcrypt.hash(novaSenha, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ message: 'Senha alterada. Use a nova senha na próxima entrada.' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, modules: true },
  });
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }
  res.json({ ...user, modules: parseModules(user.modules) });
}

// ---------------------------------------------------------------------------
// Auto-cadastro (sem OTP; aprovação pelo ADMIN)
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(1),
  password: z.string().min(6),
});

/** Avisa os admins ativos de um cadastro novo aguardando aprovação (fire-and-forget). */
async function avisarAdminsDeCadastro(user: { name: string; email: string }): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { phone: true },
  });
  for (const admin of admins) {
    void sendWhatsApp(
      admin.phone,
      tplAvisoPortal(
        `🔔 Novo cadastro aguardando aprovação no Portal CSP:\n` +
          `*${user.name}* (${user.email})\n\nAcesse "Usuários" para aprovar.`,
        'Novo cadastro aguardando aprovação',
        `${user.name} (${user.email}) — aprove em "Usuários" no portal`,
      ),
    );
  }
}

const MSG_CADASTRO_ENVIADO = 'Cadastro enviado. Aguarde a aprovação do administrador.';

/**
 * Auto-cadastro por formulário. Decisão de 06/11/2026: sem verificação por
 * WhatsApp (a API ainda não está em uso); o telefone continua obrigatório e fica
 * guardado para os avisos futuros. A conta nasce inativa e só entra depois que
 * um ADMIN aprova em "Usuários".
 */
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

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      // Sem OTP não há como provar que o e-mail é de quem está digitando, então um
      // cadastro pendente não pode ser sobrescrito por outro pedido.
      res.status(409).json({ error: existing.isActive ? 'E-mail já cadastrado.' : 'Este e-mail já tem um cadastro aguardando aprovação.' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    let user: { name: string; email: string };
    try {
      user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone,
          passwordHash,
          role: 'USER',
          isActive: false,
          // Sem OTP, "verificado" passa a significar "telefone informado, cadastro completo".
          phoneVerified: true,
        },
        select: { name: true, email: true },
      });
    } catch (err) {
      // Race condition: dois cadastros simultâneos com o mesmo e-mail.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: 'E-mail já cadastrado.' });
        return;
      }
      throw err;
    }

    await avisarAdminsDeCadastro(user);
    res.status(201).json({ message: MSG_CADASTRO_ENVIADO });
  } catch (err) {
    next(err);
  }
}

const googlePhoneSchema = z.object({
  userId: z.string().min(1),
  phone: z.string().min(1),
});

/**
 * Grava o telefone de um usuário criado via Google e conclui o cadastro (conta
 * segue inativa até o ADMIN aprovar). Endpoint público (o usuário ainda não está
 * logado): só aceita contas SEM telefone, para ninguém trocar o número de uma
 * conta existente conhecendo o id.
 */
export async function setGooglePhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = googlePhoneSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      res.status(404).json({ error: 'Cadastro não encontrado.' });
      return;
    }
    if (user.phone) {
      res.status(409).json({ error: 'Telefone já cadastrado.' });
      return;
    }

    const phone = normalizeBrazilPhone(data.phone);
    if (!phone) {
      res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (ex: (31) 98436-7833).' });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { phone, phoneVerified: true } });
    await avisarAdminsDeCadastro(user);

    res.status(200).json({ message: MSG_CADASTRO_ENVIADO });
  } catch (err) {
    next(err);
  }
}
