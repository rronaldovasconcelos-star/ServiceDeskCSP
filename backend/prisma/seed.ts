import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, './dev.db');
const dbUrl = pathToFileURL(dbFile).href;

const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter } as never);

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@santiagopaula.com.br';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador';

const SUPPLY_ITEMS = [
  { name: 'Papel A4 75g', unit: 'resma', category: 'PAPEL', description: 'Resma 500 folhas' },
  { name: 'Papel A4 90g', unit: 'resma', category: 'PAPEL', description: 'Resma 500 folhas' },
  { name: 'Papel Ofício', unit: 'resma', category: 'PAPEL', description: 'Resma 500 folhas' },
  { name: 'Toner Impressora HP', unit: 'unidade', category: 'TONER', description: 'Cartucho toner original' },
  { name: 'Toner Impressora Samsung', unit: 'unidade', category: 'TONER', description: 'Cartucho toner original' },
  { name: 'Álcool 70%', unit: 'litro', category: 'LIMPEZA', description: 'Álcool líquido 70% INPM' },
  { name: 'Papel Higiênico', unit: 'pacote', category: 'LIMPEZA', description: 'Pacote com 4 rolos' },
  { name: 'Detergente', unit: 'unidade', category: 'LIMPEZA', description: '500ml' },
  { name: 'Caneta Esferográfica Azul', unit: 'caixa', category: 'OUTROS', description: 'Caixa com 50 unidades' },
  { name: 'Pilha AA', unit: 'pacote', category: 'INFORMATICA', description: 'Pacote com 4 unidades' },
  { name: 'Cabo HDMI', unit: 'unidade', category: 'INFORMATICA', description: 'Cabo HDMI 1.8m' },
  { name: 'Mouse USB', unit: 'unidade', category: 'INFORMATICA', description: 'Mouse óptico USB' },
];

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: { name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: 'ADMIN', isActive: true },
  });

  console.log(`[seed] Admin OK: ${admin.email} (id: ${admin.id})`);

  for (const item of SUPPLY_ITEMS) {
    const existing = await (prisma as any).supplyItem.findFirst({ where: { name: item.name } });
    if (!existing) {
      await (prisma as any).supplyItem.create({ data: item });
      console.log(`[seed] SupplyItem criado: ${item.name}`);
    }
  }
  console.log('[seed] Catálogo de suprimentos OK');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
