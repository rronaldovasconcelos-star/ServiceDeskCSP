export interface WhatsAppProvider {
  sendMessage(phone: string, text: string): Promise<void>;
}
