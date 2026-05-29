import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'prisma/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbFile = path.resolve(process.cwd(), 'prisma/dev.db');
const dbUrl = pathToFileURL(dbFile).href;

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
