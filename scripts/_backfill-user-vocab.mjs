/**
 * Inc 33 (028) — Backfill da tabela user_vocab.
 *
 * Para cada user, re-popula `user_vocab` do zero baseado no estado
 * autoritativo de records/tracks (archived=false). Idempotente:
 * `DELETE WHERE user_id=?` + INSERT, dentro de transação.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-user-vocab.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-user-vocab.mjs
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

const usersRes = await db.execute('SELECT id FROM users ORDER BY id');
const userIds = usersRes.rows.map((r) => Number(r.id));
console.log(`[backfill] ${userIds.length} usuários encontrados`);

// Helpers
function isValidTerm(t) {
  return typeof t === 'string' && t.trim().length > 0;
}

function bumpCount(map, term) {
  if (!isValidTerm(term)) return;
  map.set(term, (map.get(term) ?? 0) + 1);
}

for (const userId of userIds) {
  // Limpa vocab atual do user (idempotência).
  await db.execute({
    sql: 'DELETE FROM user_vocab WHERE user_id = ?',
    args: [userId],
  });

  const counts = {
    genres: new Map(),
    styles: new Map(),
    moods: new Map(),
    contexts: new Map(),
    shelves: new Map(),
  };

  // genres + styles a partir de records archived=false
  const recordsRes = await db.execute({
    sql: 'SELECT genres, styles FROM records WHERE user_id = ? AND archived = 0',
    args: [userId],
  });
  for (const r of recordsRes.rows) {
    let genres = [];
    let styles = [];
    try {
      genres = JSON.parse(r.genres ?? '[]');
    } catch {
      /* ignore */
    }
    try {
      styles = JSON.parse(r.styles ?? '[]');
    } catch {
      /* ignore */
    }
    for (const g of genres) bumpCount(counts.genres, g);
    for (const s of styles) bumpCount(counts.styles, s);
  }

  // shelves: agregação SQL direta (1 row por shelf distinto)
  const shelvesRes = await db.execute({
    sql: `SELECT shelf_location AS shelf, COUNT(*) AS c
          FROM records
          WHERE user_id = ? AND archived = 0 AND shelf_location IS NOT NULL
          GROUP BY shelf_location`,
    args: [userId],
  });
  for (const r of shelvesRes.rows) {
    const term = String(r.shelf ?? '');
    if (!isValidTerm(term)) continue;
    counts.shelves.set(term, Number(r.c ?? 0));
  }

  // moods + contexts a partir de tracks JOIN records archived=false
  const tracksRes = await db.execute({
    sql: `SELECT tracks.moods, tracks.contexts
          FROM tracks
          INNER JOIN records ON records.id = tracks.record_id
          WHERE records.user_id = ? AND records.archived = 0`,
    args: [userId],
  });
  for (const t of tracksRes.rows) {
    let moods = [];
    let contexts = [];
    try {
      moods = JSON.parse(t.moods ?? '[]');
    } catch {
      /* ignore */
    }
    try {
      contexts = JSON.parse(t.contexts ?? '[]');
    } catch {
      /* ignore */
    }
    for (const m of moods) bumpCount(counts.moods, m);
    for (const c of contexts) bumpCount(counts.contexts, c);
  }

  // INSERT em batch
  const now = Math.floor(Date.now() / 1000);
  let inserted = 0;
  for (const [kind, map] of Object.entries(counts)) {
    for (const [term, count] of map) {
      if (count <= 0) continue;
      await db.execute({
        sql: `INSERT INTO user_vocab (user_id, kind, term, ref_count, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [userId, kind, term, count, now],
      });
      inserted += 1;
    }
  }

  console.log(
    `✓ user ${userId}: ${counts.genres.size}G/${counts.styles.size}S/${counts.moods.size}M/${counts.contexts.size}Ctx/${counts.shelves.size}Sh = ${inserted} entries`,
  );
}

console.log('[backfill] done');
process.exit(0);
