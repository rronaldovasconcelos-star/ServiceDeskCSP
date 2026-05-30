import 'dotenv/config';
// Força o MockProvider ANTES de qualquer import que leia o env.
// Assim nenhum disparo real para a Evolution API acontece neste teste.
process.env.WHATSAPP_PROVIDER = 'mock';

const { prisma } = await import('../src/lib/prisma.js');
const notif = await import('../src/modules/tickets/tickets.notifications.js');

async function main() {
  // Usuários de teste com telefone
  const requester = await prisma.user.upsert({
    where: { email: 'teste.solicitante@csp.local' },
    update: { phone: '+5531999990001', isActive: true },
    create: { name: 'João Solicitante', email: 'teste.solicitante@csp.local', passwordHash: 'x', role: 'USER', phone: '+5531999990001', isActive: true },
  });
  const admin = await prisma.user.upsert({
    where: { email: 'teste.admin@csp.local' },
    update: { phone: '+5531999990002', isActive: true, role: 'ADMIN' },
    create: { name: 'Maria Admin', email: 'teste.admin@csp.local', passwordHash: 'x', role: 'ADMIN', phone: '+5531999990002', isActive: true },
  });

  const ticket = {
    id: 'tkt-teste',
    title: 'Computador da recepção não liga',
    category: 'TI',
    urgency: 'ALTA',
    requesterId: requester.id,
  };

  console.log('\n===== 1. ABERTURA =====');
  await notif.notifyTicketCreated(ticket, requester.name, requester.phone);

  console.log('\n===== 2. STATUS: EM_ANDAMENTO =====');
  await notif.notifyStatusChanged(ticket, 'EM_ANDAMENTO');

  console.log('\n===== 3. STATUS: CANCELADO =====');
  await notif.notifyStatusChanged(ticket, 'CANCELADO');

  console.log('\n===== 4. ATRIBUIÇÃO =====');
  await notif.notifyAssigned(ticket, 'Maria Admin');

  console.log('\n===== 5. COMENTÁRIO (solicitante comenta → avisa admins) =====');
  await notif.notifyComment(ticket, 'Continua sem ligar, já tentei na outra tomada.', 'João Solicitante', false);

  console.log('\n===== 6. COMENTÁRIO (admin comenta → avisa solicitante) =====');
  await notif.notifyComment(ticket, 'Vamos enviar um técnico ainda hoje.', 'Maria Admin', true);

  // Limpeza dos usuários de teste
  await prisma.user.deleteMany({ where: { email: { in: ['teste.solicitante@csp.local', 'teste.admin@csp.local'] } } });
  console.log('\n[ok] Teste concluído — nenhuma mensagem real foi enviada (MockProvider).');
  void admin;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
