import { SendOptions, WhatsAppProvider } from './types.js';
import { env } from '../../config/env.js';

export class EvolutionProvider implements WhatsAppProvider {
  private readonly instance: string;

  /** `instance` permite enviar por uma instância específica (ex: bot de suporte). Default: a de notificações. */
  constructor(instance?: string) {
    this.instance = instance || env.evolutionInstance;
  }

  async sendMessage(phone: string, text: string, opts?: SendOptions): Promise<void> {
    const url = `${env.evolutionApiUrl}/message/sendText/${this.instance}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.evolutionApiKey,
        // Disparo em lote: o wa-gateway enfileira (drip/jitter/teto). Se a URL
        // apontar direto para a Evolution, o header é simplesmente ignorado.
        ...(opts?.bulk ? { 'X-WA-Priority': 'bulk' } : {}),
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
