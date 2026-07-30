/**
 * Provisiona e audita os templates do portal na WhatsApp Business Account.
 *
 *   npm run whatsapp:templates          # lista o status de cada template
 *   npm run whatsapp:templates -- --criar   # cria os que ainda não existem
 *
 * Exige no .env: WHATSAPP_CLOUD_WABA_ID e WHATSAPP_CLOUD_TOKEN.
 * A criação é idempotente: templates já existentes são apenas reportados.
 * A aprovação é da Meta — normalmente minutos, às vezes horas.
 */
import { env } from '../src/config/env.js';
import { TEMPLATE_DEFINITIONS } from '../src/services/whatsapp/templates.definitions.js';

const LANG = env.cloudApiTemplateLanguage;
const BASE = `https://graph.facebook.com/${env.cloudApiVersion}/${env.cloudApiWabaId}/message_templates`;

interface RemoteTemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
}

async function graph(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.cloudApiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON da Graph API (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const e = parsed?.error ?? {};
    throw new Error(`Graph API ${res.status} (${e.code ?? '?'}): ${e.message ?? text}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`);
  }
  return parsed;
}

/** Todos os templates já cadastrados na WABA (a Graph API pagina de 25 em 25). */
async function fetchExisting(): Promise<RemoteTemplate[]> {
  const all: RemoteTemplate[] = [];
  let url = `${BASE}?limit=100&fields=name,language,status,category,rejected_reason`;
  for (;;) {
    const page = await graph(url);
    all.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next) return all;
    url = next;
  }
}

async function createTemplate(def: (typeof TEMPLATE_DEFINITIONS)[number]): Promise<void> {
  await graph(BASE, {
    method: 'POST',
    body: JSON.stringify({
      name: def.name,
      language: LANG,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: def.body,
          // A Meta exige um exemplo por variável para revisar o template.
          ...(def.example.length ? { example: { body_text: [def.example] } } : {}),
        },
      ],
    }),
  });
}

async function main(): Promise<void> {
  const criar = process.argv.includes('--criar');

  const faltando: string[] = [];
  if (!env.cloudApiWabaId) faltando.push('WHATSAPP_CLOUD_WABA_ID');
  if (!env.cloudApiToken) faltando.push('WHATSAPP_CLOUD_TOKEN');
  if (faltando.length) {
    console.error(`Faltam variáveis de ambiente: ${faltando.join(', ')}`);
    console.error('Veja docs/whatsapp-cloud-api.md para obter cada valor.');
    process.exit(1);
  }

  const existing = await fetchExisting();
  const byName = new Map(existing.filter((t) => t.language === LANG).map((t) => [t.name, t]));

  console.log(`WABA ${env.cloudApiWabaId} — idioma ${LANG}\n`);

  let criados = 0;
  let aprovados = 0;
  for (const def of TEMPLATE_DEFINITIONS) {
    const remote = byName.get(def.name);

    if (!remote) {
      if (!criar) {
        console.log(`  ausente    ${def.name}`);
        continue;
      }
      try {
        await createTemplate(def);
        console.log(`  criado     ${def.name}  (aguardando revisão da Meta)`);
        criados++;
      } catch (err) {
        console.error(`  FALHOU     ${def.name}: ${err instanceof Error ? err.message : err}`);
      }
      continue;
    }

    const motivo =
      remote.rejected_reason && remote.rejected_reason !== 'NONE' ? `  — ${remote.rejected_reason}` : '';
    console.log(`  ${remote.status.toLowerCase().padEnd(10)} ${def.name}${motivo}`);
    if (remote.status === 'APPROVED') aprovados++;
  }

  const total = TEMPLATE_DEFINITIONS.length;
  console.log(`\n${aprovados}/${total} aprovados${criados ? `, ${criados} criado(s) agora` : ''}.`);

  if (!criar && aprovados < total) {
    console.log('Rode com --criar para criar os ausentes.');
  }
  if (aprovados < total) {
    console.log('O portal só deve ir para WHATSAPP_PROVIDER=cloud com todos aprovados.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
