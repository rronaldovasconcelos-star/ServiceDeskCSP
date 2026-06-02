/**
 * Registra o webhook do bot de suporte na instância Evolution dedicada.
 * Execução: npx tsx scripts/setup-bot-webhook.ts [BASE_URL_PUBLICA]
 *
 * Lê do .env:
 *   EVOLUTION_API_URL, EVOLUTION_API_KEY, SUPPORT_EVOLUTION_INSTANCE, BOT_WEBHOOK_SECRET
 * BASE_URL_PUBLICA: URL pública do portal (default: https://servicedeskcsp.com.br),
 *   também pode vir da env APP_PUBLIC_URL.
 *
 * O webhook é apontado para {BASE}/api/bot/webhook/{BOT_WEBHOOK_SECRET}
 * com o evento MESSAGES_UPSERT, sem "webhook por eventos" (endpoint único).
 */
import 'dotenv/config';

const apiUrl = process.env.EVOLUTION_API_URL;
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.SUPPORT_EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE;
const secret = process.env.BOT_WEBHOOK_SECRET;
const baseUrl = process.argv[2] || process.env.APP_PUBLIC_URL || 'https://servicedeskcsp.com.br';

if (!apiUrl || !apiKey || !instance || !secret) {
  console.error('❌  Defina EVOLUTION_API_URL, EVOLUTION_API_KEY, SUPPORT_EVOLUTION_INSTANCE e BOT_WEBHOOK_SECRET no .env.');
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/bot/webhook/${secret}`;

const payload = {
  webhook: {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
  },
};

async function main(): Promise<void> {
  const url = `${apiUrl!.replace(/\/$/, '')}/webhook/set/${instance}`;
  console.log(`→ Configurando webhook da instância "${instance}"`);
  console.log(`  URL do webhook: ${webhookUrl}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey! },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`❌  Evolution respondeu ${res.status}: ${text}`);
    console.error('   Verifique a versão da Evolution — o formato do payload pode variar.');
    process.exit(1);
  }
  console.log('✅  Webhook configurado com sucesso.');
  console.log(text);
}

main().catch((err) => {
  console.error('❌  Falha ao configurar o webhook:', err instanceof Error ? err.message : err);
  process.exit(1);
});
