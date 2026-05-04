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

// 1. Records → record_genres + record_styles
const recordRows = (
  await db.execute('SELECT id, genres, styles FROM records')
).rows;
console.log(`[backfill] ${recordRows.length} records encontrados`);

let recordGenresInserted = 0;
let recordStylesInserted = 0;
let processedRecords = 0;

for (const r of recordRows) {
  const recordId = Number(r.id);
  const genres = parseJsonArray(r.genres).filter(isValidTerm);
  const styles = parseJsonArray(r.styles).filter(isValidTerm);

  await db.execute({
    sql: 'DELETE FROM record_genres WHERE record_id = ?',
    args: [recordId],
  });
  await db.execute({
    sql: 'DELETE FROM record_styles WHERE record_id = ?',
    args: [recordId],
  });

  for (const g of genres) {
    await db.execute({
      sql: 'INSERT INTO record_genres (record_id, genre) VALUES (?, ?)',
      args: [recordId, g],
    });
    recordGenresInserted += 1;
  }
  for (const s of styles) {
    await db.execute({
      sql: 'INSERT INTO record_styles (record_id, style) VALUES (?, ?)',
      args: [recordId, s],
    });
    recordStylesInserted += 1;
  }

  processedRecords += 1;
  if (processedRecords % 500 === 0) {
    console.log(
      `✓ ${processedRecords}/${recordRows.length} records (${recordGenresInserted} genres, ${recordStylesInserted} styles)`,
    );
  }
}

console.log(
  `[backfill] records done: ${processedRecords} processed, ${recordGenresInserted} genres + ${recordStylesInserted} styles inseridas`,
);

// 2. Tracks → track_moods + track_contexts
const trackRows = (
  await db.execute('SELECT id, moods, contexts FROM tracks')
).rows;
console.log(`[backfill] ${trackRows.length} tracks encontradas`);

let trackMoodsInserted = 0;
let trackContextsInserted = 0;
let processedTracks = 0;

for (const t of trackRows) {
  const trackId = Number(t.id);
  const moods = parseJsonArray(t.moods).filter(isValidTerm);
  const contexts = parseJsonArray(t.contexts).filter(isValidTerm);

  await db.execute({
    sql: 'DELETE FROM track_moods WHERE track_id = ?',
    args: [trackId],
  });
  await db.execute({
    sql: 'DELETE FROM track_contexts WHERE track_id = ?',
    args: [trackId],
  });

  for (const m of moods) {
    await db.execute({
      sql: 'INSERT INTO track_moods (track_id, mood) VALUES (?, ?)',
      args: [trackId, m],
    });
    trackMoodsInserted += 1;
  }
  for (const c of contexts) {
    await db.execute({
      sql: 'INSERT INTO track_contexts (track_id, context) VALUES (?, ?)',
      args: [trackId, c],
    });
    trackContextsInserted += 1;
  }

  processedTracks += 1;
  if (processedTracks % 1000 === 0) {
    console.log(
      `✓ ${processedTracks}/${trackRows.length} tracks (${trackMoodsInserted} moods, ${trackContextsInserted} contexts)`,
    );
  }
}

console.log(
  `[backfill] tracks done: ${processedTracks} processed, ${trackMoodsInserted} moods + ${trackContextsInserted} contexts inseridas`,
);

console.log(
  `[backfill] TOTAL: ${recordGenresInserted + recordStylesInserted + trackMoodsInserted + trackContextsInserted} entries em 4 pivots`,
);

process.exit(0);
