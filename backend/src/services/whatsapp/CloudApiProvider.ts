import { SendOptions, TemplateRef, WhatsAppMessage, WhatsAppProvider } from './types.js';
import { env } from '../../config/env.js';

/**
 * WhatsApp Business Cloud API (canal oficial da Meta).
 *
 * Diferenças relevantes em relação ao canal Baileys (Evolution/wa-gateway):
 *
 * - **Não passa pelo wa-gateway.** Pacing, warmup e kill-switch existem para
 *   proteger número não-oficial de ban; aqui quem controla o ritmo é a própria
 *   Meta (rate limit + qualidade do número). Por isso `opts.bulk` não tem efeito.
 * - **Mensagem iniciada pelo negócio exige template aprovado.** Texto livre só
 *   é entregue dentro da janela de 24h após a última mensagem do contato. Como
 *   praticamente toda notificação do portal é iniciada por nós, uma mensagem
 *   sem `template` é enviada como texto e **provavelmente falhará** fora da
 *   janela — o erro é logado de forma explícita para facilitar o diagnóstico.
 */
export class CloudApiProvider implements WhatsAppProvider {
  private readonly endpoint: string;

  constructor() {
    this.endpoint = `https://graph.facebook.com/${env.cloudApiVersion}/${env.cloudApiPhoneNumberId}/messages`;
  }

  async sendMessage(phone: string, message: WhatsAppMessage, opts?: SendOptions): Promise<void> {
    const to = phone.replace(/\D/g, '');
    const payload = message.template
      ? this.templatePayload(to, message.template)
      : this.textPayload(to, message.text);

    if (!message.template && !opts?.reactive) {
      console.warn(
        `[WhatsApp Cloud] mensagem sem template para ${to} — só será entregue se ` +
          'a janela de 24h estiver aberta.',
      );
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.cloudApiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await describeError(response));
    }
  }

  private textPayload(to: string, body: string) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    };
  }

  private templatePayload(to: string, template: TemplateRef) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: env.cloudApiTemplateLanguage },
        // Templates sem variáveis não podem mandar o componente `body` vazio.
        ...(template.params.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: template.params.map((text) => ({
                    type: 'text',
                    text: sanitizeParam(text),
                  })),
                },
              ],
            }
          : {}),
      },
    };
  }
}

/**
 * Parâmetro de template não pode conter quebra de linha, tab ou 5+ espaços
 * seguidos — a Meta rejeita o envio inteiro. Colapsa tudo em espaço simples e
 * apara o comprimento (limite prático de 1024 caracteres por variável).
 */
export function sanitizeParam(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > 1024 ? `${flat.slice(0, 1021)}...` : flat;
}

/** Converte o erro da Graph API em uma mensagem legível no log. */
async function describeError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
    };
    const err = parsed.error;
    if (err) {
      const details = err.error_data?.details ? ` — ${err.error_data.details}` : '';
      const codes = [err.code, err.error_subcode].filter((c) => c !== undefined).join('/');
      return `WhatsApp Cloud API ${response.status} (${codes}): ${err.message ?? ''}${details}`;
    }
  } catch {
    // corpo não-JSON: cai no retorno cru abaixo
  }
  return `WhatsApp Cloud API error ${response.status}: ${raw}`;
}
