/**
 * Testa o auto-cadastro por HTTP, contra o app real subido numa porta livre
 * (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-cadastro-http.ts
 *
 * Decisão de 06/11/2026: sem verificação por WhatsApp (a API ainda não está em
 * uso). O telefone continua OBRIGATÓRIO e fica guardado; a conta nasce inativa e
 * só entra depois que um ADMIN aprova em "Usuários". Vale para o formulário e
 * para o cadastro via Google (coleta do telefone em /auth/google/phone).
 * Tudo com e-mail "teste-cad-…"; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const PREFIXO_EMAIL = 'teste-cad-';
const PREFIXO = 'TESTE-CAD';
const SENHA = 'Senha@123';

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

interface Conta { id: string; token: string }

async function criarAdmin(): Promise<Conta> {
  const u = await prisma.user.create({
    data: { name: `${PREFIXO} admin`, email: `${PREFIXO_EMAIL}admin@gmail.com`, passwordHash: 'x', role: 'ADMIN', isActive: true, phone: '+5531999990000', modules: '[]' },
  });
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name, modules: [] }, env.jwtSecret, { expiresIn: '1h' });
  return { id: u.id, token };
}

async function main() {
  await limpar();

  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const chamar = (conta: Conta | null, method: string, rota: string, body?: unknown) =>
    fetch(`${base}${rota}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(conta ? { Authorization: `Bearer ${conta.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const erroDe = async (r: Response) => ((await r.json()) as { error?: string }).error ?? '';

  const admin = await criarAdmin();
  const emailAna = `${PREFIXO_EMAIL}ana@gmail.com`;
  const cadastro = (extra: Record<string, unknown> = {}) =>
    chamar(null, 'POST', '/auth/register', { name: `${PREFIXO} Ana`, email: emailAna, phone: '+5531984367833', password: SENHA, ...extra });
  const login = (email: string) => chamar(null, 'POST', '/auth/login', { email, password: SENHA });

  try {
    console.log('Formulário de cadastro');
    await teste('sem telefone → 400 (continua obrigatório)', async () => {
      const r = await chamar(null, 'POST', '/auth/register', { name: `${PREFIXO} Ana`, email: emailAna, password: SENHA });
      assert.equal(r.status, 400);
      assert.equal(await prisma.user.count({ where: { email: emailAna } }), 0);
    });
    await teste('telefone inválido → 400 com a mensagem de DDD + número', async () => {
      const r = await cadastro({ phone: '123' });
      assert.equal(r.status, 400);
      assert.match(await erroDe(r), /Telefone inválido/);
    });
    await teste('cadastro válido → 201 "aguarde a aprovação"; conta inativa, com telefone normalizado, sem código pendente', async () => {
      const r = await cadastro();
      assert.equal(r.status, 201);
      assert.match(((await r.json()) as { message: string }).message, /aprovação do administrador/);
      const u = await prisma.user.findUnique({ where: { email: emailAna } });
      assert.ok(u);
      assert.equal(u.isActive, false);
      assert.equal(u.phone, '+5531984367833');
      assert.equal(u.phoneVerified, true);
      assert.equal(u.role, 'USER');
      assert.equal(await prisma.verificationCode.count({ where: { userId: u.id } }), 0, 'não pode gerar OTP');
    });
    await teste('as rotas de OTP do cadastro não existem mais (404)', async () => {
      assert.equal((await chamar(null, 'POST', '/auth/verify-otp', { userId: 'x', code: '000000' })).status, 404);
      assert.equal((await chamar(null, 'POST', '/auth/resend-otp', { userId: 'x' })).status, 404);
    });
    await teste('mesmo e-mail de novo → 409 "aguardando aprovação" e a senha pendente NÃO é sobrescrita', async () => {
      const antes = (await prisma.user.findUnique({ where: { email: emailAna } }))!.passwordHash;
      const r = await cadastro({ password: 'Outra@123' });
      assert.equal(r.status, 409);
      assert.match(await erroDe(r), /aguardando aprovação/);
      assert.equal((await prisma.user.findUnique({ where: { email: emailAna } }))!.passwordHash, antes);
    });
    await teste('login antes da aprovação → 403 "aguardando aprovação"', async () => {
      const r = await login(emailAna);
      assert.equal(r.status, 403);
      assert.match(await erroDe(r), /aguardando aprovação/);
    });
    await teste('ADMIN aprova em Usuários → login passa a funcionar (200)', async () => {
      const u = (await prisma.user.findUnique({ where: { email: emailAna } }))!;
      assert.equal((await chamar(admin, 'PATCH', `/users/${u.id}/toggle-active`)).status, 200);
      assert.equal((await login(emailAna)).status, 200);
    });
    await teste('e-mail já ativo → 409 "E-mail já cadastrado"', async () => {
      const r = await cadastro();
      assert.equal(r.status, 409);
      assert.match(await erroDe(r), /já cadastrado/);
    });

    console.log('Cadastro via Google (coleta do telefone)');
    const emailBia = `${PREFIXO_EMAIL}bia@gmail.com`;
    const bia = await prisma.user.create({
      data: { name: `${PREFIXO} Bia`, email: emailBia, passwordHash: 'x', role: 'USER', isActive: false, phoneVerified: false },
    });
    await teste('id desconhecido → 404', async () => {
      assert.equal((await chamar(null, 'POST', '/auth/google/phone', { userId: 'nao-existe', phone: '+5531984367833' })).status, 404);
    });
    await teste('telefone inválido → 400 e nada gravado', async () => {
      assert.equal((await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '99' })).status, 400);
      assert.equal((await prisma.user.findUnique({ where: { id: bia.id } }))!.phone, null);
    });
    await teste('telefone válido → 200 "aguarde a aprovação"; número gravado, conta segue inativa, sem OTP', async () => {
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '+5531984367834' });
      assert.equal(r.status, 200);
      assert.match(((await r.json()) as { message: string }).message, /aprovação do administrador/);
      const u = (await prisma.user.findUnique({ where: { id: bia.id } }))!;
      assert.equal(u.phone, '+5531984367834');
      assert.equal(u.phoneVerified, true);
      assert.equal(u.isActive, false);
      assert.equal(await prisma.verificationCode.count({ where: { userId: bia.id } }), 0);
    });
    await teste('quem já tem telefone NÃO troca por essa rota pública (409)', async () => {
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '+5531984367835' });
      assert.equal(r.status, 409);
      assert.equal((await prisma.user.findUnique({ where: { id: bia.id } }))!.phone, '+5531984367834');
    });
    await teste('conta ativa com telefone também não troca (409)', async () => {
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: admin.id, phone: '+5531984367836' });
      assert.equal(r.status, 409);
      assert.equal((await prisma.user.findUnique({ where: { id: admin.id } }))!.phone, '+5531999990000');
    });
  } finally {
    await limpar();
    server.close();
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? '\nTudo verde.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
