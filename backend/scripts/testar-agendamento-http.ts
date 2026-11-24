/**
 * Testa o Agendamento de Salas por HTTP, contra o app real subido numa porta
 * livre (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-agendamento-http.ts
 *
 * Regras (decisão de 06/11/2026): TODO usuário logado vê a agenda e reserva; a
 * mesma sala não aceita dois horários sobrepostos (nem em 20 pedidos simultâneos
 * — a trava mora no banco); nada no passado, fim depois do início, mesmo dia em
 * Brasília; alterar e cancelar: o dono (USER ou GESTOR) só a própria, ADMIN qualquer.
 * Excesso: horários encostados valem, a mesma hora em outra sala vale, 20h–22h
 * de Brasília vale (cruza a meia-noite UTC), reservar de novo após cancelar vale,
 * e apagar o usuário não apaga o histórico.
 * Decisão de 23/11/2026: só ADMIN cria reserva recorrente (semanal, dias escolhidos;
 * data ocupada é pulada e avisada) e só ADMIN apaga de vez uma reserva ou a série.
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

  const ana = await criarUsuario('ana', 'USER');
  const bia = await criarUsuario('bia', 'USER');
  const gestor = await criarUsuario('gestor', 'GESTOR');
  const admin = await criarUsuario('admin', 'ADMIN');
  const descartavel = await criarUsuario('descartavel', 'USER');

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
    await teste('qualquer usuário logado vê a agenda, sem precisar de módulo', async () => {
      assert.equal((await chamar(bia, 'GET', `/salas/reservas?data=${DIA}`)).status, 200);
      assert.equal((await chamar(gestor, 'GET', `/salas/reservas?data=${DIA}`)).status, 200);
    });

    console.log('Reservar');
    let idAna = '';
    await teste('USER reserva (201), já confirmada', async () => {
      const r = await reservar(ana, 'Sala Maker', br('10:00'), br('11:00'));
      assert.equal(r.status, 201);
      const b = await r.json() as Reserva;
      assert.equal(b.status, 'CONFIRMADA');
      assert.equal(b.usuarioNome, `${PREFIXO} ana`);
      idAna = b.id;
    });
    let idGestor = '';
    await teste('GESTOR e ADMIN também reservam (201)', async () => {
      const r = await reservar(gestor, 'Sala de Reuniões', br('10:00'), br('11:00'));
      assert.equal(r.status, 201);
      idGestor = (await r.json() as Reserva).id;
      assert.equal((await reservar(admin, 'Sala de Reuniões', br('14:00'), br('15:00'))).status, 201);
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

    console.log('Alterar');
    const alterar = (conta: Conta, id: string, dados: Record<string, string>) => chamar(conta, 'PUT', `/salas/reservas/${id}`, dados);
    await teste('outra pessoa NÃO altera a reserva alheia (403), nem GESTOR', async () => {
      assert.equal((await alterar(bia, idAna, { finalidade: `${PREFIXO} invadida` })).status, 403);
      assert.equal((await alterar(gestor, idAna, { finalidade: `${PREFIXO} invadida` })).status, 403);
      assert.equal((await prisma.reservaSala.findUnique({ where: { id: idAna } }))!.finalidade, `${PREFIXO} aula`);
    });
    await teste('o dono altera finalidade e horário (200); GESTOR altera a própria', async () => {
      const r = await alterar(ana, idAna, { finalidade: `${PREFIXO} aula alterada`, inicio: br('10:00'), fim: br('10:45') });
      assert.equal(r.status, 200);
      const b = await r.json() as Reserva;
      assert.equal(b.fim, new Date(br('10:45')).toISOString());
      assert.equal((await alterar(gestor, idGestor, { finalidade: `${PREFIXO} reunião da gestão` })).status, 200);
    });
    await teste('alterar para cima de outra reserva → 409 e nada muda', async () => {
      const conflito = await alterar(ana, idAna, { inicio: br('09:30'), fim: br('10:30') });
      assert.equal(conflito.status, 409);
      assert.match((await conflito.json() as { error: string }).error, /09:00.*10:00/, 'deve dizer qual horário está ocupado');
      const r = await prisma.reservaSala.findUnique({ where: { id: idAna } });
      assert.equal(r!.inicio.toISOString(), new Date(br('10:00')).toISOString());
    });
    await teste('alterar para o passado, fim antes do início ou outro dia → 400', async () => {
      assert.equal((await alterar(ana, idAna, { inicio: '2020-03-10T10:00:00-03:00', fim: '2020-03-10T11:00:00-03:00' })).status, 400);
      assert.equal((await alterar(ana, idAna, { inicio: br('10:00'), fim: br('09:00') })).status, 400);
      assert.equal((await alterar(ana, idAna, { inicio: br('23:00'), fim: br('01:00', OUTRO_DIA) })).status, 400);
    });
    await teste('mudar de sala vale se o horário estiver livre lá; ADMIN altera a de qualquer um', async () => {
      assert.equal((await alterar(ana, idAna, { salaId: sala('Sala de Reuniões') })).status, 409, 'Reuniões 10h–11h é do gestor');
      assert.equal((await alterar(admin, idGestor, { finalidade: `${PREFIXO} ajustada pelo admin` })).status, 200);
      assert.equal((await alterar(ana, idAna, { salaId: 'nao-existe' })).status, 404);
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
    await teste('GESTOR NÃO cancela a reserva alheia (403), mas cancela a própria (200)', async () => {
      assert.equal((await chamar(gestor, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 403);
      assert.equal((await chamar(gestor, 'POST', `/salas/reservas/${idGestor}/cancelar`)).status, 200);
    });
    await teste('o dono cancela (200); o registro fica como CANCELADA, com quem e quando', async () => {
      assert.equal((await chamar(ana, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 200);
      const r = await prisma.reservaSala.findUnique({ where: { id: idAna } });
      assert.equal(r!.status, 'CANCELADA');
      assert.equal(r!.canceladaPorNome, `${PREFIXO} ana`);
      assert.ok(r!.canceladaEm);
    });
    await teste('cancelar de novo → 409; alterar uma cancelada → 409', async () => {
      assert.equal((await chamar(ana, 'POST', `/salas/reservas/${idAna}/cancelar`)).status, 409);
      assert.equal((await alterar(ana, idAna, { finalidade: `${PREFIXO} ressuscitada` })).status, 409);
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
      const r = await alterar(bia, velha.id, { finalidade: `${PREFIXO} tarde demais` });
      assert.equal(r.status, 400);
      assert.match((await r.json() as { error: string }).error, /já terminou/);
    });

    console.log('Próximas reservas (de todo mundo)');
    await teste('"próximas" exige token (401)', async () => {
      assert.equal((await fetch(`${base}/salas/reservas/proximas`)).status, 401);
    });
    await teste('USER, GESTOR e ADMIN veem as reservas futuras uns dos outros, em ordem de início', async () => {
      const r = await reservar(ana, 'Sala de Reuniões', br('09:00'), br('10:00'));
      const { id: idFutura } = await r.json() as Reserva;
      for (const conta of [bia, gestor, admin]) {
        const lista = await (await chamar(conta, 'GET', '/salas/reservas/proximas')).json() as Reserva[];
        const achada = lista.find((x) => x.id === idFutura);
        assert.ok(achada, 'a reserva da ana precisa aparecer para os outros');
        assert.equal(achada.minha, false);
        assert.equal(achada.usuarioNome, `${PREFIXO} ana`);
        for (let i = 1; i < lista.length; i++) assert.ok(lista[i - 1].inicio <= lista[i].inicio, 'fora de ordem');
      }
    });
    await teste('"próximas" NÃO traz cancelada nem reserva que já terminou', async () => {
      const lista = await (await chamar(admin, 'GET', '/salas/reservas/proximas')).json() as Reserva[];
      assert.equal(lista.some((x) => x.id === idAna), false, 'cancelada apareceu');
      assert.equal(lista.some((x) => x.finalidade === `${PREFIXO} velha`), false, 'reserva de 2020 apareceu');
      assert.ok(lista.every((x) => x.status === 'CONFIRMADA'));
    });

    // 07/04/2031 é segunda-feira. Abril e maio ficam livres do que os blocos acima reservaram.
    console.log('Reserva recorrente (só ADMIN)');
    interface Pulada { dia: string; motivo: string }
    interface Serie { serieId: string; criadas: Array<Reserva & { serieId: string | null }>; puladas: Pulada[] }
    const serie = (conta: Conta, nomeSala: string, dados: Record<string, unknown>, rotulo = 'série') =>
      chamar(conta, 'POST', '/salas/reservas/recorrente', {
        salaId: sala(nomeSala), dataInicio: '2031-04-07', dataFim: '2031-04-27', diasSemana: [1, 3],
        horaInicio: '10:00', horaFim: '11:00', finalidade: `${PREFIXO} ${rotulo}`, ...dados,
      });
    const daSerie = (serieId: string) => prisma.reservaSala.count({ where: { serieId } });
    const emSerie = () => prisma.reservaSala.count({ where: { serieId: { not: null }, finalidade: { startsWith: PREFIXO } } });

    await teste('USER e GESTOR NÃO criam série (403) e nada é gravado', async () => {
      assert.equal((await serie(ana, 'Sala Maker', {})).status, 403);
      assert.equal((await serie(gestor, 'Sala Maker', {})).status, 403);
      assert.equal(await emSerie(), 0);
    });
    let serieMaker = '';
    let idsMaker: string[] = [];
    await teste('ADMIN cria seg+qua por 3 semanas: 6 reservas, mesma série, dias e horas de Brasília', async () => {
      const r = await serie(admin, 'Sala Maker', {});
      assert.equal(r.status, 201);
      const b = await r.json() as Serie;
      assert.deepEqual(b.criadas.map((x) => x.inicio), ['07', '09', '14', '16', '21', '23'].map((d) => new Date(br('10:00', `2031-04-${d}`)).toISOString()));
      assert.deepEqual(b.criadas.map((x) => x.fim), ['07', '09', '14', '16', '21', '23'].map((d) => new Date(br('11:00', `2031-04-${d}`)).toISOString()));
      assert.ok(b.serieId);
      assert.ok(b.criadas.every((x) => x.serieId === b.serieId && x.status === 'CONFIRMADA' && x.minha));
      assert.deepEqual(b.puladas, []);
      assert.equal(await daSerie(b.serieId), 6);
      serieMaker = b.serieId;
      idsMaker = b.criadas.map((x) => x.id);
    });
    await teste('série das 20h às 22h cai no dia certo (cruza a meia-noite UTC)', async () => {
      const r = await serie(admin, 'Sala de Reuniões', { diasSemana: [1], dataFim: '2031-04-14', horaInicio: '20:00', horaFim: '22:00' });
      assert.equal(r.status, 201);
      const b = await r.json() as Serie;
      assert.deepEqual(b.criadas.map((x) => x.inicio), [new Date(br('20:00', '2031-04-07')).toISOString(), new Date(br('20:00', '2031-04-14')).toISOString()]);
    });
    await teste('data ocupada: reserva as livres, pula a ocupada dizendo qual, e não toca na reserva alheia', async () => {
      const alheia = await (await reservar(bia, 'Biblioteca', br('10:30', '2031-05-07'), br('11:30', '2031-05-07'))).json() as Reserva;
      const r = await serie(admin, 'Biblioteca', { dataInicio: '2031-05-05', dataFim: '2031-05-11' });
      assert.equal(r.status, 201);
      const b = await r.json() as Serie;
      assert.deepEqual(b.criadas.map((x) => x.inicio), [new Date(br('10:00', '2031-05-05')).toISOString()]);
      assert.equal(b.puladas.length, 1);
      assert.equal(b.puladas[0].dia, '2031-05-07');
      assert.match(b.puladas[0].motivo, /10:30.*11:30.*bia/);
      assert.equal((await prisma.reservaSala.findUnique({ where: { id: alheia.id } }))!.status, 'CONFIRMADA');
    });
    await teste('todas as datas ocupadas → 409 com a lista, e nenhuma série nasce', async () => {
      const antes = await emSerie();
      const r = await serie(admin, 'Sala Maker', {}, 'série repetida');
      assert.equal(r.status, 409);
      const b = await r.json() as { error: string; puladas: Pulada[] };
      assert.equal(b.puladas.length, 6);
      assert.equal(await emSerie(), antes);
    });
    await teste('corrida na série: se a checagem não vê o conflito, o gatilho barra e a data é pulada (não 500)', async () => {
      const delegate = prisma.reservaSala as unknown as { findFirst: (...a: unknown[]) => Promise<unknown> };
      const original = delegate.findFirst;
      delegate.findFirst = async () => null;
      try {
        const r = await serie(admin, 'Sala Maker', { dataFim: '2031-04-30', diasSemana: [1, 3] }, 'série corrida');
        assert.equal(r.status, 201);
        const b = await r.json() as Serie;
        assert.deepEqual(b.criadas.map((x) => x.inicio), ['28', '30'].map((d) => new Date(br('10:00', `2031-04-${d}`)).toISOString()));
        assert.equal(b.puladas.length, 6);
        await prisma.reservaSala.deleteMany({ where: { serieId: b.serieId } });
      } finally {
        delegate.findFirst = original;
      }
    });
    await teste('pedido inválido → 400 (sem dia da semana, datas trocadas, horas trocadas, período longo, data que não existe, nenhum dia no período)', async () => {
      const antes = await emSerie();
      const casos: Array<Record<string, unknown>> = [
        { diasSemana: [] },
        { diasSemana: [7] },
        { dataInicio: '2031-04-27', dataFim: '2031-04-07' },
        { horaInicio: '11:00', horaFim: '10:00' },
        { horaInicio: '10:00', horaFim: '10:00' },
        { horaInicio: '25:00' },
        { dataFim: '2032-04-09' },
        { dataInicio: '2031-02-31' },
        { dataInicio: '2031-04-07', dataFim: '2031-04-08', diasSemana: [5] },
        { dataInicio: '2020-03-09', dataFim: '2020-03-30' },
        { finalidade: '' },
      ];
      for (const c of casos) assert.equal((await serie(admin, 'Laboratório de Ciências', c)).status, 400, JSON.stringify(c));
      assert.equal((await chamar(admin, 'POST', '/salas/reservas/recorrente', {
        salaId: 'nao-existe', dataInicio: '2031-04-07', dataFim: '2031-04-27', diasSemana: [1], horaInicio: '10:00', horaFim: '11:00', finalidade: `${PREFIXO} x`,
      })).status, 404);
      assert.equal(await emSerie(), antes);
    });
    await teste('série começando hoje: o horário de hoje que já passou é pulado, os próximos dias entram', async () => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const depois = new Date(new Date(`${hoje}T12:00:00Z`).getTime() + 2 * 86400000).toISOString().slice(0, 10);
      const r = await serie(admin, 'Laboratório de Ciências', { dataInicio: hoje, dataFim: depois, diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: '00:00', horaFim: '00:01' }, 'série de hoje');
      assert.equal(r.status, 201);
      const b = await r.json() as Serie;
      assert.equal(b.criadas.length, 2);
      assert.deepEqual(b.puladas.map((p) => p.dia), [hoje]);
      assert.match(b.puladas[0].motivo, /já passou/);
    });
    await teste('as listas trazem a série; reserva comum segue sem série', async () => {
      const lista = await (await chamar(bia, 'GET', '/salas/reservas/proximas')).json() as Array<Reserva & { serieId: string | null }>;
      assert.equal(lista.filter((x) => x.serieId === serieMaker).length, 6);
      const comum = await (await reservar(bia, 'Sala Maker', br('08:00', '2031-04-07'), br('09:00', '2031-04-07'))).json() as Reserva & { serieId: string | null };
      assert.equal(comum.serieId, null);
    });
    await teste('USER e GESTOR não alteram nem cancelam ocorrência da série (403); ADMIN altera uma só e ela continua na série', async () => {
      assert.equal((await alterar(ana, idsMaker[0], { finalidade: `${PREFIXO} invadida` })).status, 403);
      assert.equal((await chamar(gestor, 'POST', `/salas/reservas/${idsMaker[0]}/cancelar`)).status, 403);
      assert.equal((await alterar(admin, idsMaker[0], { finalidade: `${PREFIXO} série ajustada` })).status, 200);
      assert.equal(await daSerie(serieMaker), 6);
      assert.equal((await prisma.reservaSala.findUnique({ where: { id: idsMaker[1] } }))!.finalidade, `${PREFIXO} série`);
    });

    console.log('Exclusão definitiva (só ADMIN)');
    await teste('USER e GESTOR NÃO apagam reserva, nem a própria (403); o registro fica', async () => {
      const dela = await (await reservar(ana, 'Biblioteca', br('08:00', '2031-04-08'), br('09:00', '2031-04-08'))).json() as Reserva;
      const doGestor = await (await reservar(gestor, 'Biblioteca', br('09:00', '2031-04-08'), br('10:00', '2031-04-08'))).json() as Reserva;
      assert.equal((await chamar(ana, 'DELETE', `/salas/reservas/${dela.id}`)).status, 403);
      assert.equal((await chamar(bia, 'DELETE', `/salas/reservas/${dela.id}`)).status, 403);
      assert.equal((await chamar(gestor, 'DELETE', `/salas/reservas/${doGestor.id}`)).status, 403);
      assert.equal((await chamar(null, 'DELETE', `/salas/reservas/${dela.id}`)).status, 401);
      assert.ok(await prisma.reservaSala.findUnique({ where: { id: dela.id } }));
      assert.ok(await prisma.reservaSala.findUnique({ where: { id: doGestor.id } }));
    });
    await teste('ADMIN apaga a reserva de outra pessoa (204): some do banco e o horário fica livre', async () => {
      const dela = await (await reservar(ana, 'Biblioteca', br('13:00', '2031-04-08'), br('14:00', '2031-04-08'))).json() as Reserva;
      const vizinha = await (await reservar(ana, 'Biblioteca', br('14:00', '2031-04-08'), br('15:00', '2031-04-08'))).json() as Reserva;
      assert.equal((await chamar(admin, 'DELETE', `/salas/reservas/${dela.id}`)).status, 204);
      assert.equal(await prisma.reservaSala.findUnique({ where: { id: dela.id } }), null);
      assert.ok(await prisma.reservaSala.findUnique({ where: { id: vizinha.id } }), 'apagou a reserva errada');
      assert.equal((await reservar(bia, 'Biblioteca', br('13:00', '2031-04-08'), br('14:00', '2031-04-08'))).status, 201);
    });
    await teste('ADMIN apaga também reserva cancelada e reserva que já terminou (204)', async () => {
      assert.equal((await chamar(admin, 'DELETE', `/salas/reservas/${idAna}`)).status, 204);
      const velha = await prisma.reservaSala.findFirst({ where: { finalidade: `${PREFIXO} velha` } });
      assert.equal((await chamar(admin, 'DELETE', `/salas/reservas/${velha!.id}`)).status, 204);
      assert.equal(await prisma.reservaSala.findUnique({ where: { id: velha!.id } }), null);
    });
    await teste('apagar reserva que não existe → 404', async () => {
      assert.equal((await chamar(admin, 'DELETE', '/salas/reservas/nao-existe')).status, 404);
    });
    await teste('USER e GESTOR NÃO apagam série (403); a série fica inteira', async () => {
      assert.equal((await chamar(ana, 'DELETE', `/salas/series/${serieMaker}`)).status, 403);
      assert.equal((await chamar(gestor, 'DELETE', `/salas/series/${serieMaker}`)).status, 403);
      assert.equal(await daSerie(serieMaker), 6);
    });
    await teste('ADMIN apaga a série inteira (inclusive ocorrência cancelada) e só ela', async () => {
      assert.equal((await chamar(admin, 'POST', `/salas/reservas/${idsMaker[2]}/cancelar`)).status, 200);
      const fora = () => prisma.reservaSala.count({ where: { finalidade: { startsWith: PREFIXO }, OR: [{ serieId: null }, { serieId: { not: serieMaker } }] } });
      const foraAntes = await fora();
      const r = await chamar(admin, 'DELETE', `/salas/series/${serieMaker}`);
      assert.equal(r.status, 200);
      assert.equal((await r.json() as { apagadas: number }).apagadas, 6);
      assert.equal(await daSerie(serieMaker), 0);
      assert.equal(await fora(), foraAntes);
    });
    await teste('apagar série que não existe → 404', async () => {
      assert.equal((await chamar(admin, 'DELETE', `/salas/series/${serieMaker}`)).status, 404);
      assert.equal((await chamar(admin, 'DELETE', '/salas/series/nao-existe')).status, 404);
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
