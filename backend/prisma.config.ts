import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbFile = path.resolve(process.cwd(), 'prisma/dev.db').replace(/\\/g, '/');
const dbUrl = `file:${dbFile}`;

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: dbUrl,
  },
  migrate: {
    async adapter() {
      return new PrismaLibSql({ url: dbUrl });
    },
  },
});
