import { SendOptions, WhatsAppMessage, WhatsAppProvider } from './types.js';

export class MockProvider implements WhatsAppProvider {
  async sendMessage(phone: string, message: WhatsAppMessage, opts?: SendOptions): Promise<void> {
    // Loga também o template para que a migração p/ Cloud API seja verificável
    // em desenvolvimento, sem depender de credencial da Meta.
    const tpl = message.template
      ? ` [template ${message.template.name}(${message.template.params.join(' | ')})]`
      : ' [SEM TEMPLATE]';
    console.log(`[WhatsApp MOCK]${opts?.bulk ? ' (bulk)' : ''}${tpl} → ${phone}: ${message.text}`);
  }
}
