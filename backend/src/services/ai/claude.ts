import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { TICKET_CATEGORIES, TICKET_URGENCIES, TicketCategory, TicketUrgency } from '../../modules/tickets/tickets.service.js';

/**
 * Resultado da classificação de um chamado a partir de texto livre.
 * `needsClarification` indica que falta informação essencial; nesse caso
 * `clarifyQuestion` traz uma pergunta curta para o usuário.
 */
export interface TicketClassification {
  title: string;
  description: string;
  category: TicketCategory;
  urgency: TicketUrgency;
  needsClarification: boolean;
  clarifyQuestion: string;
}

const client = env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;

// System prompt fixo → bom candidato a prompt caching (não muda entre requisições).
const SYSTEM_PROMPT =
  `Você é a assistente de suporte do Colégio Santa Paula. Funcionários (professores e equipe) ` +
  `descrevem problemas ou solicitações por WhatsApp e você os transforma em um chamado estruturado.\n\n` +
  `Categorias disponíveis:\n` +
  `- TI: computadores, internet, impressoras, sistemas, projetores, e-mail.\n` +
  `- MANUTENCAO: reparos físicos, elétrica, hidráulica, mobiliário, ar-condicionado, limpeza.\n` +
  `- PEDAGOGICO: material didático, salas, equipamentos de ensino, demandas de aula.\n` +
  `- ADMINISTRATIVO: documentos, secretaria, financeiro, RH, processos administrativos.\n` +
  `- OUTROS: quando não se encaixar claramente nas anteriores.\n\n` +
  `Urgência:\n` +
  `- BAIXA: pode esperar, sem impacto imediato.\n` +
  `- MEDIA: atrapalha mas há contorno.\n` +
  `- ALTA: impacta o trabalho agora.\n` +
  `- URGENTE: paralisa atividade/aula ou tem risco.\n\n` +
  `Gere um título curto (3 a 8 palavras) e uma descrição objetiva em português. ` +
  `IMPORTANTE: prefira sempre inferir e abrir o chamado. Só marque needsClarification=true ` +
  `quando for realmente IMPOSSÍVEL saber o que precisa ser feito (ex: mensagem vazia, só uma ` +
  `saudação, ou sem nenhum assunto). Na menor dúvida, classifique com o melhor palpite e ` +
  `needsClarification=false. Quando precisar esclarecer, faça UMA pergunta única e curta.`;

const TOOL_NAME = 'registrar_chamado';

const tool: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Registra o chamado de suporte estruturado a partir da mensagem do funcionário.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título curto do chamado (3 a 8 palavras).' },
      description: { type: 'string', description: 'Descrição objetiva do problema/solicitação.' },
      category: { type: 'string', enum: [...TICKET_CATEGORIES], description: 'Categoria do chamado.' },
      urgency: { type: 'string', enum: [...TICKET_URGENCIES], description: 'Nível de urgência.' },
      needsClarification: {
        type: 'boolean',
        description: 'true se faltar informação essencial para abrir o chamado.',
      },
      clarifyQuestion: {
        type: 'string',
        description: 'Pergunta curta para esclarecer (vazio quando needsClarification=false).',
      },
    },
    required: ['title', 'description', 'category', 'urgency', 'needsClarification', 'clarifyQuestion'],
    additionalProperties: false,
  },
};

/** Fallback determinístico quando a IA está indisponível ou falha. */
function fallbackClassification(userText: string): TicketClassification {
  const firstLine = userText.trim().split('\n')[0] ?? userText.trim();
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || 'Solicitação de suporte';
  return {
    title,
    description: userText.trim(),
    category: 'OUTROS',
    urgency: 'MEDIA',
    needsClarification: false,
    clarifyQuestion: '',
  };
}

function isCategory(v: unknown): v is TicketCategory {
  return typeof v === 'string' && (TICKET_CATEGORIES as readonly string[]).includes(v);
}
function isUrgency(v: unknown): v is TicketUrgency {
  return typeof v === 'string' && (TICKET_URGENCIES as readonly string[]).includes(v);
}

/**
 * Classifica a mensagem de um funcionário em um chamado estruturado usando Claude
 * (tool use forçado garante a saída no formato esperado). Em qualquer falha,
 * retorna um fallback determinístico para nunca travar o atendimento.
 */
export async function classifyTicket(userText: string): Promise<TicketClassification> {
  if (!client) {
    console.warn('[Claude] ANTHROPIC_API_KEY ausente — usando classificação de fallback.');
    return fallbackClassification(userText);
  }

  try {
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    if (!toolUse) return fallbackClassification(userText);

    const input = toolUse.input as Record<string, unknown>;
    return {
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : fallbackClassification(userText).title,
      description: typeof input.description === 'string' && input.description.trim() ? input.description.trim() : userText.trim(),
      category: isCategory(input.category) ? input.category : 'OUTROS',
      urgency: isUrgency(input.urgency) ? input.urgency : 'MEDIA',
      needsClarification: input.needsClarification === true,
      clarifyQuestion: typeof input.clarifyQuestion === 'string' ? input.clarifyQuestion.trim() : '',
    };
  } catch (err) {
    console.error('[Claude] falha na classificação:', err instanceof Error ? err.message : err);
    return fallbackClassification(userText);
  }
}
