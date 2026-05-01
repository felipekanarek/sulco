/**
 * Inc 24 — Backfill da tabela user_facets.
 *
 * Para cada user, agrega genres/styles/moods/contexts/shelves +
 * counts a partir de records/tracks e UPSERT em user_facets.
 *
 * Uso (local sqlite):
 *   node scripts/_backfill-user-facets.mjs
 *
 * Uso (prod Turso):
 *   DATABASE_URL=libsql://sulco-prod-... \
 *   DATABASE_AUTH_TOKEN=... \
 *   node scripts/_backfill-user-facets.mjs
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

function sortFacetCounts(rows) {
  return rows
    .filter((r) => typeof r.value === 'string' && r.value.length > 0)
    .map((r) => ({ value: r.value, count: Number(r.count) }))
    .sort(
      (a, b) =>
        b.count - a.count || a.value.localeCompare(b.value, 'pt-BR'),
    );
}

for (const userId of userIds) {
  // genres
  const genresRes = await db.execute({
    sql: `SELECT value AS value, COUNT(*) AS count
          FROM records, json_each(records.genres)
          WHERE records.user_id = ? AND records.archived = 0
          GROUP BY value`,
    args: [userId],
  });
  const genres = sortFacetCounts(genresRes.rows);

  // styles
  const stylesRes = await db.execute({
    sql: `SELECT value AS value, COUNT(*) AS count
          FROM records, json_each(records.styles)
          WHERE records.user_id = ? AND records.archived = 0
          GROUP BY value`,
    args: [userId],
  });
  const styles = sortFacetCounts(stylesRes.rows);

  // moods (frequência DESC, alfa desempate) → string[]
  const moodsRes = await db.execute({
    sql: `SELECT value AS value, COUNT(*) AS count
          FROM tracks
          INNER JOIN records ON records.id = tracks.record_id, json_each(tracks.moods)
          WHERE records.user_id = ? AND records.archived = 0
          GROUP BY value`,
    args: [userId],
  });
  const moods = sortFacetCounts(moodsRes.rows).map((r) => r.value);

  // contexts
  const contextsRes = await db.execute({
    sql: `SELECT value AS value, COUNT(*) AS count
          FROM tracks
          INNER JOIN records ON records.id = tracks.record_id, json_each(tracks.contexts)
          WHERE records.user_id = ? AND records.archived = 0
          GROUP BY value`,
    args: [userId],
  });
  const contexts = sortFacetCounts(contextsRes.rows).map((r) => r.value);

  // shelves (alfabético case-insensitive)
  const shelvesRes = await db.execute({
    sql: `SELECT DISTINCT shelf_location AS shelf
          FROM records
          WHERE user_id = ? AND shelf_location IS NOT NULL
          ORDER BY lower(shelf_location)`,
    args: [userId],
  });
  const shelves = shelvesRes.rows
    .map((r) => r.shelf)
    .filter((s) => typeof s === 'string' && s.trim().length > 0);

  // counts (records ativos por status, archived=0)
  const countsRes = await db.execute({
    sql: `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'unrated' THEN 1 ELSE 0 END) AS unrated,
            SUM(CASE WHEN status = 'discarded' THEN 1 ELSE 0 END) AS discarded
          FROM records
          WHERE user_id = ? AND archived = 0`,
    args: [userId],
  });
  const c = countsRes.rows[0] ?? {};
  const recordsTotal = Number(c.total ?? 0);
  const recordsActive = Number(c.active ?? 0);
  const recordsUnrated = Number(c.unrated ?? 0);
  const recordsDiscarded = Number(c.discarded ?? 0);

  // tracksSelectedTotal
  const tracksSelRes = await db.execute({
    sql: `SELECT COUNT(*) AS c
          FROM tracks
          INNER JOIN records ON records.id = tracks.record_id
          WHERE records.user_id = ? AND records.archived = 0 AND tracks.selected = 1`,
    args: [userId],
  });
  const tracksSelectedTotal = Number(tracksSelRes.rows[0]?.c ?? 0);

  // UPSERT
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: `INSERT INTO user_facets (
            user_id, genres_json, styles_json, moods_json, contexts_json,
            shelves_json, records_total, records_active, records_unrated,
            records_discarded, tracks_selected_total, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            genres_json = excluded.genres_json,
            styles_json = excluded.styles_json,
            moods_json = excluded.moods_json,
            contexts_json = excluded.contexts_json,
            shelves_json = excluded.shelves_json,
            records_total = excluded.records_total,
            records_active = excluded.records_active,
            records_unrated = excluded.records_unrated,
            records_discarded = excluded.records_discarded,
            tracks_selected_total = excluded.tracks_selected_total,
            updated_at = excluded.updated_at`,
    args: [
      userId,
      JSON.stringify(genres),
      JSON.stringify(styles),
      JSON.stringify(moods),
      JSON.stringify(contexts),
      JSON.stringify(shelves),
      recordsTotal,
      recordsActive,
      recordsUnrated,
      recordsDiscarded,
      tracksSelectedTotal,
      now,
    ],
  });

  console.log(
    `✓ user ${userId}: ${recordsTotal} records (${recordsActive}A/${recordsUnrated}U/${recordsDiscarded}D) · ${genres.length} genres · ${styles.length} styles · ${moods.length} moods · ${contexts.length} contexts · ${shelves.length} shelves · ${tracksSelectedTotal} tracks selected`,
  );
}

console.log('[backfill] done');
process.exit(0);
