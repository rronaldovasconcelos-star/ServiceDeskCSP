import { WhatsAppProvider } from './types.js';

export class MockProvider implements WhatsAppProvider {
  async sendMessage(phone: string, text: string): Promise<void> {
    console.log(`[WhatsApp MOCK] → ${phone}: ${text}`);
  }
}
