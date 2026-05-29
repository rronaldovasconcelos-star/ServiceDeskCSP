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
