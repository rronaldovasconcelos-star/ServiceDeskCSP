/**
 * Testa o Agendamento de Salas por HTTP, contra o app real subido numa porta
 * livre (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-agendamento-http.ts
 *
 * Guardas: só quem tem o módulo `agendamento_salas` (ou ADMIN) entra; a mesma
 * sala não aceita dois horários sobrepostos (nem em 20 pedidos simultâneos — a
 * trava mora no banco); nada no passado, fim depois do início, mesmo dia em
 * Brasília; só o dono ou ADMIN cancela.
 * Excesso: horários encostados valem, a mesma hora em outra sala vale, 20h–22h
 * de Brasília vale (cruza a meia-noite UTC), reservar de novo após cancelar vale,
 * e apagar o usuário não apaga o histórico.
 * Tudo com finalidade "TESTE-SALA…" num dia distante; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const PREFIXO_EMAIL = 'teste-sala-';
const PREFIXO = 'TESTE-SALA';
const DIA = '2031-03-10';
const OUTRO_DIA = '2031-03-11';
const MODULO = 'agendamento_salas';

/** Instante a partir de um horário de Brasília (UTC−3, sem horário de verão). */
const br = (hora: string, dia = DIA) => `${dia}T${hora}:00-03:00`;

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  await prisma.reservaSala.deleteMany({ where: { finalidade: { startsWith: PREFIXO } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

interface Conta { id: string; token: string }

async function criarUsuario(sufixo: string, role: string, modules: string[] = []): Promise<Conta> {
  const u = await prisma.user.create({
    data: { name: `${PREFIXO} ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`, passwordHash: 'x', role, isActive: true, modules: JSON.stringify(modules) },
  });
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name, modules }, env.jwtSecret, { expiresIn: '1h' });
  return { id: u.id, token };
}

interface Sala { id: string; nome: string }
interface Reserva { id: string; salaId: string; inicio: string; fim: string; status: string; usuarioNome: string; minha: boolean }

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

  const ana = await criarUsuario('ana', 'USER', [MODULO]);
  const bia = await criarUsuario('bia', 'USER', [MODULO]);
  const semModulo = await criarUsuario('sem-modulo', 'USER');
  const gestorSem = await criarUsuario('gestor-sem', 'GESTOR');
  const admin = await criarUsuario('admin', 'ADMIN');
  const descartavel = await criarUsuario('descartavel', 'USER', [MODULO]);

  let salas: Sala[] = [];
  const sala = (nome: string) => salas.find((s) => s.nome === nome)!.id;
  const reservar = (conta: Conta | null, nomeSala: string, inicio: string, fim: string, rotulo = 'aula') =>
    chamar(conta, 'POST', '/salas/reservas', { salaId: sala(nomeSala), inicio, fim, finalidade: `${PREFIXO} ${rotulo}` });
  const confirmadas = (nomeSala: string) => prisma.reservaSala.count({
    where: { salaId: sala(nomeSala), status: 'CONFIRMADA', finalidade: { startsWith: PREFIXO } },
  });

  try {
    console.log('Acesso');
    await teste('sem token → 401', async () => {
      assert.equal((await chamar(null, 'GET', '/salas')).status, 401);
    });
    await teste('as 4 salas do pedido existem, com os nomes certos', async () => {
      const r = await chamar(ana, 'GET', '/salas');
      assert.equal(r.status, 200);
      salas = await r.json() as Sala[];
      assert.deepEqual(salas.map((s) => s.nome).sort(), ['Biblioteca', 'Laboratório de Ciências', 'Sala Maker', 'Sala de Reuniões']);
    });
    await teste('sem o módulo NÃO vê nem reserva (403), mesmo sendo GESTOR', async () => {
      assert.equal((await chamar(semModulo, 'GET', '/salas')).status, 403);
      assert.equal((await chamar(semModulo, 'GET', `/salas/reservas?data=${DIA}`)).status, 403);
      assert.equal((await reservar(semModulo, 'Biblioteca', br('08:00'), br('09:00'))).status, 403);
      assert.equal((await reservar(gestorSem, 'Biblioteca', br('08:00'), br('09:00'))).status, 403);
      assert.equal(await confirmadas('Biblioteca'), 0);
    });

    console.log('Reservar');
    let idAna = '';
    await teste('com o módulo reserva (201), já confirmada', async () => {
      const r = await reservar(ana, 'Sala Maker', br('10:00'), br('11:00'));
      assert.equal(r.status, 201);
      const b = await r.json() as Reserva;
      assert.equal(b.status, 'CONFIRMADA');
      assert.equal(b.usuarioNome, `${PREFIXO} ana`);
      idAna = b.id;
    });
    await teste('ADMIN reserva sem precisar do módulo (201)', async () => {
      assert.equal((await reservar(admin, 'Sala de Reuniões', br('10:00'), br('11:00'))).status, 201);
    });
    await teste('sobreposição na mesma sala → 409 dizendo o horário ocupado', async () => {
      const casos: Array<[string, string]> = [['10:00', '11:00'], ['09:30', '10:30'], ['10:30', '11:30'], ['10:15', '10:45'], ['09:00', '12:00']];
      for (const [i, f] of casos) {
        const r = await reservar(bia, 'Sala Maker', br(i), br(f));
        assert.equal(r.status, 409, `${i}–${f} deveria conflitar`);
        assert.match((await r.json() as { error: string }).error, /10:00.*11:00/);
      }
      assert.equal(await confirmadas('Sala Maker'), 1);
    });
    await teste('horários encostados valem (9h–10h e 11h–12h)', async () => {
      assert.equal((await reservar(bia, 'Sala Maker', br('09:00'), br('10:00'))).status, 201);
      assert.equal((await reservar(bia, 'Sala Maker', br('11:00'), br('12:00'))).status, 201);
    });
    await teste('a mesma hora em OUTRA sala vale', async () => {
      assert.equal((await reservar(bia, 'Biblioteca', br('10:00'), br('11:00'))).status, 201);
    });
    await teste('20h–22h de Brasília vale (cruza a meia-noite UTC, mas é o mesmo dia aqui)', async () => {
      assert.equal((await reservar(ana, 'Biblioteca', br('20:00'), br('22:00'))).status, 201);
    });

    console.log('Regras de horário');
    await teste('no passado → 400', async () => {
      assert.equal((await reservar(ana, 'Biblioteca', '2020-03-10T10:00:00-03:00', '2020-03-10T11:00:00-03:00')).status, 400);
    });
    await teste('fim antes ou igual ao início → 400', async () => {
      assert.equal((await reservar(ana, 'Biblioteca', br('15:00'), br('14:00'))).status, 400);
      assert.equal((await reservar(ana, 'Biblioteca', br('15:00'), br('15:00'))).status, 400);
    });
    await teste('atravessar para o dia seguinte → 400', async () => {
      assert.equal((await reservar(ana, 'Biblioteca', br('23:00'), br('01:00', OUTRO_DIA))).status, 400);
    });
    await teste('sala inexistente → 404; data inválida e finalidade vazia → 400', async () => {
      assert.equal((await chamar(ana, 'POST', '/salas/reservas', { salaId: 'nao-existe', inicio: br('16:00'), fim: br('17:00'), finalidade: `${PREFIXO} x` })).status, 404);
      assert.equal((await chamar(ana, 'POST', '/salas/reservas', { salaId: sala('Biblioteca'), inicio: 'amanhã', fim: br('17:00'), finalidade: `${PREFIXO} x` })).status, 400);
      assert.equal((await chamar(ana, 'POST', '/salas/reservas', { salaId: sala('Biblioteca'), inicio: br('16:00'), fim: br('17:00'), finalidade: '' })).status, 400);
    });

    console.log('Trava no banco');
    await teste('os gatilhos anti-conflito existem no SQLite', async () => {
      const t = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'ReservaSala'`);
      assert.deepEqual(t.map((x) => x.name).sort(), ['ReservaSala_sem_sobreposicao_insert', 'ReservaSala_sem_sobreposicao_update']);
    });
    await teste('gravar direto no banco, pulando a API, também é barrado', async () => {
      const dados = { salaId: sala('Sala Maker'), usuarioNome: 'x', usuarioEmail: 'x', finalidade: `${PREFIXO} direto`, inicio: new Date(br('10:30')), fim: new Date(br('10:40')) };
      // A marca do gatilho vem dentro do meta do erro do Prisma (conferida aqui sem usar o código da API).
      const marcaDoGatilho = (err: unknown) => JSON.stringify((err as { meta?: unknown }).meta ?? '').includes('RESERVA_CONFLITO');
      await assert.rejects(prisma.reservaSala.create({ data: dados }), marcaDoGatilho);
      // E mover uma reserva existente para cima de outra também.
      const livre = await prisma.reservaSala.create({ data: { ...dados, inicio: new Date(br('13:00')), fim: new Date(br('14:00')) } });
      await assert.rejects(prisma.reservaSala.update({ where: { id: livre.id }, data: { inicio: new Date(br('10:30')), fim: new Date(br('13:30')) } }), marcaDoGatilho);
      await prisma.reservaSala.delete({ where: { id: livre.id } });
      assert.equal(await confirmadas('Sala Maker'), 3);
    });
    await teste('corrida: se a checagem da API não vê o conflito, o gatilho barra e a resposta é 409 (não 500)', async () => {
      // Simula a janela da corrida: a consulta prévia responde "livre" e a gravação encontra a sala ocupada.
      const delegate = prisma.reservaSala as unknown as { findFirst: (...a: unknown[]) => Promise<unknown> };
      const original = delegate.findFirst;
      delegate.findFirst = async () => null;
      try {
        const r = await reservar(bia, 'Sala Maker', br('10:15'), br('10:45'), 'corrida simulada');
        assert.equal(r.status, 409);
        assert.match((await r.json() as { error: string }).error, /acabou de ser reservada/);
      } finally {
        delegate.findFirst = original;
      }
      assert.equal(await confirmadas('Sala Maker'), 3);
    });
    await teste('20 pedidos simultâneos para o mesmo horário: só 1 passa', async () => {
      const respostas = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        reservar(i % 2 ? ana : bia, 'Laboratório de Ciências', br('14:00'), br('15:00'), `corrida ${i}`)));
      const status = respostas.map((r) => r.status);
      assert.equal(status.filter((s) => s === 201).length, 1, `status: ${status.join(',')}`);
      assert.equal(status.filter((s) => s === 409).length, 19, `status: ${status.join(',')}`);
      assert.equal(await confirmadas('Laboratório de Ciências'), 1);
    });

    console.log('Agenda e cancelamento');
    await teste('a agenda do dia mostra as reservas e marca as minhas', async () => {
      const r = await chamar(ana, 'GET', `/salas/reservas?data=${DIA}`);
      assert.equal(r.status, 200);
      const lista = (await r.json() as Reserva[]).filter((x) => x.salaId === sala('Sala Maker'));
      assert.equal(lista.length, 3);
      assert.equal(lista.find((x) => x.id === idAna)?.minha, true);
      assert.equal(lista.filter((x) => x.minha).length, 1);
      const amanha = await (await chamar(ana, 'GET', `/salas/reservas?data=${OUTRO_DIA}`)).json() as Reserva[];
      assert.equal(amanha.some((x) => x.id === idAna), false);
    });
    await teste('a reserva das 20h aparece no dia de Brasília, não no dia seguinte', async () => {
      const hoje = await (await chamar(ana, 'GET', `/salas/reservas?data=${DIA}`)).json() as Reserva[];
      const amanha = await (await chamar(ana, 'GET', `/salas/reservas?data=${OUTRO_DIA}`)).json() as Reserva[];
      const noite = (l: Reserva[]) => l.filter((x) => x.salaId === sala('Biblioteca') && x.inicio === new Date(br('20:00')).toISOString()).length;
      assert.equal(noite(hoje), 1);
      assert.equal(noite(amanha), 0);
    });
    await teste('"minhas reservas" traz só as da pessoa', async () => {
      const minhas = await (await chamar(ana, 'GET', '/salas/reservas/minhas')).json() as Reserva[];
      assert.ok(minhas.some((x) => x.id === idAna));
      assert.ok(minhas.every((x) => x.usuarioNome === `${PREFIXO} ana`));
    });
    await teste('outra pessoa NÃO cancela a reserva alheia (403)', async () => {
      assert.equal((await chamar(bia, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 403);
      assert.equal((await prisma.reservaSala.findUnique({ where: { id: idAna } }))!.status, 'CONFIRMADA');
    });
    await teste('quem perdeu o módulo não cancela nem a própria (403)', async () => {
      await prisma.user.update({ where: { id: ana.id }, data: { modules: '[]' } });
      assert.equal((await chamar(ana, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 403);
      await prisma.user.update({ where: { id: ana.id }, data: { modules: JSON.stringify([MODULO]) } });
    });
    await teste('o dono cancela (200); o registro fica como CANCELADA, com quem e quando', async () => {
      assert.equal((await chamar(ana, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 200);
      const r = await prisma.reservaSala.findUnique({ where: { id: idAna } });
      assert.equal(r!.status, 'CANCELADA');
      assert.equal(r!.canceladaPorNome, `${PREFIXO} ana`);
      assert.ok(r!.canceladaEm);
    });
    await teste('cancelar de novo → 409', async () => {
      assert.equal((await chamar(ana, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 409);
    });
    await teste('depois de cancelar, o horário volta a ficar livre para outra pessoa', async () => {
      assert.equal((await reservar(bia, 'Sala Maker', br('10:00'), br('11:00'))).status, 201);
    });
    await teste('a reserva cancelada some da agenda do dia (fica só no histórico de quem reservou)', async () => {
      const agenda = await (await chamar(bia, 'GET', `/salas/reservas?data=${DIA}`)).json() as Reserva[];
      assert.equal(agenda.some((x) => x.id === idAna), false);
      assert.ok(agenda.every((x) => x.status === 'CONFIRMADA'));
      const minhas = await (await chamar(ana, 'GET', '/salas/reservas/minhas')).json() as Reserva[];
      assert.equal(minhas.find((x) => x.id === idAna)?.status, 'CANCELADA');
    });
    await teste('ADMIN cancela a reserva de qualquer pessoa', async () => {
      const r = await reservar(bia, 'Biblioteca', br('16:00'), br('17:00'));
      const { id } = await r.json() as Reserva;
      assert.equal((await chamar(admin, 'POST', `/salas/reservas/${id}/cancelar`)).status, 200);
      assert.equal((await prisma.reservaSala.findUnique({ where: { id } }))!.canceladaPorNome, `${PREFIXO} admin`);
    });
    await teste('reserva que já terminou não pode ser cancelada (400)', async () => {
      const velha = await prisma.reservaSala.create({
        data: { salaId: sala('Biblioteca'), usuarioId: bia.id, usuarioNome: `${PREFIXO} bia`, usuarioEmail: 'x', finalidade: `${PREFIXO} velha`, inicio: new Date('2020-03-10T13:00:00Z'), fim: new Date('2020-03-10T14:00:00Z') },
      });
      assert.equal((await chamar(bia, 'POST', `/salas/reservas/${velha.id}/cancelar`)).status, 400);
    });

    console.log('Exclusão de usuário');
    await teste('apagar o usuário funciona e o histórico da reserva continua', async () => {
      const r = await reservar(descartavel, 'Biblioteca', br('18:00'), br('19:00'));
      const { id } = await r.json() as Reserva;
      assert.equal((await chamar(admin, 'DELETE', `/users/${descartavel.id}`)).status, 204);
      const reserva = await prisma.reservaSala.findUnique({ where: { id } });
      assert.ok(reserva, 'a reserva não pode sumir com a conta');
      assert.equal(reserva.usuarioNome, `${PREFIXO} descartavel`);
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
