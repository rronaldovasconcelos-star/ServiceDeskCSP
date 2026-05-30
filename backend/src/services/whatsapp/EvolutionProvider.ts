import { WhatsAppProvider } from './types.js';
import { env } from '../../config/env.js';

export class EvolutionProvider implements WhatsAppProvider {
  async sendMessage(phone: string, text: string): Promise<void> {
    const url = `${env.evolutionApiUrl}/message/sendText/${env.evolutionInstance}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.evolutionApiKey,
      },
      body: JSON.stringify({
        number: phone.replace(/\D/g, ''),
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Evolution API error ${response.status}: ${body}`);
    }
  }
}
