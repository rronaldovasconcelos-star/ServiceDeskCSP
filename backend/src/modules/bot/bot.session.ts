import { prisma } from '../../lib/prisma.js';

/** Estados da máquina de conversa do bot de suporte. */
export type BotState =
  | 'IDLE'
  | 'AWAITING_PROBLEM'
  | 'CONFIRMING'
  | 'REG_NAME'
  | 'REG_EMAIL'
  | 'REG_OTP';

export interface BotSessionData {
  // Rascunho do chamado em confirmação
  draft?: { title: string; description: string; category: string; urgency: string };
  // Cadastro em andamento
  reg?: { name?: string; email?: string; userId?: string };
  // Texto do problema acumulado entre mensagens (para classificar com contexto)
  problem?: string;
  // Quantas perguntas de esclarecimento já foram feitas (limite para não entrar em loop)
  clarifyCount?: number;
}

export interface LoadedSession {
  state: BotState;
  data: BotSessionData;
}

/** Lê a sessão do telefone (cria uma IDLE virtual se não existir). */
export async function loadSession(phone: string): Promise<LoadedSession> {
  const row = await prisma.botSession.findUnique({ where: { phone } });
  if (!row) return { state: 'IDLE', data: {} };
  let data: BotSessionData = {};
  try {
    data = JSON.parse(row.data) as BotSessionData;
  } catch {
    data = {};
  }
  return { state: row.state as BotState, data };
}

/** Grava (upsert) o estado + dados da sessão. */
export async function saveSession(phone: string, state: BotState, data: BotSessionData): Promise<void> {
  const serialized = JSON.stringify(data ?? {});
  await prisma.botSession.upsert({
    where: { phone },
    create: { phone, state, data: serialized },
    update: { state, data: serialized },
  });
}

/** Reseta a sessão para IDLE, limpando rascunhos. */
export async function resetSession(phone: string): Promise<void> {
  await saveSession(phone, 'IDLE', {});
}
