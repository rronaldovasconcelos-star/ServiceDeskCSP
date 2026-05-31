import { env } from '../../config/env.js';
import { normalizeBrazilPhone } from '../../lib/phone.js';
import { EvolutionProvider } from './EvolutionProvider.js';
import { MockProvider } from './MockProvider.js';
import { WhatsAppProvider } from './types.js';

function buildProvider(): WhatsAppProvider {
  if (env.whatsappProvider === 'evolution' && env.evolutionApiUrl) {
    return new EvolutionProvider();
  }
  return new MockProvider();
}

const provider = buildProvider();

export async function sendWhatsApp(phone: string | null | undefined, text: string): Promise<void> {
  if (!phone) return;
  // Normaliza no envio: garante DDI 55 mesmo para números gravados em formato cru
  // no banco (ex: "(31) 99160-2707"). Sem isso, a Evolution rejeita o número.
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) {
    console.error('[WhatsApp] número inválido, mensagem não enviada:', phone);
    return;
  }
  try {
    await provider.sendMessage(normalized, text);
  } catch (err) {
    // Fire-and-forget: WhatsApp failure never breaks the main flow
    console.error(`[WhatsApp] falha ao enviar para ${normalized}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Envia mensagem e PROPAGA o erro em caso de falha.
 * Usado em fluxos onde a entrega é crítica (ex: código OTP de cadastro),
 * para que o chamador possa avisar o usuário.
 */
export async function sendWhatsAppStrict(phone: string, text: string): Promise<void> {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) {
    throw new Error(`Número de telefone inválido: ${phone}`);
  }
  await provider.sendMessage(normalized, text);
}
