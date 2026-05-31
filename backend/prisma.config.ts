import { defineConfig } from 'prisma/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const DB_URL = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';

export default defineConfig({
  datasource: {
    url: DB_URL,
  },
  migrate: {
    async adapter() {
      const libsql = createClient({ url: DB_URL });
      return new PrismaLibSql(libsql);
    },
  },
});
