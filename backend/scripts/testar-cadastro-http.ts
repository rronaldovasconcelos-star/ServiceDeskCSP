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
  // O /auth tem limite de 20 pedidos por IP em 15 min. A suíte passa disso, então
  // cada bloco se apresenta com um IP diferente (o app confia em 1 proxy).
  let ipDoBloco = '10.9.0.1';
  const chamar = (conta: Conta | null, method: string, rota: string, body?: unknown) =>
    fetch(`${base}${rota}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipDoBloco, ...(conta ? { Authorization: `Bearer ${conta.token}` } : {}) },
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

    ipDoBloco = '10.9.0.2';
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

    ipDoBloco = '10.9.0.3';
    console.log('Senha provisória (admin)');
    await teste('as rotas públicas de redefinição por código não existem mais (404)', async () => {
      assert.equal((await chamar(null, 'POST', '/auth/request-password-reset', { email: emailAna })).status, 404);
      assert.equal((await chamar(null, 'POST', '/auth/reset-password', { email: emailAna, code: '000000', password: 'x' })).status, 404);
    });
    const ana = (await prisma.user.findUnique({ where: { email: emailAna } }))!;
    await teste('sem token e GESTOR → 401/403; a senha da Ana continua a mesma', async () => {
      const gestor = await prisma.user.create({
        data: { name: `${PREFIXO} gestor`, email: `${PREFIXO_EMAIL}gestor@gmail.com`, passwordHash: 'x', role: 'GESTOR', isActive: true, modules: '[]' },
      });
      const tokenGestor = jwt.sign({ sub: gestor.id, email: gestor.email, role: 'GESTOR', name: gestor.name, modules: [] }, env.jwtSecret, { expiresIn: '1h' });
      assert.equal((await chamar(null, 'POST', `/users/${ana.id}/reset-password`)).status, 401);
      assert.equal((await chamar({ id: gestor.id, token: tokenGestor }, 'POST', `/users/${ana.id}/reset-password`)).status, 403);
      assert.equal((await login(emailAna)).status, 200, 'a senha original ainda vale');
    });
    await teste('ADMIN gera a senha provisória: vem UMA vez na resposta, a antiga para de valer e a nova entra', async () => {
      const r = await chamar(admin, 'POST', `/users/${ana.id}/reset-password`);
      assert.equal(r.status, 200);
      const { senhaProvisoria } = (await r.json()) as { senhaProvisoria: string };
      assert.match(senhaProvisoria, /^[A-Za-z0-9]{10}$/);
      assert.doesNotMatch(senhaProvisoria, /[0O1lI]/, 'sem caracteres parecidos');
      assert.equal((await login(emailAna)).status, 401, 'a senha antiga precisa parar de valer');
      const nova = await chamar(null, 'POST', '/auth/login', { email: emailAna, password: senhaProvisoria });
      assert.equal(nova.status, 200);
      const u = (await prisma.user.findUnique({ where: { id: ana.id } }))!;
      assert.notEqual(u.passwordHash, senhaProvisoria, 'no banco só o hash');
    });
    let provisoria = '';
    await teste('duas gerações seguidas dão senhas diferentes', async () => {
      const a = ((await (await chamar(admin, 'POST', `/users/${ana.id}/reset-password`)).json()) as { senhaProvisoria: string }).senhaProvisoria;
      const b = ((await (await chamar(admin, 'POST', `/users/${ana.id}/reset-password`)).json()) as { senhaProvisoria: string }).senhaProvisoria;
      assert.notEqual(a, b);
      provisoria = b;
    });

    ipDoBloco = '10.9.0.4';
    console.log('Alterar a própria senha (usuário logado)');
    const tokenAna = jwt.sign({ sub: ana.id, email: ana.email, role: 'USER', name: ana.name, modules: [] }, env.jwtSecret, { expiresIn: '1h' });
    const contaAna = { id: ana.id, token: tokenAna };
    const trocar = (conta: Conta | null, senhaAtual: string, novaSenha: string) => chamar(conta, 'POST', '/auth/change-password', { senhaAtual, novaSenha });
    await teste('sem token → 401', async () => {
      assert.equal((await trocar(null, provisoria, 'Nova@12345')).status, 401);
    });
    await teste('senha atual errada → 400 e nada muda (token roubado não troca a senha)', async () => {
      const r = await trocar(contaAna, 'errada-123', 'Nova@12345');
      assert.equal(r.status, 400);
      assert.match(await erroDe(r), /senha atual não confere/);
      assert.equal((await chamar(null, 'POST', '/auth/login', { email: emailAna, password: provisoria })).status, 200);
    });
    await teste('nova senha curta → 400; igual à atual → 400', async () => {
      assert.equal((await trocar(contaAna, provisoria, '123')).status, 400);
      assert.equal((await trocar(contaAna, provisoria, provisoria)).status, 400);
    });
    await teste('troca válida → 200; a antiga para de valer e a nova entra', async () => {
      assert.equal((await trocar(contaAna, provisoria, 'Nova@12345')).status, 200);
      assert.equal((await chamar(null, 'POST', '/auth/login', { email: emailAna, password: provisoria })).status, 401);
      assert.equal((await chamar(null, 'POST', '/auth/login', { email: emailAna, password: 'Nova@12345' })).status, 200);
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
