#!/bin/sh
set -e

echo "[start] Running Prisma migrations..."
DATABASE_URL="file:/app/prisma/dev.db" npx prisma migrate deploy

echo "[start] Seeding if needed..."
node --input-type=module << 'EOF'
import { prisma } from './dist/lib/prisma.js';
import bcrypt from 'bcryptjs';

// Admin
const count = await prisma.user.count().catch(() => 0);
if (count === 0) {
  const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@123', 10);
  await prisma.user.create({
    data: {
      name:  process.env.SEED_ADMIN_NAME  || 'Administrador',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@santiagopaula.com.br',
      passwordHash: hash,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log('[seed] Admin criado:', process.env.SEED_ADMIN_EMAIL || 'admin@santiagopaula.com.br');
} else {
  console.log('[seed] Admin já existe, ignorado.');
}

// Catálogo de suprimentos
const SUPPLY_ITEMS = [
  { name: 'Papel A4 75g/m²', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas' },
  { name: 'Papel A3 75g/m²', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas' },
  { name: 'Papel Sulfite Colorido', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas coloridas' },
  { name: 'Cartolina', unit: 'unidade', category: 'PAPEL', description: 'Folha 50x66cm' },
  { name: 'Papel Kraft (Pardo)', unit: 'rolo', category: 'PAPEL', description: 'Rolo 60cm x 50m' },
  { name: 'Papel Contact', unit: 'rolo', category: 'PAPEL', description: 'Rolo transparente 45cm x 10m' },
  { name: 'Cartucho de Tinta Preto', unit: 'unidade', category: 'TONER', description: 'Cartucho original preto' },
  { name: 'Cartucho de Tinta Colorido', unit: 'unidade', category: 'TONER', description: 'Cartucho original colorido' },
  { name: 'Toner Laser Preto', unit: 'unidade', category: 'TONER', description: 'Toner para impressora laser' },
  { name: 'Álcool 70%', unit: 'litro', category: 'LIMPEZA', description: 'Álcool líquido 70% INPM' },
  { name: 'Desinfetante', unit: 'litro', category: 'LIMPEZA', description: 'Desinfetante multiuso' },
  { name: 'Detergente', unit: 'litro', category: 'LIMPEZA', description: 'Detergente neutro 500ml' },
  { name: 'Sabonete Líquido', unit: 'litro', category: 'LIMPEZA', description: 'Sabonete líquido para dispenser' },
  { name: 'Papel Toalha', unit: 'rolo', category: 'LIMPEZA', description: 'Rolo folha dupla' },
  { name: 'Papel Higiênico', unit: 'pacote', category: 'LIMPEZA', description: 'Pacote com 4 rolos folha dupla' },
  { name: 'Pano de Chão', unit: 'unidade', category: 'LIMPEZA', description: 'Pano de chão multiuso' },
  { name: 'Saco de Lixo 40L', unit: 'pacote', category: 'LIMPEZA', description: 'Pacote com 50 unidades' },
  { name: 'Saco de Lixo 100L', unit: 'pacote', category: 'LIMPEZA', description: 'Pacote com 20 unidades' },
  { name: 'Esponja de Limpeza', unit: 'pacote', category: 'LIMPEZA', description: 'Pacote com 3 unidades' },
  { name: 'Pen Drive 32GB', unit: 'unidade', category: 'INFORMATICA', description: 'USB 3.0' },
  { name: 'Mouse USB', unit: 'unidade', category: 'INFORMATICA', description: 'Mouse óptico USB' },
  { name: 'Teclado USB', unit: 'unidade', category: 'INFORMATICA', description: 'Teclado ABNT2 USB' },
  { name: 'Cabo HDMI', unit: 'unidade', category: 'INFORMATICA', description: 'Cabo HDMI 1.8m' },
  { name: 'Pilhas AA', unit: 'pacote', category: 'INFORMATICA', description: 'Pacote com 4 unidades' },
  { name: 'Extensão Elétrica', unit: 'unidade', category: 'INFORMATICA', description: 'Extensão 3 tomadas 2m' },
  { name: 'Caneta Esferográfica Azul', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 50 unidades' },
  { name: 'Caneta Esferográfica Preta', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 50 unidades' },
  { name: 'Lápis HB', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 72 unidades' },
  { name: 'Borracha Branca', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 20 unidades' },
  { name: 'Cola Bastão', unit: 'unidade', category: 'OUTROS', description: 'Cola bastão 40g' },
  { name: 'Fita Adesiva (Durex)', unit: 'rolo', category: 'OUTROS', description: 'Rolo 12mm x 30m' },
  { name: 'Grampo 26/6', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 5000 grampos' },
  { name: 'Pincel Atômico Preto', unit: 'unidade', category: 'OUTROS', description: 'Pincel permanente ponta grossa' },
  { name: 'Pincel Atômico Colorido', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 12 cores' },
  { name: 'Marca-texto', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 6 cores' },
  { name: 'Pasta AZ', unit: 'unidade', category: 'OUTROS', description: 'Pasta arquivo AZ lombo largo' },
  { name: 'Clipes', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 100 unidades tamanho 2/0' },
  { name: 'Post-it', unit: 'pacote', category: 'OUTROS', description: 'Bloco adesivo 76x76mm 100 folhas' },
  { name: 'Envelope Ofício', unit: 'pacote', category: 'OUTROS', description: 'Pacote com 100 envelopes branco' },
];

let criados = 0;
for (const item of SUPPLY_ITEMS) {
  const existing = await prisma.supplyItem.findFirst({ where: { name: item.name } });
  if (!existing) {
    await prisma.supplyItem.create({ data: item });
    criados++;
  }
}
console.log(`[seed] Suprimentos: ${criados} novos itens criados.`);

await prisma.$disconnect();
EOF

echo "[start] Starting server..."
exec node dist/server.js
