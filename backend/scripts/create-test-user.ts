import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, '../prisma/dev.db');
const dbUrl = pathToFileURL(dbFile).href;

const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter } as never);

// Credenciais provisórias de teste
const EMAIL = process.env.TEST_EMAIL ?? 'teste@csp.local';
const PASSWORD = process.env.TEST_PASSWORD ?? 'Teste@123';
const NAME = process.env.TEST_NAME ?? 'Usuário de Teste';
const ROLE = process.env.TEST_ROLE ?? 'ADMIN'; // ADMIN para testar tudo

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, isActive: true, phoneVerified: true, role: ROLE },
    create: {
      name: NAME,
      email: EMAIL,
      passwordHash,
      role: ROLE,
      isActive: true,
      phoneVerified: true,
    },
  });

  console.log('\n========================================');
  console.log('  USUÁRIO DE TESTE PRONTO');
  console.log('========================================');
  console.log(`  Email:  ${user.email}`);
  console.log(`  Senha:  ${PASSWORD}`);
  console.log(`  Perfil: ${user.role}`);
  console.log(`  ID:     ${user.id}`);
  console.log('========================================\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
