/**
 * Inc 35 (030) — Backfill das 4 tabelas pivot a partir de
 * records.genres, records.styles, tracks.moods, tracks.contexts.
 *
 * Para cada record/track, DELETE pivot WHERE fk=? + INSERT N entries.
 * Idempotente: re-execução produz mesmo estado.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-pivot-tables.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-pivot-tables.mjs
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

function isValidTerm(t) {
  return typeof t === 'string' && t.trim().length > 0;
}

function parseJsonArray(s) {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Helper: chunked batch inserts. db.batch() agrupa N statements em
// 1 round-trip — crítica pra performance em libsql remoto.
async function execBatch(stmts) {
  if (stmts.length === 0) return;
  await db.batch(stmts, 'write');
}

// Optimização: 1 DELETE global por tabela em vez de DELETE por entity.
// Idempotente: re-execução produz mesmo estado.
console.log(`[backfill] limpando pivots existentes...`);
await db.batch(
  [
    'DELETE FROM record_genres',
    'DELETE FROM record_styles',
    'DELETE FROM track_moods',
    'DELETE FROM track_contexts',
  ],
  'write',
);
console.log(`[backfill] pivots limpos`);

// 1. Records → record_genres + record_styles
const recordRows = (
  await db.execute('SELECT id, genres, styles FROM records')
).rows;
console.log(`[backfill] ${recordRows.length} records encontrados`);

const recordGenresStmts = [];
const recordStylesStmts = [];
for (const r of recordRows) {
  const recordId = Number(r.id);
  const genres = parseJsonArray(r.genres).filter(isValidTerm);
  const styles = parseJsonArray(r.styles).filter(isValidTerm);

  for (const g of genres) {
    recordGenresStmts.push({
      sql: 'INSERT INTO record_genres (record_id, genre) VALUES (?, ?)',
      args: [recordId, g],
    });
  }
  for (const s of styles) {
    recordStylesStmts.push({
      sql: 'INSERT INTO record_styles (record_id, style) VALUES (?, ?)',
      args: [recordId, s],
    });
  }
}

console.log(
  `[backfill] preparados ${recordGenresStmts.length} genres + ${recordStylesStmts.length} styles inserts. Aplicando em batches de 500...`,
);

// Aplicar em chunks de 500 (libsql tem limite por batch)
const BATCH_SIZE = 500;
let recordGenresInserted = 0;
for (let i = 0; i < recordGenresStmts.length; i += BATCH_SIZE) {
  const chunk = recordGenresStmts.slice(i, i + BATCH_SIZE);
  await execBatch(chunk);
  recordGenresInserted += chunk.length;
  console.log(`✓ record_genres: ${recordGenresInserted}/${recordGenresStmts.length}`);
}
let recordStylesInserted = 0;
for (let i = 0; i < recordStylesStmts.length; i += BATCH_SIZE) {
  const chunk = recordStylesStmts.slice(i, i + BATCH_SIZE);
  await execBatch(chunk);
  recordStylesInserted += chunk.length;
  console.log(`✓ record_styles: ${recordStylesInserted}/${recordStylesStmts.length}`);
}

console.log(
  `[backfill] records done: ${recordGenresInserted} genres + ${recordStylesInserted} styles inseridas`,
);

// 2. Tracks → track_moods + track_contexts
const trackRows = (
  await db.execute('SELECT id, moods, contexts FROM tracks')
).rows;
console.log(`[backfill] ${trackRows.length} tracks encontradas`);

const trackMoodsStmts = [];
const trackContextsStmts = [];
for (const t of trackRows) {
  const trackId = Number(t.id);
  const moods = parseJsonArray(t.moods).filter(isValidTerm);
  const contexts = parseJsonArray(t.contexts).filter(isValidTerm);

  for (const m of moods) {
    trackMoodsStmts.push({
      sql: 'INSERT INTO track_moods (track_id, mood) VALUES (?, ?)',
      args: [trackId, m],
    });
  }
  for (const c of contexts) {
    trackContextsStmts.push({
      sql: 'INSERT INTO track_contexts (track_id, context) VALUES (?, ?)',
      args: [trackId, c],
    });
  }
}

console.log(
  `[backfill] preparados ${trackMoodsStmts.length} moods + ${trackContextsStmts.length} contexts inserts. Aplicando em batches...`,
);

let trackMoodsInserted = 0;
for (let i = 0; i < trackMoodsStmts.length; i += BATCH_SIZE) {
  const chunk = trackMoodsStmts.slice(i, i + BATCH_SIZE);
  await execBatch(chunk);
  trackMoodsInserted += chunk.length;
  console.log(`✓ track_moods: ${trackMoodsInserted}/${trackMoodsStmts.length}`);
}
let trackContextsInserted = 0;
for (let i = 0; i < trackContextsStmts.length; i += BATCH_SIZE) {
  const chunk = trackContextsStmts.slice(i, i + BATCH_SIZE);
  await execBatch(chunk);
  trackContextsInserted += chunk.length;
  console.log(`✓ track_contexts: ${trackContextsInserted}/${trackContextsStmts.length}`);
}

console.log(
  `[backfill] tracks done: ${trackMoodsInserted} moods + ${trackContextsInserted} contexts inseridas`,
);

console.log(
  `[backfill] TOTAL: ${recordGenresInserted + recordStylesInserted + trackMoodsInserted + trackContextsInserted} entries em 4 pivots`,
);

process.exit(0);
