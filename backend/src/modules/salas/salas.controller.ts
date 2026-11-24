import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// O servidor roda em UTC; a escola vive no horário de Brasília. Tudo que é
// "dia" ou "hora" para a pessoa é calculado neste fuso, de forma explícita.
const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

/** Dia no calendário de Brasília, como `aaaa-mm-dd`. */
const diaDe = (d: Date) => fmtDia.format(d);
const horaDe = (d: Date) => fmtHora.format(d);

const DIA_MS = 24 * 60 * 60 * 1000;

const reservaSchema = z.object({
  salaId: z.string().min(1),
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
  finalidade: z.string().trim().min(3).max(200),
});
const alteracaoSchema = reservaSchema.partial();

const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Série semanal: dias e horas são os do relógio de Brasília. `diasSemana`: 0 = domingo … 6 = sábado. */
const serieSchema = z.object({
  salaId: z.string().min(1),
  dataInicio: diaSchema,
  dataFim: diaSchema,
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  finalidade: z.string().trim().min(3).max(200),
});
/** Uma série cobre no máximo um ano (o ano letivo cabe com folga). */
const SERIE_MAX_DIAS = 366;

/** Meio-dia UTC do dia `aaaa-mm-dd`, ou null se a data não existe (31/02). Serve para andar no calendário sem depender de fuso. */
function meioDiaDe(dia: string): Date | null {
  const d = new Date(`${dia}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia ? d : null;
}

/** Instante em que o relógio de Brasília marca `dia` + `hora`, sem fixar o deslocamento do fuso. */
function instanteEmBrasilia(dia: string, hora: string): Date {
  const alvo = Date.parse(`${dia}T${hora}:00Z`);
  let t = alvo;
  for (let i = 0; i < 2; i++) {
    const visto = Date.parse(`${diaDe(new Date(t))}T${horaDe(new Date(t))}:00Z`);
    t += alvo - visto;
  }
  return new Date(t);
}

/** Regras de horário, iguais para criar e alterar. Devolve a mensagem de erro ou null. */
function erroDeHorario(inicio: Date, fim: Date): string | null {
  if (fim.getTime() <= inicio.getTime()) return 'O horário de término precisa ser depois do início.';
  if (inicio.getTime() < Date.now()) return 'Não é possível reservar um horário que já passou.';
  if (diaDe(inicio) !== diaDe(fim)) return 'A reserva precisa começar e terminar no mesmo dia.';
  return null;
}

/** Reserva confirmada que cruza o intervalo na sala (ignorando `exceto`, a própria reserva ao alterar). */
function conflitoEm(salaId: string, inicio: Date, fim: Date, exceto?: string) {
  return prisma.reservaSala.findFirst({
    where: { salaId, status: 'CONFIRMADA', inicio: { lt: fim }, fim: { gt: inicio }, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { inicio: true, fim: true, usuarioNome: true },
    orderBy: { inicio: 'asc' },
  });
}

const campos = {
  id: true, salaId: true, usuarioId: true, usuarioNome: true, inicio: true, fim: true, finalidade: true,
  status: true, canceladaEm: true, canceladaPorNome: true, createdAt: true, serieId: true,
} as const;

interface Linha {
  id: string; salaId: string; usuarioId: string | null; usuarioNome: string; inicio: Date; fim: Date;
  finalidade: string; status: string; canceladaEm: Date | null; canceladaPorNome: string | null; createdAt: Date;
  serieId: string | null;
}

function saida({ usuarioId, ...resto }: Linha, quem: string) {
  return { ...resto, minha: usuarioId === quem };
}

/**
 * O gatilho do banco aborta com a marca RESERVA_CONFLITO quando há reserva
 * confirmada sobreposta. O Prisma entrega isso como P2003 ("foreign key"), com a
 * mensagem original do SQLite guardada em `meta.driverAdapterError`; por isso a
 * marca é procurada na mensagem E no meta. Um P2003 de verdade não tem a marca.
 */
export function ehConflitoDoBanco(err: unknown): boolean {
  const e = err as { message?: unknown; meta?: unknown } | null;
  let meta = '';
  try { meta = JSON.stringify(e?.meta ?? ''); } catch { /* meta circular: fica só a mensagem */ }
  return `${String(e?.message ?? err)} ${meta}`.includes('RESERVA_CONFLITO');
}

export async function listSalas(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const salas = await prisma.sala.findMany({ where: { ativa: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true } });
    res.json(salas);
  } catch (err) { next(err); }
}

/** Reservas confirmadas de um dia (calendário de Brasília), de todas as salas. */
export async function agendaDoDia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.data);
    const meioDia = data.success ? new Date(`${data.data}T12:00:00Z`) : null;
    if (!data.success || !meioDia || Number.isNaN(meioDia.getTime())) {
      res.status(400).json({ error: 'Informe a data no formato aaaa-mm-dd.' });
      return;
    }
    // Busca com folga em volta do dia e filtra pelo dia de Brasília: não depende
    // de saber o deslocamento do fuso naquela data.
    const perto = await prisma.reservaSala.findMany({
      where: { status: 'CONFIRMADA', inicio: { gte: new Date(meioDia.getTime() - 2 * DIA_MS), lt: new Date(meioDia.getTime() + 2 * DIA_MS) } },
      select: campos,
      orderBy: { inicio: 'asc' },
    });
    res.json(perto.filter((r) => diaDe(r.inicio) === data.data).map((r) => saida(r, req.user!.sub)));
  } catch (err) { next(err); }
}

/** Reservas confirmadas de todo mundo que ainda não terminaram, em ordem de início. */
export async function proximasReservas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itens = await prisma.reservaSala.findMany({
      where: { status: 'CONFIRMADA', fim: { gt: new Date() } },
      select: campos,
      orderBy: { inicio: 'asc' },
      take: 300,
    });
    res.json(itens.map((r) => saida(r, req.user!.sub)));
  } catch (err) { next(err); }
}

export async function minhasReservas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itens = await prisma.reservaSala.findMany({
      where: { usuarioId: req.user!.sub },
      select: campos,
      orderBy: { inicio: 'desc' },
      take: 100,
    });
    res.json(itens.map((r) => saida(r, req.user!.sub)));
  } catch (err) { next(err); }
}

export async function reservar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = reservaSchema.parse(req.body);
    const inicio = new Date(data.inicio);
    const fim = new Date(data.fim);

    const erro = erroDeHorario(inicio, fim);
    if (erro) { res.status(400).json({ error: erro }); return; }

    const sala = await prisma.sala.findFirst({ where: { id: data.salaId, ativa: true }, select: { id: true, nome: true } });
    if (!sala) { res.status(404).json({ error: 'Sala não encontrada' }); return; }

    // Checagem amigável: diz QUAL horário está ocupado. A garantia de verdade é o
    // gatilho do banco, que segura também dois pedidos chegando ao mesmo tempo.
    const ocupada = await conflitoEm(sala.id, inicio, fim);
    if (ocupada) {
      res.status(409).json({ error: `${sala.nome} já está reservada das ${horaDe(ocupada.inicio)} às ${horaDe(ocupada.fim)} por ${ocupada.usuarioNome}.` });
      return;
    }

    try {
      const reserva = await prisma.reservaSala.create({
        data: {
          salaId: sala.id,
          usuarioId: req.user!.sub,
          usuarioNome: req.user!.name,
          usuarioEmail: req.user!.email,
          inicio,
          fim,
          finalidade: data.finalidade,
        },
        select: campos,
      });
      res.status(201).json(saida(reserva, req.user!.sub));
    } catch (err) {
      if (!ehConflitoDoBanco(err)) throw err;
      res.status(409).json({ error: `${sala.nome} acabou de ser reservada por outra pessoa nesse horário. Escolha outro horário.` });
    }
  } catch (err) { next(err); }
}

/** Altera sala, horário ou finalidade. Dono (USER ou GESTOR) só a própria; ADMIN qualquer. */
export async function alterar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const data = alteracaoSchema.parse(req.body ?? {});
    const atual = await prisma.reservaSala.findUnique({ where: { id } });
    if (!atual) { res.status(404).json({ error: 'Reserva não encontrada' }); return; }

    const dono = atual.usuarioId === req.user!.sub;
    if (!dono && req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Só quem reservou ou um administrador pode alterar.' }); return; }
    if (atual.status !== 'CONFIRMADA') { res.status(409).json({ error: 'Esta reserva foi cancelada e não pode ser alterada.' }); return; }
    if (atual.fim.getTime() <= Date.now()) { res.status(400).json({ error: 'Esta reserva já terminou.' }); return; }

    const inicio = data.inicio ? new Date(data.inicio) : atual.inicio;
    const fim = data.fim ? new Date(data.fim) : atual.fim;
    const erro = erroDeHorario(inicio, fim);
    if (erro) { res.status(400).json({ error: erro }); return; }

    const sala = await prisma.sala.findFirst({ where: { id: data.salaId ?? atual.salaId, ativa: true }, select: { id: true, nome: true } });
    if (!sala) { res.status(404).json({ error: 'Sala não encontrada' }); return; }

    const ocupada = await conflitoEm(sala.id, inicio, fim, id);
    if (ocupada) {
      res.status(409).json({ error: `${sala.nome} já está reservada das ${horaDe(ocupada.inicio)} às ${horaDe(ocupada.fim)} por ${ocupada.usuarioNome}.` });
      return;
    }

    try {
      const reserva = await prisma.reservaSala.update({
        where: { id },
        data: { salaId: sala.id, inicio, fim, ...(data.finalidade !== undefined ? { finalidade: data.finalidade } : {}) },
        select: campos,
      });
      res.json(saida(reserva, req.user!.sub));
    } catch (err) {
      if (!ehConflitoDoBanco(err)) throw err;
      res.status(409).json({ error: `${sala.nome} acabou de ser reservada por outra pessoa nesse horário. Escolha outro horário.` });
    }
  } catch (err) { next(err); }
}

export async function cancelar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const reserva = await prisma.reservaSala.findUnique({ where: { id }, select: { usuarioId: true, status: true, fim: true } });
    if (!reserva) { res.status(404).json({ error: 'Reserva não encontrada' }); return; }

    const dono = reserva.usuarioId === req.user!.sub;
    if (!dono && req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Só quem reservou ou um administrador pode cancelar.' }); return; }
    if (reserva.status !== 'CONFIRMADA') { res.status(409).json({ error: 'Esta reserva já foi cancelada.' }); return; }
    if (reserva.fim.getTime() <= Date.now()) { res.status(400).json({ error: 'Esta reserva já terminou.' }); return; }

    const atualizada = await prisma.reservaSala.update({
      where: { id },
      data: { status: 'CANCELADA', canceladaEm: new Date(), canceladaPorNome: req.user!.name },
      select: campos,
    });
    res.json(saida(atualizada, req.user!.sub));
  } catch (err) { next(err); }
}

/**
 * Reserva recorrente (só ADMIN, barrado no router): mesma sala e mesmo horário nos
 * dias da semana escolhidos, de `dataInicio` a `dataFim`. Cada data vira uma reserva
 * comum, com o mesmo `serieId`. Data ocupada (ou horário de hoje que já passou) é
 * pulada e devolvida em `puladas` — decisão de 23/11/2026: reserva as livres e avisa.
 */
export async function reservarSerie(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = serieSchema.parse(req.body);
    const primeiro = meioDiaDe(data.dataInicio);
    const ultimo = meioDiaDe(data.dataFim);
    if (!primeiro || !ultimo) { res.status(400).json({ error: 'Data inválida.' }); return; }
    if (data.horaFim <= data.horaInicio) { res.status(400).json({ error: 'O horário de término precisa ser depois do início.' }); return; }
    if (ultimo.getTime() < primeiro.getTime()) { res.status(400).json({ error: 'A data final precisa ser igual ou depois da inicial.' }); return; }
    if (data.dataInicio < diaDe(new Date())) { res.status(400).json({ error: 'A data inicial já passou.' }); return; }
    if ((ultimo.getTime() - primeiro.getTime()) / DIA_MS > SERIE_MAX_DIAS) { res.status(400).json({ error: 'A repetição pode cobrir no máximo um ano.' }); return; }

    const dias: string[] = [];
    for (let t = primeiro.getTime(); t <= ultimo.getTime(); t += DIA_MS) {
      const d = new Date(t);
      if (data.diasSemana.includes(d.getUTCDay())) dias.push(d.toISOString().slice(0, 10));
    }
    if (dias.length === 0) { res.status(400).json({ error: 'Nenhum dia do período cai nos dias da semana escolhidos.' }); return; }

    const sala = await prisma.sala.findFirst({ where: { id: data.salaId, ativa: true }, select: { id: true, nome: true } });
    if (!sala) { res.status(404).json({ error: 'Sala não encontrada' }); return; }

    const serieId = randomUUID();
    const criadas: Linha[] = [];
    const puladas: Array<{ dia: string; motivo: string }> = [];
    for (const dia of dias) {
      const inicio = instanteEmBrasilia(dia, data.horaInicio);
      const fim = instanteEmBrasilia(dia, data.horaFim);
      if (inicio.getTime() < Date.now()) { puladas.push({ dia, motivo: 'Esse horário já passou.' }); continue; }
      const ocupada = await conflitoEm(sala.id, inicio, fim);
      if (ocupada) {
        puladas.push({ dia, motivo: `Já reservada das ${horaDe(ocupada.inicio)} às ${horaDe(ocupada.fim)} por ${ocupada.usuarioNome}.` });
        continue;
      }
      try {
        criadas.push(await prisma.reservaSala.create({
          data: {
            salaId: sala.id,
            usuarioId: req.user!.sub,
            usuarioNome: req.user!.name,
            usuarioEmail: req.user!.email,
            inicio,
            fim,
            finalidade: data.finalidade,
            serieId,
          },
          select: campos,
        }));
      } catch (err) {
        if (!ehConflitoDoBanco(err)) throw err;
        puladas.push({ dia, motivo: 'Acabou de ser reservada por outra pessoa nesse horário.' });
      }
    }

    if (criadas.length === 0) {
      res.status(409).json({ error: `Nenhuma data ficou reservada: ${sala.nome} não está livre em nenhuma delas.`, puladas });
      return;
    }
    res.status(201).json({ serieId, criadas: criadas.map((r) => saida(r, req.user!.sub)), puladas });
  } catch (err) { next(err); }
}

/**
 * Apaga a reserva de vez (só ADMIN, barrado no router): de qualquer pessoa, em
 * qualquer situação, inclusive cancelada ou já encerrada. Diferente de cancelar,
 * não deixa histórico no banco — fica só a linha no log do servidor.
 */
export async function excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const reserva = await prisma.reservaSala.findUnique({ where: { id }, select: { salaId: true, usuarioNome: true, inicio: true, fim: true, finalidade: true } });
    if (!reserva) { res.status(404).json({ error: 'Reserva não encontrada' }); return; }
    await prisma.reservaSala.delete({ where: { id } });
    console.log(`[salas] reserva apagada por ${req.user!.email}: ${reserva.salaId} ${reserva.inicio.toISOString()}–${reserva.fim.toISOString()}, de ${reserva.usuarioNome} (${reserva.finalidade})`);
    res.status(204).end();
  } catch (err) { next(err); }
}

/** Apaga de vez todas as ocorrências de uma série (só ADMIN, barrado no router). */
export async function excluirSerie(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const serieId = String(req.params.serieId);
    const { count } = await prisma.reservaSala.deleteMany({ where: { serieId } });
    if (count === 0) { res.status(404).json({ error: 'Série não encontrada' }); return; }
    console.log(`[salas] série ${serieId} apagada por ${req.user!.email}: ${count} reserva(s)`);
    res.json({ apagadas: count });
  } catch (err) { next(err); }
}
