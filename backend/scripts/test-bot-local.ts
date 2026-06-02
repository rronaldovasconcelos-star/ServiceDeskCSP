/**
 * Teste local do bot de suporte (sem Evolution/Anthropic reais).
 * Execução: npx tsx scripts/test-bot-local.ts
 *
 * Sobe o app numa porta de teste, simula eventos messages.upsert do Evolution e
 * verifica: criação de BotSession, máquina de estados, criação de Ticket e o
 * fluxo de número desconhecido (auto-cadastro). Limpa os dados de teste ao final.
 */
process.env.BOT_ENABLED = 'true';
process.env.BOT_WEBHOOK_SECRET = 'testsecret';
process.env.WHATSAPP_PROVIDER = 'mock'; // respostas do bot só vão para o console
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''; // vazio → fallback determinístico
process.env.SUPPORT_EVOLUTION_INSTANCE = 'csp-suporte-test';

const PORT = 3099;
const SECRET = 'testsecret';
const KNOWN_PHONE = '+5531999990001';
const KNOWN_RAW = '5531999990001';
const UNKNOWN_RAW = '5531999990002';
const KNOWN_EMAIL = 'bot-test-known@example.com';

async function post(body: unknown): Promise<number> {
  const res = await fetch(`http://localhost:${PORT}/api/bot/webhook/${SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await res.text().catch(() => '');
  return res.status;
}

let msgSeq = 0;
function upsert(rawNumber: string, text: string) {
  msgSeq += 1;
  return {
    event: 'messages.upsert',
    instance: 'csp-suporte-test',
    data: {
      key: { remoteJid: `${rawNumber}@s.whatsapp.net`, fromMe: false, id: `msg-${msgSeq}` },
      pushName: 'Teste',
      message: { conversation: text },
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { default: app } = await import('../src/app.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const bcrypt = (await import('bcryptjs')).default;

  const server = app.listen(PORT);
  await sleep(300);

  let ok = true;
  const check = (cond: boolean, label: string) => {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    if (!cond) ok = false;
  };

  try {
    // Limpeza preventiva e usuário de teste ativo.
    await prisma.botSession.deleteMany({ where: { phone: { in: [KNOWN_PHONE, '+' + UNKNOWN_RAW] } } });
    await prisma.user.deleteMany({ where: { email: KNOWN_EMAIL } });
    const known = await prisma.user.create({
      data: {
        name: 'Professor Teste',
        email: KNOWN_EMAIL,
        phone: KNOWN_PHONE,
        passwordHash: await bcrypt.hash('x'.repeat(12), 10),
        role: 'USER',
        isActive: true,
        phoneVerified: true,
      },
    });

    // ---- Fluxo do usuário conhecido: abrir chamado ----
    check((await post(upsert(KNOWN_RAW, 'oi'))) === 200, 'webhook responde 200');
    await sleep(200);
    let s = await prisma.botSession.findUnique({ where: { phone: KNOWN_PHONE } });
    check(s?.state === 'AWAITING_PROBLEM', 'após saudação → AWAITING_PROBLEM');

    await post(upsert(KNOWN_RAW, 'a impressora da sala 12 não liga'));
    await sleep(300);
    s = await prisma.botSession.findUnique({ where: { phone: KNOWN_PHONE } });
    check(s?.state === 'CONFIRMING', 'após descrição → CONFIRMING');
    const draft = s ? (JSON.parse(s.data).draft as { title?: string }) : null;
    check(!!draft?.title, 'rascunho do chamado preenchido');

    await post(upsert(KNOWN_RAW, 'sim'));
    await sleep(300);
    s = await prisma.botSession.findUnique({ where: { phone: KNOWN_PHONE } });
    check(s?.state === 'IDLE', 'após confirmar → IDLE');
    const ticket = await prisma.ticket.findFirst({
      where: { requesterId: known.id },
      orderBy: { createdAt: 'desc' },
    });
    check(!!ticket, 'chamado criado no banco');
    check(ticket?.status === 'ABERTO', 'chamado com status ABERTO');

    // ---- Correção do loop: descrição direta no IDLE vai direto p/ CONFIRMING ----
    await post(upsert(KNOWN_RAW, 'o ar condicionado da biblioteca parou de gelar'));
    await sleep(300);
    s = await prisma.botSession.findUnique({ where: { phone: KNOWN_PHONE } });
    check(s?.state === 'CONFIRMING', 'descrição direta no IDLE → CONFIRMING (sem rodada extra)');

    // ---- Dedupe: o MESMO evento (mesmo id) não é reprocessado ----
    const before = await prisma.ticket.count({ where: { requesterId: known.id } });
    const dup = upsert(KNOWN_RAW, 'sim'); // confirma o chamado acima
    await post(dup);
    await sleep(300);
    await post(dup); // id repetido → ignorado
    await sleep(300);
    const after = await prisma.ticket.count({ where: { requesterId: known.id } });
    check(after - before === 1, 'dedupe: evento repetido não cria chamado duplicado');

    // ---- Anti-loop: notificação do próprio sistema é ignorada ----
    const beforeSys = await prisma.ticket.count({ where: { requesterId: known.id } });
    await post(upsert(KNOWN_RAW, '📋 *Novo chamado aberto!*\nProjetor da sala 3\nCategoria: TI\nUrgência: MEDIA\nSolicitante: Fulano'));
    await sleep(300);
    const afterSys = await prisma.ticket.count({ where: { requesterId: known.id } });
    check(afterSys === beforeSys, 'notificação do sistema é ignorada (não vira chamado)');

    // ---- Fluxo de número desconhecido: inicia auto-cadastro ----
    check((await post(upsert(UNKNOWN_RAW, 'oi'))) === 200, 'webhook (desconhecido) responde 200');
    await sleep(200);
    const sUnknown = await prisma.botSession.findUnique({ where: { phone: '+' + UNKNOWN_RAW } });
    check(sUnknown?.state === 'REG_NAME', 'número desconhecido → REG_NAME (auto-cadastro)');

    // ---- Segurança: segredo errado é rejeitado ----
    const bad = await fetch(`http://localhost:${PORT}/api/bot/webhook/errado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upsert(KNOWN_RAW, 'oi')),
    });
    check(bad.status === 404, 'segredo inválido → 404');

    // ---- Limpeza (history cai em cascata ao apagar o ticket) ----
    await prisma.ticket.deleteMany({ where: { requesterId: known.id } });
    await prisma.botSession.deleteMany({ where: { phone: { in: [KNOWN_PHONE, '+' + UNKNOWN_RAW] } } });
    await prisma.user.delete({ where: { id: known.id } });

    console.log(ok ? '\n🎉 Todos os testes passaram.' : '\n⚠️ Há falhas acima.');
  } finally {
    server.close();
    process.exit(ok ? 0 : 1);
  }
}

main().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
