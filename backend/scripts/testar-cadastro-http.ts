/**
 * Testa o auto-cadastro e a redefinição de senha por HTTP, contra o app real
 * subido numa porta livre (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-cadastro-http.ts
 *
 * Fluxo vigente desde 14/11/2026 (Cloud API da Meta em produção): o telefone é
 * confirmado por um código de 6 dígitos enviado pelo WhatsApp, tanto no cadastro
 * (formulário e Google) quanto em "Esqueci minha senha". A conta continua nascendo
 * inativa e só entra depois que um ADMIN aprova em "Usuários". O código fica no
 * banco só como hash: a suíte troca o hash por um conhecido para poder confirmar.
 * Tudo com e-mail "teste-cad-…"; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const PREFIXO_EMAIL = 'teste-cad-';
const PREFIXO = 'TESTE-CAD';
const SENHA = 'Senha@123';
const CODIGO = '246813';

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

/** Código pendente mais recente do usuário (o que o portal acabou de "enviar"). */
async function codigoPendente(userId: string) {
  return prisma.verificationCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

/** O código real só existe no WhatsApp da pessoa; aqui trocamos o hash por um conhecido. */
async function fixarCodigo(userId: string, codigo = CODIGO): Promise<void> {
  const rec = await codigoPendente(userId);
  assert.ok(rec, 'esperava um código pendente no banco');
  await prisma.verificationCode.update({ where: { id: rec.id }, data: { codeHash: await bcrypt.hash(codigo, 4) } });
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
  const login = (email: string, senha = SENHA) => chamar(null, 'POST', '/auth/login', { email, password: senha });
  const verificar = (userId: string, code: string) => chamar(null, 'POST', '/auth/verify-otp', { userId, code });

  try {
    console.log('Formulário de cadastro (código por WhatsApp)');
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
    let anaId = '';
    await teste('cadastro válido → 200 com userId e "código enviado"; conta inativa, telefone NÃO confirmado, 1 código REGISTER pendente', async () => {
      const r = await cadastro();
      assert.equal(r.status, 200);
      const body = (await r.json()) as { userId: string; message: string };
      assert.match(body.message, /código/i);
      anaId = body.userId;
      const u = await prisma.user.findUnique({ where: { email: emailAna } });
      assert.ok(u);
      assert.equal(u.id, anaId);
      assert.equal(u.isActive, false);
      assert.equal(u.phoneVerified, false);
      assert.equal(u.phone, '+5531984367833');
      assert.equal(u.role, 'USER');
      const codigos = await prisma.verificationCode.findMany({ where: { userId: u.id } });
      assert.equal(codigos.length, 1);
      assert.equal(codigos[0].type, 'REGISTER');
      assert.ok(codigos[0].expiresAt.getTime() > Date.now());
      assert.notEqual(codigos[0].codeHash.length, 6, 'no banco só o hash');
    });
    await teste('login antes de confirmar o telefone → 403 "Verifique seu telefone"', async () => {
      const r = await login(emailAna);
      assert.equal(r.status, 403);
      assert.match(await erroDe(r), /Verifique seu telefone/);
    });
    await teste('cadastrar de novo o mesmo e-mail ainda não confirmado → 200, dados atualizados e código novo (não duplica conta)', async () => {
      const antes = (await codigoPendente(anaId))!;
      const r = await cadastro({ name: `${PREFIXO} Ana Paula`, password: 'Outra@123' });
      assert.equal(r.status, 200);
      assert.equal(((await r.json()) as { userId: string }).userId, anaId);
      assert.equal(await prisma.user.count({ where: { email: emailAna } }), 1);
      assert.equal((await prisma.user.findUnique({ where: { id: anaId } }))!.name, `${PREFIXO} Ana Paula`);
      const codigos = await prisma.verificationCode.findMany({ where: { userId: anaId } });
      assert.equal(codigos.length, 1, 'um código ativo por vez');
      assert.notEqual(codigos[0].id, antes.id);
    });
    await teste('reenviar logo em seguida → 429 "Aguarde"', async () => {
      const r = await chamar(null, 'POST', '/auth/resend-otp', { userId: anaId });
      assert.equal(r.status, 429);
      assert.match(await erroDe(r), /Aguarde/);
    });
    await teste('código errado → 400 "incorreto" e conta a tentativa; nada confirmado', async () => {
      await fixarCodigo(anaId);
      const r = await verificar(anaId, '000000');
      assert.equal(r.status, 400);
      assert.match(await erroDe(r), /incorreto/);
      assert.equal((await codigoPendente(anaId))!.attempts, 1);
      assert.equal((await prisma.user.findUnique({ where: { id: anaId } }))!.phoneVerified, false);
    });
    await teste('5 erros → o próximo dá 429 "Muitas tentativas" mesmo com o código certo', async () => {
      for (let i = 0; i < 4; i++) await verificar(anaId, '000000');
      assert.equal((await codigoPendente(anaId))!.attempts, 5);
      const r = await verificar(anaId, CODIGO);
      assert.equal(r.status, 429);
      assert.equal((await prisma.user.findUnique({ where: { id: anaId } }))!.phoneVerified, false);
    });
    await teste('código expirado → 400 "expirado"', async () => {
      await prisma.verificationCode.updateMany({ where: { userId: anaId }, data: { attempts: 0, expiresAt: new Date(Date.now() - 1000) } });
      const r = await verificar(anaId, CODIGO);
      assert.equal(r.status, 400);
      assert.match(await erroDe(r), /expirado/);
    });
    await teste('código certo → 200 "Telefone verificado", conta segue inativa, códigos limpos', async () => {
      await prisma.verificationCode.updateMany({ where: { userId: anaId }, data: { expiresAt: new Date(Date.now() + 60_000) } });
      const r = await verificar(anaId, CODIGO);
      assert.equal(r.status, 200);
      assert.match(((await r.json()) as { message: string }).message, /verificado/i);
      const u = (await prisma.user.findUnique({ where: { id: anaId } }))!;
      assert.equal(u.phoneVerified, true);
      assert.equal(u.isActive, false);
      assert.equal(await prisma.verificationCode.count({ where: { userId: anaId } }), 0);
    });
    await teste('verificar de novo → 409 "já verificado"; cadastrar o mesmo e-mail → 409 "aguardando aprovação" sem sobrescrever a senha', async () => {
      assert.equal((await verificar(anaId, CODIGO)).status, 409);
      const antes = (await prisma.user.findUnique({ where: { id: anaId } }))!.passwordHash;
      const r = await cadastro({ password: 'Terceira@123' });
      assert.equal(r.status, 409);
      assert.match(await erroDe(r), /aguardando aprovação/);
      assert.equal((await prisma.user.findUnique({ where: { id: anaId } }))!.passwordHash, antes);
    });
    await teste('login confirmado mas não aprovado → 403 "aguardando aprovação"; ADMIN aprova → 200', async () => {
      const r = await login(emailAna, 'Outra@123');
      assert.equal(r.status, 403);
      assert.match(await erroDe(r), /aguardando aprovação/);
      assert.equal((await chamar(admin, 'PATCH', `/users/${anaId}/toggle-active`)).status, 200);
      assert.equal((await login(emailAna, 'Outra@123')).status, 200);
    });
    await teste('e-mail já ativo → 409 "E-mail já cadastrado"', async () => {
      const r = await cadastro();
      assert.equal(r.status, 409);
      assert.match(await erroDe(r), /já cadastrado/);
    });

    ipDoBloco = '10.9.0.2';
    console.log('Cadastro via Google (coleta e confirmação do telefone)');
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
    await teste('telefone válido → 200 com userId; número gravado, código pendente, não confirmado', async () => {
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '+5531984367834' });
      assert.equal(r.status, 200);
      assert.equal(((await r.json()) as { userId: string }).userId, bia.id);
      const u = (await prisma.user.findUnique({ where: { id: bia.id } }))!;
      assert.equal(u.phone, '+5531984367834');
      assert.equal(u.phoneVerified, false);
      assert.equal(u.isActive, false);
      assert.equal(await prisma.verificationCode.count({ where: { userId: bia.id } }), 1);
    });
    await teste('errou o número? enquanto não confirmou pode informar outro (200) e o código é renovado', async () => {
      const antes = (await codigoPendente(bia.id))!;
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '+5531984367835' });
      assert.equal(r.status, 200);
      assert.equal((await prisma.user.findUnique({ where: { id: bia.id } }))!.phone, '+5531984367835');
      assert.notEqual((await codigoPendente(bia.id))!.id, antes.id);
    });
    await teste('código certo → confirmado; depois disso a rota pública NÃO troca mais o número (409)', async () => {
      await fixarCodigo(bia.id);
      assert.equal((await verificar(bia.id, CODIGO)).status, 200);
      assert.equal((await prisma.user.findUnique({ where: { id: bia.id } }))!.phoneVerified, true);
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: bia.id, phone: '+5531984367836' });
      assert.equal(r.status, 409);
      assert.equal((await prisma.user.findUnique({ where: { id: bia.id } }))!.phone, '+5531984367835');
    });
    await teste('conta ativa também não troca (409)', async () => {
      const r = await chamar(null, 'POST', '/auth/google/phone', { userId: admin.id, phone: '+5531984367836' });
      assert.equal(r.status, 409);
      assert.equal((await prisma.user.findUnique({ where: { id: admin.id } }))!.phone, '+5531999990000');
    });

    ipDoBloco = '10.9.0.3';
    console.log('Esqueci minha senha (código por WhatsApp)');
    const pedir = (email: string) => chamar(null, 'POST', '/auth/request-password-reset', { email });
    const redefinir = (email: string, code: string, password: string) => chamar(null, 'POST', '/auth/reset-password', { email, code, password });
    await teste('e-mail desconhecido → 200 com a mesma mensagem genérica (não revela quem existe)', async () => {
      const r = await pedir(`${PREFIXO_EMAIL}ninguem@gmail.com`);
      assert.equal(r.status, 200);
      assert.match(((await r.json()) as { message: string }).message, /Se houver uma conta/);
    });
    await teste('e-mail da Ana → 200 genérico e um código RESET pendente', async () => {
      const r = await pedir(emailAna);
      assert.equal(r.status, 200);
      assert.match(((await r.json()) as { message: string }).message, /Se houver uma conta/);
      const rec = (await codigoPendente(anaId))!;
      assert.equal(rec.type, 'RESET');
    });
    await teste('pedir de novo em menos de 60 s → 429', async () => {
      assert.equal((await pedir(emailAna)).status, 429);
    });
    await teste('código errado → 400 e a senha atual continua valendo', async () => {
      await fixarCodigo(anaId);
      const r = await redefinir(emailAna, '000000', 'Nova@12345');
      assert.equal(r.status, 400);
      assert.equal((await login(emailAna, 'Outra@123')).status, 200);
    });
    await teste('e-mail inexistente com código → 400 genérico', async () => {
      assert.equal((await redefinir(`${PREFIXO_EMAIL}ninguem@gmail.com`, CODIGO, 'Nova@12345')).status, 400);
    });
    await teste('senha curta → 400 e o código NÃO é gasto', async () => {
      const r = await redefinir(emailAna, CODIGO, '123');
      assert.equal(r.status, 400);
      assert.equal(await prisma.verificationCode.count({ where: { userId: anaId } }), 1);
    });
    await teste('código certo → 200; a antiga para de valer, a nova entra e os códigos somem', async () => {
      const r = await redefinir(emailAna, CODIGO, 'Nova@12345');
      assert.equal(r.status, 200);
      assert.equal((await login(emailAna, 'Outra@123')).status, 401);
      assert.equal((await login(emailAna, 'Nova@12345')).status, 200);
      assert.equal(await prisma.verificationCode.count({ where: { userId: anaId } }), 0);
    });
    await teste('usar o mesmo código de novo → 400 "Nenhum código pendente"', async () => {
      const r = await redefinir(emailAna, CODIGO, 'Outra@999');
      assert.equal(r.status, 400);
      assert.match(await erroDe(r), /Nenhum código/);
    });

    ipDoBloco = '10.9.0.4';
    console.log('Senha provisória (admin, continua como alternativa)');
    const ana = (await prisma.user.findUnique({ where: { email: emailAna } }))!;
    await teste('sem token e GESTOR → 401/403; a senha da Ana continua a mesma', async () => {
      const gestor = await prisma.user.create({
        data: { name: `${PREFIXO} gestor`, email: `${PREFIXO_EMAIL}gestor@gmail.com`, passwordHash: 'x', role: 'GESTOR', isActive: true, modules: '[]' },
      });
      const tokenGestor = jwt.sign({ sub: gestor.id, email: gestor.email, role: 'GESTOR', name: gestor.name, modules: [] }, env.jwtSecret, { expiresIn: '1h' });
      assert.equal((await chamar(null, 'POST', `/users/${ana.id}/reset-password`)).status, 401);
      assert.equal((await chamar({ id: gestor.id, token: tokenGestor }, 'POST', `/users/${ana.id}/reset-password`)).status, 403);
      assert.equal((await login(emailAna, 'Nova@12345')).status, 200, 'a senha original ainda vale');
    });
    let provisoria = '';
    await teste('ADMIN gera a senha provisória: vem UMA vez na resposta, a antiga para de valer e a nova entra', async () => {
      const r = await chamar(admin, 'POST', `/users/${ana.id}/reset-password`);
      assert.equal(r.status, 200);
      const { senhaProvisoria } = (await r.json()) as { senhaProvisoria: string };
      assert.match(senhaProvisoria, /^[A-Za-z0-9]{10}$/);
      assert.doesNotMatch(senhaProvisoria, /[0O1lI]/, 'sem caracteres parecidos');
      assert.equal((await login(emailAna, 'Nova@12345')).status, 401, 'a senha antiga precisa parar de valer');
      assert.equal((await login(emailAna, senhaProvisoria)).status, 200);
      provisoria = senhaProvisoria;
    });

    ipDoBloco = '10.9.0.5';
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
      assert.equal((await login(emailAna, provisoria)).status, 200);
    });
    await teste('nova senha curta → 400; igual à atual → 400', async () => {
      assert.equal((await trocar(contaAna, provisoria, '123')).status, 400);
      assert.equal((await trocar(contaAna, provisoria, provisoria)).status, 400);
    });
    await teste('troca válida → 200; a antiga para de valer e a nova entra', async () => {
      assert.equal((await trocar(contaAna, provisoria, 'Nova@12345')).status, 200);
      assert.equal((await login(emailAna, provisoria)).status, 401);
      assert.equal((await login(emailAna, 'Nova@12345')).status, 200);
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
