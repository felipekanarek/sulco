import { createClient, type Client, type InStatement, type ResultSet } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

const envUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

const url = envUrl && envUrl.length > 0 ? envUrl : `file:${path.join(process.cwd(), 'sulco.db')}`;

const rawClient = createClient(
  authToken ? { url, authToken } : { url },
);

/**
 * DEBUG temporário (sessão 2026-05-02): wrapper instrumentado que
 * loga toda query SQL com tempo + rows retornadas. Logs aparecem
 * no Vercel Functions log; serve pra identificar exatamente quais
 * queries estão consumindo cota Turso por load. REVERTER após
 * coleta de dados.
 */
const DB_DEBUG = process.env.DB_DEBUG !== '0';

function shortenSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').slice(0, 140);
}

function instrument<T extends Client>(c: T): T {
  if (!DB_DEBUG) return c;
  const origExecute = c.execute.bind(c);
  const origBatch = c.batch.bind(c);

  c.execute = (async (stmt: InStatement) => {
    const t0 = Date.now();
    try {
      const result = (await origExecute(stmt)) as ResultSet;
      const dt = Date.now() - t0;
      const sqlText =
        typeof stmt === 'string' ? stmt : (stmt as { sql?: string }).sql ?? String(stmt);
      const rows = result?.rows?.length ?? 0;
      const rowsAffected = (result as { rowsAffected?: number })?.rowsAffected ?? 0;
      console.log(
        `[DB] ${dt}ms rows=${rows} affected=${rowsAffected} sql="${shortenSql(sqlText)}"`,
      );
      return result;
    } catch (err) {
      const dt = Date.now() - t0;
      const sqlText =
        typeof stmt === 'string' ? stmt : (stmt as { sql?: string }).sql ?? String(stmt);
      console.error(`[DB] ${dt}ms ERROR sql="${shortenSql(sqlText)}"`, err);
      throw err;
    }
  }) as Client['execute'];

  c.batch = (async (stmts, mode) => {
    const t0 = Date.now();
    try {
      const result = await origBatch(stmts as InStatement[], mode);
      const dt = Date.now() - t0;
      console.log(`[DB] BATCH ${dt}ms count=${stmts.length}`);
      return result;
    } catch (err) {
      const dt = Date.now() - t0;
      console.error(`[DB] BATCH ${dt}ms ERROR count=${stmts.length}`, err);
      throw err;
    }
  }) as Client['batch'];

  return c;
}

const client = instrument(rawClient);

export const db = drizzle(client, { schema });
export * from './schema';
