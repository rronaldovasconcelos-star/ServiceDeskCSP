/**
 * Testa as guardas de segurança da auditoria de 30/10/2026, por HTTP, contra o
 * app real subido numa porta livre (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-seguranca-http.ts
 *
 * A. Status de chamado: dono só cancela; outro usuário não mexe; GESTOR/ADMIN seguem.
 * B. Quem tem o módulo `users` sem ser ADMIN não altera, desativa, apaga nem
 *    redefine a senha de um ADMIN (mas segue gerindo usuários comuns).
 * C. O token vale o que o BANCO diz agora: desativado/apagado → 401; módulo
 *    retirado → 403; perfil rebaixado → perde o que era do perfil.
 * E. Cabeçalhos de segurança na API, sem X-Powered-By; CORS recusado → 403.
 * Tudo com prefixo "TESTE-SEG"; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const PREFIXO_EMAIL = 'teste-seg-';
const PREFIXO_NOME = 'TESTE-SEG';

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIXO_EMAIL } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const tickets = await prisma.ticket.findMany({ where: { requesterId: { in: ids } }, select: { id: true } });
  await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: tickets.map((t) => t.id) } } });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.verificationCode.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

interface Conta { id: string; token: string }

async function criarUsuario(sufixo: string, role: string, modules: string[] = []): Promise<Conta> {
  const u = await prisma.user.create({
    data: {
      name: `${PREFIXO_NOME} ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`, passwordHash: 'x',
      role, isActive: true, modules: JSON.stringify(modules),
    },
  });
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name, modules }, env.jwtSecret, { expiresIn: '1h' });
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

  const dono = await criarUsuario('dono', 'USER');
  const outro = await criarUsuario('outro', 'USER');
  const gestor = await criarUsuario('gestor', 'GESTOR');
  const gestorUsers = await criarUsuario('gestor-users', 'GESTOR', ['users']);
  const admin = await criarUsuario('admin', 'ADMIN');
  const comum = await criarUsuario('comum', 'USER');

  const novoChamado = () => prisma.ticket.create({
    data: { title: `${PREFIXO_NOME} chamado`, description: 'teste de segurança', category: 'TI', urgency: 'BAIXA', status: 'ABERTO', requesterId: dono.id },
  });

  try {
    console.log('A. Status de chamado');
    await teste('outro usuário NÃO cancela chamado alheio (403)', async () => {
      const t = await novoChamado();
      assert.equal((await chamar(outro, 'PATCH', `/tickets/${t.id}/status`, { status: 'CANCELADO' })).status, 403);
      assert.equal((await prisma.ticket.findUnique({ where: { id: t.id } }))!.status, 'ABERTO');
    });
    await teste('dono NÃO inicia atendimento (403)', async () => {
      const t = await novoChamado();
      assert.equal((await chamar(dono, 'PATCH', `/tickets/${t.id}/status`, { status: 'EM_ANDAMENTO' })).status, 403);
    });
    await teste('dono NÃO conclui (403)', async () => {
      const t = await prisma.ticket.update({ where: { id: (await novoChamado()).id }, data: { status: 'EM_ANDAMENTO' } });
      assert.equal((await chamar(dono, 'PATCH', `/tickets/${t.id}/status`, { status: 'CONCLUIDO' })).status, 403);
    });
    await teste('dono CANCELA o próprio chamado (200)', async () => {
      const t = await novoChamado();
      assert.equal((await chamar(dono, 'PATCH', `/tickets/${t.id}/status`, { status: 'CANCELADO' })).status, 200);
    });
    await teste('GESTOR inicia e conclui chamado alheio (200)', async () => {
      const t = await novoChamado();
      assert.equal((await chamar(gestor, 'PATCH', `/tickets/${t.id}/status`, { status: 'EM_ANDAMENTO' })).status, 200);
      assert.equal((await chamar(gestor, 'PATCH', `/tickets/${t.id}/status`, { status: 'CONCLUIDO' })).status, 200);
    });

    console.log('B. Módulo "users" sem ser ADMIN');
    await teste('NÃO troca e-mail/senha de ADMIN (403)', async () => {
      const r = await chamar(gestorUsers, 'PUT', `/users/${admin.id}`, { email: `${PREFIXO_EMAIL}tomado@gmail.com`, password: 'senha-nova-123' });
      assert.equal(r.status, 403);
      assert.equal((await prisma.user.findUnique({ where: { id: admin.id } }))!.email, `${PREFIXO_EMAIL}admin@gmail.com`);
    });
    await teste('NÃO desativa ADMIN (403)', async () => {
      assert.equal((await chamar(gestorUsers, 'PATCH', `/users/${admin.id}/toggle-active`)).status, 403);
      assert.equal((await prisma.user.findUnique({ where: { id: admin.id } }))!.isActive, true);
    });
    await teste('NÃO redefine a senha de ADMIN (403)', async () => {
      assert.equal((await chamar(gestorUsers, 'POST', `/users/${admin.id}/reset-password`)).status, 403);
    });
    await teste('NÃO apaga ADMIN (403)', async () => {
      assert.equal((await chamar(gestorUsers, 'DELETE', `/users/${admin.id}`)).status, 403);
      assert.ok(await prisma.user.findUnique({ where: { id: admin.id } }));
    });
    await teste('SEGUE editando usuário comum (200)', async () => {
      assert.equal((await chamar(gestorUsers, 'PUT', `/users/${comum.id}`, { name: `${PREFIXO_NOME} comum editado` })).status, 200);
    });
    await teste('ADMIN segue editando outro ADMIN (200)', async () => {
      const outroAdmin = await criarUsuario('admin2', 'ADMIN');
      assert.equal((await chamar(admin, 'PUT', `/users/${outroAdmin.id}`, { name: `${PREFIXO_NOME} admin2 editado` })).status, 200);
    });

    console.log('C. Token confere o banco');
    await teste('usuário ativo entra (200)', async () => {
      assert.equal((await chamar(comum, 'GET', '/auth/me')).status, 200);
    });
    await teste('desativado depois do login → 401', async () => {
      const u = await criarUsuario('desativado', 'USER');
      await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      assert.equal((await chamar(u, 'GET', '/tickets')).status, 401);
    });
    await teste('apagado depois do login → 401', async () => {
      const u = await criarUsuario('apagado', 'USER');
      await prisma.user.delete({ where: { id: u.id } });
      assert.equal((await chamar(u, 'GET', '/tickets')).status, 401);
    });
    await teste('módulo retirado depois do login → 403', async () => {
      const u = await criarUsuario('relatorios', 'USER', ['relatorios']);
      assert.equal((await chamar(u, 'GET', '/reports/metrics')).status, 200);
      await prisma.user.update({ where: { id: u.id }, data: { modules: '[]' } });
      assert.equal((await chamar(u, 'GET', '/reports/metrics')).status, 403);
    });
    await teste('ADMIN rebaixado a USER depois do login perde o que era de ADMIN (403)', async () => {
      const u = await criarUsuario('rebaixado', 'ADMIN');
      await prisma.user.update({ where: { id: u.id }, data: { role: 'USER' } });
      assert.equal((await chamar(u, 'GET', '/users')).status, 403);
    });

    console.log('E. Cabeçalhos e CORS');
    await teste('API sem X-Powered-By e com nosniff/frame-deny', async () => {
      const r = await fetch(`${base}/health`);
      assert.equal(r.headers.get('x-powered-by'), null);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
    });
    await teste('origem não permitida → 403 (não 500)', async () => {
      if (env.nodeEnv !== 'production') { console.log('      (pulado: CORS só restringe com NODE_ENV=production)'); return; }
      const r = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    });
    await teste('origem oficial segue liberada (200)', async () => {
      const r = await fetch(`${base}/health`, { headers: { Origin: env.corsOrigins[0] } });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), env.corsOrigins[0]);
    });
  } finally {
    server.close();
    await limpar();
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? '\nTUDO VERDE' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
