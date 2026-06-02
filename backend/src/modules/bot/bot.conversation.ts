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

// No máximo 1 pergunta de esclarecimento — depois abre com o melhor palpite,
// para nunca entrar em loop pedindo o problema.
const MAX_CLARIFY = 1;

function isAffirmative(text: string): boolean {
  return /\b(sim|s|ok|confirm\w*|isso|pode|claro|positivo|yes|y|👍|✅)\b/i.test(text.trim());
}
function isNegative(text: string): boolean {
  return /\b(n[ãa]o|n|corrig\w*|errad\w*|nope|negativo)\b/i.test(text.trim());
}
function isCancel(text: string): boolean {
  return /^(cancelar|sair|parar|cancela|encerrar)$/i.test(text.trim());
}
function isGreetingOnly(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/);
  return words.length <= 3 && /^(oi+|ol[áa]|ola|opa|e?\s*a[ií]|bom dia|boa tarde|boa noite|hey|hi|menu|in[ií]cio|come[çc]ar|teste)\b/i.test(t);
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
 * Classifica o texto acumulado do problema e decide o próximo passo:
 * - se faltar informação E ainda não atingiu o limite de esclarecimentos → pergunta;
 * - caso contrário → monta o rascunho e vai para CONFIRMING (sempre fecha o ciclo).
 */
async function processProblem(phone: string, accumulatedText: string, clarifyCount: number): Promise<void> {
  const c = await classifyTicket(accumulatedText);

  if (c.needsClarification && clarifyCount < MAX_CLARIFY) {
    await saveSession(phone, 'AWAITING_PROBLEM', { problem: accumulatedText, clarifyCount: clarifyCount + 1 });
    await sendBotReply(phone, c.clarifyQuestion || 'Pode me dar mais detalhes sobre o problema (o que está acontecendo e onde)?');
    return;
  }

  const draft = {
    title: c.title,
    description: c.description && c.description.length >= accumulatedText.length ? c.description : accumulatedText,
    category: c.category,
    urgency: c.urgency,
  };
  await saveSession(phone, 'CONFIRMING', { draft });
  await sendBotReply(phone, summary(draft));
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
      // Saudação pura → cumprimenta e pede o problema.
      if (isGreetingOnly(text)) {
        await saveSession(phone, 'AWAITING_PROBLEM', {});
        await sendBotReply(
          phone,
          `Olá, ${firstName}! 👋 Sou a assistente de suporte do CSP.\n\n` +
            `Descreva o problema ou a solicitação que você precisa registrar ` +
            `(ex: "a impressora da sala 12 não imprime").`,
        );
        return;
      }
      // Já veio com conteúdo → trata como o problema diretamente (sem desperdiçar uma rodada).
      await processProblem(phone, text, 0);
      return;
    }

    case 'AWAITING_PROBLEM': {
      // Acumula o que já foi dito + a nova mensagem, e reclassifica com contexto.
      const accumulated = (session.data.problem ? session.data.problem + '\n' : '') + text;
      await processProblem(phone, accumulated, session.data.clarifyCount ?? 0);
      return;
    }

    case 'CONFIRMING': {
      const draft = session.data.draft;
      if (!draft) {
        await saveSession(phone, 'AWAITING_PROBLEM', {});
        await sendBotReply(phone, 'Vamos recomeçar: descreva o problema que você precisa registrar.');
        return;
      }
      // Só interpreta SIM/NÃO em respostas curtas; frases longas são correções.
      const short = text.trim().split(/\s+/).length <= 4;
      if (short && isAffirmative(text)) {
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
      if (short && isNegative(text)) {
        await saveSession(phone, 'AWAITING_PROBLEM', {});
        await sendBotReply(phone, 'Sem problema! Descreva novamente o que você precisa, com mais detalhes.');
        return;
      }
      // Texto livre → trata como nova descrição/correção e reclassifica.
      await processProblem(phone, text, 0);
      return;
    }

    default: {
      await resetSession(phone);
      await sendBotReply(phone, `Olá, ${firstName}! Descreva o problema que você precisa registrar.`);
    }
  }
}
