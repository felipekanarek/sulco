import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

const envUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

const url = envUrl && envUrl.length > 0 ? envUrl : `file:${path.join(process.cwd(), 'sulco.db')}`;

const client = createClient(
  authToken ? { url, authToken } : { url },
);

export const db = drizzle(client, { schema });
export * from './schema';
