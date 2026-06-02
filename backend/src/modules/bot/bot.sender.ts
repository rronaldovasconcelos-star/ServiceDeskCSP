import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { EvolutionProvider } from '../../services/whatsapp/EvolutionProvider.js';
import { MockProvider } from '../../services/whatsapp/MockProvider.js';
import { WhatsAppProvider } from '../../services/whatsapp/types.js';

/**
 * Provider dedicado à instância de suporte. Usa a Evolution apontando para a
 * instância `SUPPORT_EVOLUTION_INSTANCE`; em dev (sem Evolution) cai no mock.
 */
function buildSupportProvider(): WhatsAppProvider {
  if (env.whatsappProvider === 'evolution' && env.evolutionApiUrl) {
    return new EvolutionProvider(env.supportEvolutionInstance);
  }
  return new MockProvider();
}

const provider = buildSupportProvider();

/**
 * Envia uma resposta do bot de suporte. Fire-and-forget: nunca propaga erro
 * (uma falha de WhatsApp não deve derrubar o processamento do webhook).
 */
export async function sendBotReply(phone: string | null | undefined, text: string): Promise<void> {
  if (!phone) return;
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) {
    console.error('[Bot] número inválido, resposta não enviada:', phone);
    return;
  }
  try {
    await provider.sendMessage(normalized, text);
  } catch (err) {
    console.error(`[Bot] falha ao responder ${normalized}:`, err instanceof Error ? err.message : err);
  }
}
