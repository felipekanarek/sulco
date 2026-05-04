/**
 * Inc 8 (032) — Backfill estendido do user_vocab pra incluir 3 kinds novos:
 * formats, countries, labels (single-value columns em records).
 *
 * Pattern: re-popula 8 kinds (5 originais Inc 33 + 3 novos) por user.
 * Idempotente: DELETE WHERE user_id=? + INSERT N entries.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-user-vocab-extended.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-user-vocab-extended.mjs
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

console.log(`[backfill-ext] DB: ${url.startsWith('libsql') ? 'turso' : 'sqlite local'}`);

function isValidTerm(t) {
  return typeof t === 'string' && t.trim().length > 0;
}

function bumpCount(map, term) {
  if (!isValidTerm(term)) return;
  const t = term.trim();
  map.set(t, (map.get(t) ?? 0) + 1);
}

const usersRes = await db.execute('SELECT id FROM users ORDER BY id');
const userIds = usersRes.rows.map((r) => Number(r.id));
console.log(`[backfill-ext] ${userIds.length} usuários encontrados`);

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
    formats: new Map(),
    countries: new Map(),
    labels: new Map(),
  };

  // genres + styles + format + country + label a partir de records archived=false
  const recordsRes = await db.execute({
    sql: `SELECT genres, styles, format, country, label, shelf_location
          FROM records
          WHERE user_id = ? AND archived = 0`,
    args: [userId],
  });
  for (const r of recordsRes.rows) {
    let genres = [];
    let styles = [];
    try { genres = JSON.parse(r.genres ?? '[]'); } catch { /* ignore */ }
    try { styles = JSON.parse(r.styles ?? '[]'); } catch { /* ignore */ }
    for (const g of genres) bumpCount(counts.genres, g);
    for (const s of styles) bumpCount(counts.styles, s);
    bumpCount(counts.formats, r.format);
    bumpCount(counts.countries, r.country);
    bumpCount(counts.labels, r.label);
    bumpCount(counts.shelves, r.shelf_location);
  }

  // moods + contexts via JOIN tracks ↔ records archived=false
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
    try { moods = JSON.parse(t.moods ?? '[]'); } catch { /* ignore */ }
    try { contexts = JSON.parse(t.contexts ?? '[]'); } catch { /* ignore */ }
    for (const m of moods) bumpCount(counts.moods, m);
    for (const c of contexts) bumpCount(counts.contexts, c);
  }

  // Batch INSERTs por kind
  const now = Math.floor(Date.now() / 1000);
  const stmts = [];
  for (const [kind, map] of Object.entries(counts)) {
    for (const [term, count] of map) {
      if (count <= 0) continue;
      stmts.push({
        sql: `INSERT INTO user_vocab (user_id, kind, term, ref_count, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [userId, kind, term, count, now],
      });
    }
  }

  // Aplicar em chunks de 500 via batch (libsql)
  const BATCH_SIZE = 500;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const chunk = stmts.slice(i, i + BATCH_SIZE);
    await db.batch(chunk, 'write');
  }

  console.log(
    `✓ user ${userId}: ${counts.genres.size}G/${counts.styles.size}S/${counts.moods.size}M/${counts.contexts.size}Ctx/${counts.shelves.size}Sh/${counts.formats.size}F/${counts.countries.size}Co/${counts.labels.size}L = ${stmts.length} entries`,
  );
}

console.log('[backfill-ext] done');
process.exit(0);
