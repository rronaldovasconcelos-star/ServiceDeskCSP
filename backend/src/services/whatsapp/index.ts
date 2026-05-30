import { env } from '../../config/env.js';
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
  try {
    await provider.sendMessage(phone, text);
  } catch (err) {
    // Fire-and-forget: WhatsApp failure never breaks the main flow
    console.error('[WhatsApp]', err instanceof Error ? err.message : err);
  }
}

/**
 * Envia mensagem e PROPAGA o erro em caso de falha.
 * Usado em fluxos onde a entrega é crítica (ex: código OTP de cadastro),
 * para que o chamador possa avisar o usuário.
 */
export async function sendWhatsAppStrict(phone: string, text: string): Promise<void> {
  await provider.sendMessage(phone, text);
}
