import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { parseModules } from '../../lib/modules.js';
import { sendWhatsApp, sendWhatsAppStrict } from '../../services/whatsapp/index.js';
import { tplAvisoPortal, tplCodigoAcesso } from '../../services/whatsapp/templates.js';

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

    // Senha correta, mas conta ainda não liberada: dá mensagem específica.
    if (!user.isActive) {
      const error = !user.phoneVerified
        ? 'Verifique seu telefone para concluir o cadastro: refaça o cadastro com o mesmo e-mail para receber um novo código.'
        : 'Conta aguardando aprovação do administrador.';
      res.status(403).json({ error });
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
 *  - e-mail novo                → cria conta inativa (USER), coleta e confirma o
 *                                 telefone por código e então notifica admins
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
      // Primeiro acesso: cria conta inativa, ainda SEM telefone verificado. O
      // WhatsApp é obrigatório (canal de notificações) e é coletado + confirmado
      // por código logo abaixo, via fluxo `need_phone`. A notificação aos admins
      // acontece só após a confirmação do código (em `verifyOtp`). Sem senha
      // utilizável (hash aleatório); e-mail já verificado pelo Google.
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

    // Portão de WhatsApp: enquanto não houver telefone confirmado, exige a coleta
    // + confirmação por código. Cobre cadastros novos e contas antigas (criadas
    // via Google sem telefone), forçando o preenchimento no próximo login.
    if (!user.phone || !user.phoneVerified) {
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
// Código de verificação por WhatsApp (cadastro e redefinição de senha)
// ---------------------------------------------------------------------------
// Reativado em 14/11/2026, com a Cloud API da Meta em produção. O código sai
// pelo template AUTHENTICATION `csp_codigo_acesso` (corpo fixo da Meta + botão
// "Copiar código"); no canal de teste (mock) o texto livre é logado no console.

const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_INTERVAL_MS = 60_000;
type OtpType = 'REGISTER' | 'RESET';

/**
 * Gera e persiste um código de 6 dígitos para o usuário, garantindo um único
 * código ativo por vez. Não envia nada — devolve o código em texto plano para
 * que o chamador decida o canal/mensagem de entrega.
 */
export async function generateOtp(userId: string, type: OtpType = 'REGISTER'): Promise<string> {
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60_000);

  // Remove códigos antigos e grava o novo (um código ativo por usuário).
  await prisma.verificationCode.deleteMany({ where: { userId } });
  await prisma.verificationCode.create({ data: { userId, codeHash, type, expiresAt } });

  return code;
}

export type OtpCheck = 'OK' | 'NONE' | 'EXPIRED' | 'TOO_MANY' | 'WRONG';

/**
 * Valida um código digitado pelo usuário. Código incorreto incrementa o contador
 * de tentativas. Em sucesso NÃO limpa os códigos — o chamador decide o que fazer
 * depois (marcar verificado, gravar senha...) e então limpa.
 */
export async function verifyOtpCode(userId: string, code: string, type: OtpType = 'REGISTER'): Promise<OtpCheck> {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, type },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return 'NONE';
  if (record.expiresAt.getTime() < Date.now()) return 'EXPIRED';
  if (record.attempts >= OTP_MAX_ATTEMPTS) return 'TOO_MANY';

  const valid = await bcrypt.compare(code, record.codeHash);
  if (!valid) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } });
    return 'WRONG';
  }
  return 'OK';
}

/** Traduz o resultado da validação em resposta HTTP. Devolve `true` se já respondeu. */
function responderFalhaDeCodigo(res: Response, check: OtpCheck): boolean {
  switch (check) {
    case 'NONE':
      res.status(400).json({ error: 'Nenhum código pendente. Solicite um novo código.' });
      return true;
    case 'EXPIRED':
      res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
      return true;
    case 'TOO_MANY':
      res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });
      return true;
    case 'WRONG':
      res.status(400).json({ error: 'Código incorreto.' });
      return true;
    default:
      return false;
  }
}

/**
 * Segundos que faltam para poder enviar outro código (0 = pode enviar). Evita
 * rajada de envios para o mesmo usuário — e custo na Meta.
 */
async function segundosParaReenvio(userId: string): Promise<number> {
  const last = await prisma.verificationCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  if (!last) return 0;
  const decorrido = Date.now() - last.createdAt.getTime();
  return decorrido < OTP_RESEND_INTERVAL_MS ? Math.ceil((OTP_RESEND_INTERVAL_MS - decorrido) / 1000) : 0;
}

/**
 * Gera, persiste e envia um código para o usuário. Lança erro se o envio falhar
 * (quem chama avisa a pessoa para conferir o número). `type` distingue o código
 * de cadastro ("REGISTER") do de redefinição de senha ("RESET").
 */
async function issueOtp(userId: string, phone: string, type: OtpType = 'REGISTER'): Promise<void> {
  const code = await generateOtp(userId, type);
  await sendWhatsAppStrict(phone, tplCodigoAcesso(code, env.otpExpiresMinutes));
}

const MSG_CODIGO_ENVIADO = 'Código de verificação enviado por WhatsApp.';
const MSG_FALHA_ENVIO = 'Não foi possível enviar o código por WhatsApp. Verifique o número e tente novamente.';

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

// ---------------------------------------------------------------------------
// Auto-cadastro com confirmação do telefone por WhatsApp
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(1),
  password: z.string().min(6),
});

/**
 * Passo 1 do auto-cadastro por formulário: grava a conta inativa e envia o
 * código para o WhatsApp informado. A conta só vira "pendente de aprovação"
 * quando a pessoa confirma o código (`verifyOtp`); o ADMIN libera em "Usuários".
 * Cadastro que parou antes do código pode ser refeito com o mesmo e-mail (os
 * dados são atualizados e um código novo sai) — sem confirmação, ele não vale nada.
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

    const passwordHash = await bcrypt.hash(data.password, 10);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });

    let userId: string;
    if (existing) {
      // Já ativo, ou já confirmou o telefone (aguardando o admin): não permite
      // recadastro — senão qualquer um sobrescreveria a senha de um pendente.
      if (existing.isActive || existing.phoneVerified) {
        res.status(409).json({ error: existing.isActive ? 'E-mail já cadastrado.' : 'Este e-mail já tem um cadastro aguardando aprovação.' });
        return;
      }
      // Cadastro que parou antes do código → atualiza os dados e reenvia.
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
      await issueOtp(userId, phone);
    } catch (err) {
      console.error('[WhatsApp][OTP]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: MSG_FALHA_ENVIO });
      return;
    }

    res.status(200).json({ userId, message: MSG_CODIGO_ENVIADO });
  } catch (err) {
    next(err);
  }
}

const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  code: z.string().min(1),
});

/** Passo 2: confirma o código. A conta passa a "pendente de aprovação" e os admins são avisados. */
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

    const check = await verifyOtpCode(userId, code, 'REGISTER');
    if (responderFalhaDeCodigo(res, check)) return;

    // Sucesso: marca telefone verificado, limpa códigos. Conta segue inativa (aguarda admin).
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: true } });
    await prisma.verificationCode.deleteMany({ where: { userId } });

    await avisarAdminsDeCadastro(user);

    res.json({ message: 'Telefone verificado! Aguarde a aprovação do administrador.' });
  } catch (err) {
    next(err);
  }
}

const resendOtpSchema = z.object({ userId: z.string().min(1) });

/** Reenvia o código de cadastro (no máximo um a cada 60 s por usuário). */
export async function resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = resendOtpSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.phone) {
      res.status(404).json({ error: 'Cadastro não encontrado.' });
      return;
    }
    if (user.phoneVerified || user.isActive) {
      res.status(409).json({ error: 'Telefone já verificado.' });
      return;
    }

    const espera = await segundosParaReenvio(userId);
    if (espera > 0) {
      res.status(429).json({ error: `Aguarde ${espera}s para reenviar o código.` });
      return;
    }

    try {
      await issueOtp(userId, user.phone);
    } catch (err) {
      console.error('[WhatsApp][OTP]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: MSG_FALHA_ENVIO });
      return;
    }

    res.json({ message: 'Novo código enviado por WhatsApp.' });
  } catch (err) {
    next(err);
  }
}

const googlePhoneSchema = z.object({
  userId: z.string().min(1),
  phone: z.string().min(1),
});

/**
 * Grava o WhatsApp de um usuário criado via Google (ainda não confirmado) e
 * dispara o código. Espelha a parte de telefone/código do `register`. Endpoint
 * público (o usuário ainda não está logado): só aceita contas com
 * `phoneVerified: false`, impedindo trocar o telefone de contas já confirmadas.
 */
export async function setGooglePhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = googlePhoneSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      res.status(404).json({ error: 'Cadastro não encontrado.' });
      return;
    }
    // Conta já confirmada OU já ativa (ex.: criada pelo admin, sem passar pelo
    // código) não troca de número por aqui — senão bastaria o id para desviar
    // os avisos de alguém.
    if (user.phoneVerified || user.isActive) {
      res.status(409).json({ error: 'Telefone já cadastrado.' });
      return;
    }

    const phone = normalizeBrazilPhone(data.phone);
    if (!phone) {
      res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (ex: (31) 98436-7833).' });
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { phone } });

    try {
      await issueOtp(user.id, phone);
    } catch (err) {
      console.error('[WhatsApp][OTP]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: MSG_FALHA_ENVIO });
      return;
    }

    res.status(200).json({ userId: user.id, message: MSG_CODIGO_ENVIADO });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Redefinição de senha por código no WhatsApp ("Esqueci minha senha")
// ---------------------------------------------------------------------------

const requestResetSchema = z.object({ email: z.string().email() });

/**
 * Solicita um código de redefinição de senha. Resposta sempre genérica (e 200)
 * para não revelar quais e-mails existem — exceto o 429 do intervalo de 60 s,
 * que só acontece para quem já recebeu um código.
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

    const espera = await segundosParaReenvio(user.id);
    if (espera > 0) {
      res.status(429).json({ error: `Aguarde ${espera}s para solicitar um novo código.` });
      return;
    }

    try {
      await issueOtp(user.id, user.phone, 'RESET');
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

    const check = await verifyOtpCode(user.id, code, 'RESET');
    if (responderFalhaDeCodigo(res, check)) return;

    // Sucesso: grava nova senha e limpa os códigos pendentes.
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.verificationCode.deleteMany({ where: { userId: user.id } });

    // Confirmação por WhatsApp (fire-and-forget).
    const firstName = user.name.split(' ')[0] ?? user.name;
    void sendWhatsApp(
      user.phone,
      tplAvisoPortal(
        `✅ ${firstName}, sua senha do Portal CSP foi redefinida com sucesso.\n\n` +
          `Se não foi você, entre em contato com o administrador imediatamente.`,
        'Senha redefinida',
        `${firstName}, sua senha foi redefinida. Se não foi você, avise o administrador imediatamente.`,
      ),
    );

    res.json({ message: 'Senha redefinida com sucesso! Você já pode entrar.' });
  } catch (err) {
    next(err);
  }
}
