import { prisma } from '../../lib/prisma.js';
import { createTicketForUser, TicketCategory, TicketUrgency } from '../tickets/tickets.service.js';
import { classifyTicket } from '../../services/ai/claude.js';
import { sendBotReply } from './bot.sender.js';
import { handleRegistration, startRegistration } from './bot.registration.js';
import { BotState, loadSession, resetSession, saveSession } from './bot.session.js';

const URGENCY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};
const CATEGORY_LABELS: Record<string, string> = {
  TI: 'TI', MANUTENCAO: 'Manutenção', PEDAGOGICO: 'Pedagógico',
  ADMINISTRATIVO: 'Administrativo', OUTROS: 'Outros',
};

const REG_STATES: BotState[] = ['REG_NAME', 'REG_EMAIL', 'REG_OTP'];

function isAffirmative(text: string): boolean {
  return /^(sim|s|ok|confirmar|confirmo|isso|pode|claro|yes|y|👍)$/i.test(text.trim());
}
function isNegative(text: string): boolean {
  return /^(n[ãa]o|n|corrigir|cancelar|errado|nope)$/i.test(text.trim());
}
function isCancel(text: string): boolean {
  return /^(cancelar|sair|parar|cancela)$/i.test(text.trim());
}

function summary(draft: { title: string; description: string; category: string; urgency: string }): string {
  return (
    `Entendi! Vou abrir este chamado:\n\n` +
    `📌 *${draft.title}*\n` +
    `📝 ${draft.description}\n` +
    `🗂️ Categoria: ${CATEGORY_LABELS[draft.category] ?? draft.category}\n` +
    `⚡ Urgência: ${URGENCY_LABELS[draft.urgency] ?? draft.urgency}\n\n` +
    `Posso confirmar? Responda *SIM* para abrir ou *NÃO* para corrigir.`
  );
}

/**
 * Ponto de entrada da conversa do bot de suporte. `phone` já vem normalizado
 * (+55...). Toda resposta é enviada por `sendBotReply` (fire-and-forget).
 */
export async function handleIncomingMessage(phone: string, text: string): Promise<void> {
  const session = await loadSession(phone);

  // Cadastro em andamento tem prioridade (independe de existir usuário ainda).
  if (REG_STATES.includes(session.state)) {
    await handleRegistration(phone, text, session);
    return;
  }

  // Comando global de cancelamento.
  if (isCancel(text)) {
    await resetSession(phone);
    await sendBotReply(phone, 'Tudo bem, cancelei o atendimento. Quando precisar, é só mandar uma mensagem. 🙂');
    return;
  }

  const user = await prisma.user.findFirst({ where: { phone } });

  // Número desconhecido → inicia auto-cadastro.
  if (!user) {
    await startRegistration(phone);
    return;
  }

  // Conta existente mas ainda não liberada.
  if (!user.isActive) {
    const reason = !user.phoneVerified
      ? 'Seu cadastro ainda não foi concluído.'
      : 'Sua conta está aguardando aprovação de um administrador.';
    await sendBotReply(phone, `${reason}\nAssim que for liberada, você poderá abrir chamados por aqui.`);
    return;
  }

  const firstName = user.name.split(' ')[0] ?? user.name;

  switch (session.state) {
    case 'IDLE': {
      await saveSession(phone, 'AWAITING_PROBLEM', {});
      await sendBotReply(
        phone,
        `Olá, ${firstName}! 👋 Sou a assistente de suporte do CSP.\n\n` +
          `Descreva o problema ou a solicitação que você precisa registrar (ex: "a impressora da sala 12 não imprime").`,
      );
      return;
    }

    case 'AWAITING_PROBLEM': {
      const c = await classifyTicket(text);
      if (c.needsClarification) {
        await sendBotReply(phone, c.clarifyQuestion || 'Pode me dar mais detalhes sobre o problema?');
        return; // permanece em AWAITING_PROBLEM
      }
      const draft = { title: c.title, description: c.description, category: c.category, urgency: c.urgency };
      await saveSession(phone, 'CONFIRMING', { draft });
      await sendBotReply(phone, summary(draft));
      return;
    }

    case 'CONFIRMING': {
      const draft = session.data.draft;
      if (!draft) {
        await saveSession(phone, 'AWAITING_PROBLEM', {});
        await sendBotReply(phone, 'Vamos recomeçar: descreva o problema que você precisa registrar.');
        return;
      }
      if (isAffirmative(text)) {
        const ticket = await createTicketForUser(user.id, {
          title: draft.title,
          description: draft.description,
          category: draft.category as TicketCategory,
          urgency: draft.urgency as TicketUrgency,
        });
        await resetSession(phone);
        await sendBotReply(
          phone,
          `✅ Chamado aberto com sucesso!\n*Protocolo:* ${ticket.id}\n\n` +
            `Você será avisado por aqui a cada atualização. Para abrir outro, é só mandar uma nova mensagem.`,
        );
        return;
      }
      if (isNegative(text)) {
        await saveSession(phone, 'AWAITING_PROBLEM', {});
        await sendBotReply(phone, 'Sem problema! Descreva novamente o que você precisa, com mais detalhes.');
        return;
      }
      await sendBotReply(phone, 'Por favor, responda *SIM* para abrir o chamado ou *NÃO* para corrigir.');
      return;
    }

    default: {
      // Estado desconhecido — reinicia com segurança.
      await resetSession(phone);
      await sendBotReply(phone, `Olá, ${firstName}! Descreva o problema que você precisa registrar.`);
    }
  }
}
