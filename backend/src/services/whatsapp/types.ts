export interface SendOptions {
  /** Marca o envio como disparo em lote → o wa-gateway o coloca na fila (drip/jitter/teto). */
  bulk?: boolean;
}

export interface WhatsAppProvider {
  sendMessage(phone: string, text: string, opts?: SendOptions): Promise<void>;
}
