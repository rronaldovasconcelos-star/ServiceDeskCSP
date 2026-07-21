import { SendOptions, WhatsAppProvider } from './types.js';

export class MockProvider implements WhatsAppProvider {
  async sendMessage(phone: string, text: string, opts?: SendOptions): Promise<void> {
    console.log(`[WhatsApp MOCK]${opts?.bulk ? ' (bulk)' : ''} → ${phone}: ${text}`);
  }
}
