import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./sulco.db';
const authToken = process.env.DATABASE_AUTH_TOKEN;

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: url.startsWith('libsql://') || url.startsWith('https://') ? 'turso' : 'sqlite',
  dbCredentials: authToken ? { url, authToken } : { url },
} satisfies Config;
