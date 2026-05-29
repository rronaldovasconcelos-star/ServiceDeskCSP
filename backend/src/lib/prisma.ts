import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbFile = path.resolve(__dirname, '../../prisma/dev.db');
const dbUrl = pathToFileURL(defaultDbFile).href;

function createPrisma() {
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter } as never);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
