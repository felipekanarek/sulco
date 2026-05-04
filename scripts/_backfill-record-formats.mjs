/**
 * Inc 36 (033) — Backfill da pivot `record_formats` a partir de
 * records.format (composto Discogs: "Vinyl, LP, Album, Stereo").
 *
 * Tokeniza via split-trim e popula 1 entry por (record_id, token).
 * Pattern idêntico ao Inc 35 (`_backfill-pivot-tables.mjs`):
 * DELETE global + INSERT batched em chunks de 500.
 *
 * Idempotente: re-execução produz mesmo estado.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-record-formats.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-record-formats.mjs
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

console.log(`[backfill-formats] DB: ${url.startsWith('libsql') ? 'turso' : 'sqlite local'}`);

function tokenizeFormat(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function execBatch(stmts) {
  if (stmts.length === 0) return;
  await db.batch(stmts, 'write');
}

// Optimização: 1 DELETE global em vez de DELETE por record. Idempotente.
console.log(`[backfill-formats] limpando pivot record_formats...`);
await db.execute('DELETE FROM record_formats');
console.log(`[backfill-formats] pivot limpa`);

// SELECT records archived=0 com format != NULL/empty.
const rows = (
  await db.execute(
    "SELECT id, format FROM records WHERE archived = 0 AND format IS NOT NULL AND format != ''",
  )
).rows;
console.log(`[backfill-formats] ${rows.length} records ativos com format encontrados`);

const stmts = [];
for (const r of rows) {
  const recordId = Number(r.id);
  const tokens = tokenizeFormat(r.format);
  for (const t of tokens) {
    stmts.push({
      sql: 'INSERT INTO record_formats (record_id, token) VALUES (?, ?)',
      args: [recordId, t],
    });
  }
}

console.log(
  `[backfill-formats] preparados ${stmts.length} INSERT statements. Aplicando em batches de 500...`,
);

const BATCH_SIZE = 500;
let inserted = 0;
for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
  const chunk = stmts.slice(i, i + BATCH_SIZE);
  await execBatch(chunk);
  inserted += chunk.length;
  console.log(`✓ record_formats: ${inserted}/${stmts.length}`);
}

// Smoke: distinct token count
const distinctRes = await db.execute(
  'SELECT COUNT(DISTINCT token) AS c FROM record_formats',
);
console.log(
  `[backfill-formats] done: ${inserted} entries · ${distinctRes.rows[0].c} tokens distintos`,
);
process.exit(0);
