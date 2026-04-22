import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'sulco.db');
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
export * from './schema';
