#!/bin/sh
set -e

echo "[start] Running Prisma migrations..."
DATABASE_URL="file:/app/prisma/dev.db" npx prisma migrate deploy

echo "[start] Seeding if needed..."
node --input-type=module << 'EOF'
import { prisma } from './dist/lib/prisma.js';
import bcrypt from 'bcryptjs';

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
  console.log('[seed] Banco já populado, seed ignorado.');
}

await prisma.$disconnect();
EOF

echo "[start] Starting server..."
exec node dist/server.js
