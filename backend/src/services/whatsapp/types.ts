export interface SendOptions {
  /** Marca o envio como disparo em lote → o wa-gateway o coloca na fila (drip/jitter/teto). */
  bulk?: boolean;
  /**
   * Resposta a uma mensagem do contato (bot de suporte). A janela de 24h da
   * Cloud API está aberta, então texto livre é legítimo e não exige template.
   */
  reactive?: boolean;
}

/**
 * Referência a um template aprovado na Meta (WhatsApp Business Cloud API).
 *
 * A Cloud API só permite mensagem iniciada pelo negócio (fora da janela de 24h)
 * através de um template previamente aprovado. Os parâmetros **não podem conter
 * quebra de linha, tab ou 5+ espaços seguidos** — a Meta rejeita o envio. Por
 * isso cada variável carrega um pedaço curto, de uma linha só; a formatação
 * multilinha mora no corpo fixo do template, cadastrado no WhatsApp Manager
 * (ver `docs/whatsapp-cloud-api.md`).
 */
export interface TemplateRef {
  /** Nome do template como cadastrado na Meta (ex: `csp_chamado_status`). */
  name: string;
  /** Valores das variáveis {{1}}, {{2}}... na ordem. */
  params: string[];
}

/**
 * Mensagem em suas duas formas: o texto livre (usado pelos providers Baileys —
 * Evolution/gateway — e pelo mock) e o template equivalente (usado pela Cloud
 * API). Manter as duas juntas permite que os dois canais coexistam sem que cada
 * ponto de notificação precise saber qual provider está ativo.
 */
export interface WhatsAppMessage {
  /** Texto completo, com formatação e quebras de linha. */
  text: string;
  /** Equivalente aprovado na Meta. Ausente = a mensagem não pode iniciar conversa na Cloud API. */
  template?: TemplateRef;
}

/** Uma mensagem pode ser passada como texto puro (legado) ou estruturada. */
export type MessageInput = string | WhatsAppMessage;

/** Normaliza a entrada para a forma estruturada. */
export function toMessage(input: MessageInput): WhatsAppMessage {
  return typeof input === 'string' ? { text: input } : input;
}

export interface WhatsAppProvider {
  sendMessage(phone: string, message: WhatsAppMessage, opts?: SendOptions): Promise<void>;
}
