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

const INSECURE_ADMIN_PASSWORD = 'Admin@123';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@santapaula.com.br';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? INSECURE_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador';

// Em produção, recusa criar o admin com a senha default pública conhecida.
if (process.env.NODE_ENV === 'production' && ADMIN_PASSWORD === INSECURE_ADMIN_PASSWORD) {
  console.error(
    '[seed] SEED_ADMIN_PASSWORD não definido (ou igual ao default inseguro) em produção. ' +
      'Defina uma senha forte antes de rodar o seed.',
  );
  process.exit(1);
}

const SUPPLY_ITEMS = [
  // PAPEL
  { name: 'Papel A4 75g/m²', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas' },
  { name: 'Papel A3 75g/m²', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas' },
  { name: 'Papel Sulfite Colorido', unit: 'resma', category: 'PAPEL', description: 'Resma com 500 folhas coloridas' },
  { name: 'Cartolina', unit: 'unidade', category: 'PAPEL', description: 'Folha 50x66cm' },
  { name: 'Papel Kraft (Pardo)', unit: 'rolo', category: 'PAPEL', description: 'Rolo 60cm x 50m' },
  { name: 'Papel Contact', unit: 'rolo', category: 'PAPEL', description: 'Rolo transparente 45cm x 10m' },
  // TONER
  { name: 'Cartucho de Tinta Preto', unit: 'unidade', category: 'TONER', description: 'Cartucho original preto' },
  { name: 'Cartucho de Tinta Colorido', unit: 'unidade', category: 'TONER', description: 'Cartucho original colorido' },
  { name: 'Toner Laser Preto', unit: 'unidade', category: 'TONER', description: 'Toner para impressora laser' },
  // LIMPEZA
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
  // INFORMATICA
  { name: 'Pen Drive 32GB', unit: 'unidade', category: 'INFORMATICA', description: 'USB 3.0' },
  { name: 'Mouse USB', unit: 'unidade', category: 'INFORMATICA', description: 'Mouse óptico USB' },
  { name: 'Teclado USB', unit: 'unidade', category: 'INFORMATICA', description: 'Teclado ABNT2 USB' },
  { name: 'Cabo HDMI', unit: 'unidade', category: 'INFORMATICA', description: 'Cabo HDMI 1.8m' },
  { name: 'Pilhas AA', unit: 'pacote', category: 'INFORMATICA', description: 'Pacote com 4 unidades' },
  { name: 'Extensão Elétrica', unit: 'unidade', category: 'INFORMATICA', description: 'Extensão 3 tomadas 2m' },
  // OUTROS
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
