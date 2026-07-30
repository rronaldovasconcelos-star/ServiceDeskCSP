/**
 * Checagem de prontidão do canal WhatsApp — responde "dá para virar a chave?".
 *
 *   npm run whatsapp:check                 # só diagnostica
 *   npm run whatsapp:check -- 5531984367833  # envia um template de teste
 *
 * Não altera nada em produção: apenas lê a configuração, consulta a Meta e (se
 * um número for passado) manda uma mensagem de teste pelo template `csp_aviso_portal`.
 */
import { env } from '../src/config/env.js';
import { TEMPLATE_DEFINITIONS } from '../src/services/whatsapp/templates.definitions.js';

const ok = (s: string) => `  [ok]     ${s}`;
const falta = (s: string) => `  [FALTA]  ${s}`;
const aviso = (s: string) => `  [aviso]  ${s}`;

async function graph(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.cloudApiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (body as any)?.error ?? {};
    throw new Error(`${res.status} (${e.code ?? '?'}): ${e.message ?? 'erro desconhecido'}`);
  }
  return body;
}

async function main(): Promise<void> {
  const destino = process.argv[2];
  const linhas: string[] = [];
  let bloqueios = 0;

  console.log(`\nCanal ativo: WHATSAPP_PROVIDER=${env.whatsappProvider}\n`);

  // 1) Configuração local
  const req: Array<[string, string]> = [
    ['WHATSAPP_CLOUD_PHONE_NUMBER_ID', env.cloudApiPhoneNumberId],
    ['WHATSAPP_CLOUD_TOKEN', env.cloudApiToken],
  ];
  for (const [nome, valor] of req) {
    if (valor) linhas.push(ok(nome));
    else {
      linhas.push(falta(nome));
      bloqueios++;
    }
  }
  linhas.push(env.cloudApiWabaId ? ok('WHATSAPP_CLOUD_WABA_ID') : aviso('WHATSAPP_CLOUD_WABA_ID (só p/ gerenciar templates)'));
  linhas.push(
    env.cloudApiAppSecret
      ? ok('WHATSAPP_CLOUD_APP_SECRET (assinatura do webhook validada)')
      : aviso('WHATSAPP_CLOUD_APP_SECRET ausente — webhook protegido só pelo segredo na URL'),
  );
  linhas.push(env.botWebhookSecret ? ok('BOT_WEBHOOK_SECRET') : aviso('BOT_WEBHOOK_SECRET ausente — bot de suporte não recebe'));

  console.log('Configuração local:');
  linhas.forEach((l) => console.log(l));

  if (bloqueios) {
    console.log('\nSem as credenciais acima não dá para consultar a Meta. Veja docs/whatsapp-cloud-api.md.\n');
    process.exit(1);
  }

  // 2) O número existe e está utilizável?
  console.log('\nNúmero na Meta:');
  try {
    const n = await graph(
      `https://graph.facebook.com/${env.cloudApiVersion}/${env.cloudApiPhoneNumberId}` +
        '?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status',
    );
    console.log(ok(`${n.display_phone_number} — "${n.verified_name}"`));
    console.log(`           qualidade: ${n.quality_rating ?? '?'} · verificação: ${n.code_verification_status ?? '?'}`);
    if (n.quality_rating && !['GREEN', 'UNKNOWN'].includes(n.quality_rating)) {
      console.log(aviso(`qualidade ${n.quality_rating} — reduza avisos não solicitados`));
    }
  } catch (err) {
    console.log(falta(`não foi possível ler o número: ${err instanceof Error ? err.message : err}`));
    bloqueios++;
  }

  // 3) Templates aprovados?
  console.log('\nTemplates:');
  if (!env.cloudApiWabaId) {
    console.log(aviso('sem WABA_ID não dá para conferir a aprovação'));
  } else {
    try {
      const page = await graph(
        `https://graph.facebook.com/${env.cloudApiVersion}/${env.cloudApiWabaId}/message_templates` +
          `?limit=100&fields=name,language,status`,
      );
      const byName = new Map<string, string>(
        (page.data ?? [])
          .filter((t: any) => t.language === env.cloudApiTemplateLanguage)
          .map((t: any) => [t.name, t.status]),
      );
      let aprovados = 0;
      for (const def of TEMPLATE_DEFINITIONS) {
        const status = byName.get(def.name);
        if (status === 'APPROVED') {
          aprovados++;
          console.log(ok(def.name));
        } else if (status) {
          console.log(falta(`${def.name} — ${status}`));
        } else {
          console.log(falta(`${def.name} — não cadastrado`));
        }
      }
      if (aprovados < TEMPLATE_DEFINITIONS.length) {
        bloqueios++;
        console.log('\n  Rode: npm run whatsapp:templates -- --criar');
      }
    } catch (err) {
      console.log(falta(`não foi possível listar templates: ${err instanceof Error ? err.message : err}`));
      bloqueios++;
    }
  }

  // 4) Envio de teste (opcional)
  if (destino) {
    console.log(`\nEnvio de teste para ${destino}:`);
    try {
      const r = await graph(`https://graph.facebook.com/${env.cloudApiVersion}/${env.cloudApiPhoneNumberId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: destino.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: 'csp_aviso_portal',
            language: { code: env.cloudApiTemplateLanguage },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'Teste de configuração' },
                  { type: 'text', text: 'Se você recebeu esta mensagem, o canal oficial está funcionando.' },
                ],
              },
            ],
          },
        }),
      });
      console.log(ok(`enviado — id ${r.messages?.[0]?.id ?? '?'}`));
    } catch (err) {
      console.log(falta(`envio falhou: ${err instanceof Error ? err.message : err}`));
      bloqueios++;
    }
  }

  console.log(
    bloqueios === 0
      ? '\n✅ Pronto para WHATSAPP_PROVIDER=cloud.\n'
      : `\n❌ ${bloqueios} pendência(s) antes de virar a chave.\n`,
  );
  process.exit(bloqueios === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
