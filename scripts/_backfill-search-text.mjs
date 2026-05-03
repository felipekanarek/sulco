/**
 * Inc 32 (027) — Backfill da coluna `records.search_text`.
 *
 * Para cada record, computa `normalize(artist + ' ' + title + ' ' + (label ?? ''))`
 * e UPDATE em `records.search_text`. Idempotente — pode rodar múltiplas vezes
 * sem divergir.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-search-text.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-search-text.mjs
 */

import { createClient } from '@libsql/client';
import path from 'node:path';

const envUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;
const url =
  envUrl && envUrl.length > 0
    ? envUrl
    : `file:${path.join(process.cwd(), 'sulco.db')}`;

const db = createClient(authToken ? { url, authToken } : { url });

console.log(`[backfill] DB: ${url.startsWith('libsql') ? 'turso' : 'sqlite local'}`);

// Re-implementação inline da normalizeText (script Node não importa de TS).
// Mantém paridade com src/lib/text.ts: lowercase + NFD + strip combining marks.
function normalize(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function compute(artist, title, label) {
  return normalize([artist, title, label ?? ''].join(' '));
}

const rows = (await db.execute('SELECT id, artist, title, label FROM records')).rows;
console.log(`[backfill] ${rows.length} records encontrados`);

let updated = 0;
for (const r of rows) {
  const searchText = compute(
    String(r.artist ?? ''),
    String(r.title ?? ''),
    r.label == null ? null : String(r.label),
  );
  await db.execute({
    sql: 'UPDATE records SET search_text = ? WHERE id = ?',
    args: [searchText, Number(r.id)],
  });
  updated += 1;
  if (updated % 500 === 0) console.log(`✓ ${updated}/${rows.length}`);
}

console.log(`[backfill] done: ${updated} records updated`);
process.exit(0);
