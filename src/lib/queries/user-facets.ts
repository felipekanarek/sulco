import 'server-only';
import { cache } from 'react';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks, userFacets, userVocab } from '@/db/schema';

/**
 * Inc 24 — denormalização de counts em user_facets.
 * Inc 27 — delta updates direcionados em vez de recompute completo.
 * Inc 33 — vocabulário materializado em user_vocab (genres/styles/moods/
 *          contexts/shelves) — substituiu colunas JSON em user_facets.
 * Inc 34 — drop das colunas JSON em user_facets (agora retém apenas
 *          counters de records/tracks).
 *
 * `getUserFacets(userId)` — leitura barata (1 SELECT). Retorna counters
 * (recordsTotal/Active/Unrated/Discarded + tracksSelectedTotal) +
 * userId + updatedAt. Defaults seguros se row ausente.
 *
 * `recomputeFacets(userId)` — recalcula counters + re-popula user_vocab
 * via `_repopulateVocab`. Usado em:
 *   - `runIncrementalSync` / `runInitialImport` (operações em massa)
 *   - cron diário `/api/cron/sync-daily` (drift correction)
 *
 * Helpers de delta (Inc 27 — counters em user_facets):
 *   - `applyRecordStatusDelta` — UPDATE atomic counters por status
 *   - `applyTrackSelectedDelta` — UPDATE atomic tracksSelectedTotal
 *   - `applyDeltaForWrite` — wrapper que despacha em paralelo via scope
 *
 * Helpers de vocab (Inc 33 — user_vocab — em src/lib/queries/user-vocab.ts):
 *   - `applyVocabDelta` — increment/decrement direcionado por termo
 *   - `listVocab` — leitura cached por (userId, kind)
 */

export type FacetCount = { value: string; count: number };

// Inc 34 (029): tipo enxugado — vocabulário (genres/styles/moods/
// contexts/shelves) vive em `user_vocab` (Inc 33). user_facets retém
// apenas counters de records/tracks.
export type UserFacets = {
  userId: number;
  recordsTotal: number;
  recordsActive: number;
  recordsUnrated: number;
  recordsDiscarded: number;
  tracksSelectedTotal: number;
  updatedAt: Date;
};

// Inc 26: wrappar em react.cache() pra dedupar calls dentro do
// mesmo render RSC (callers paralelos viram 1 SELECT).
export const getUserFacets = cache(async (userId: number): Promise<UserFacets> => {
  const [row] = await db
    .select()
    .from(userFacets)
    .where(eq(userFacets.userId, userId))
    .limit(1);

  if (!row) {
    return {
      userId,
      recordsTotal: 0,
      recordsActive: 0,
      recordsUnrated: 0,
      recordsDiscarded: 0,
      tracksSelectedTotal: 0,
      updatedAt: new Date(0),
    };
  }

  return {
    userId: row.userId,
    recordsTotal: row.recordsTotal,
    recordsActive: row.recordsActive,
    recordsUnrated: row.recordsUnrated,
    recordsDiscarded: row.recordsDiscarded,
    tracksSelectedTotal: row.tracksSelectedTotal,
    updatedAt: row.updatedAt,
  };
});

/* -------- Internas (queries pesadas) -------- */

// Inc 34 (029): `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves`
// foram REMOVIDOS — alimentavam exclusivamente as colunas JSON em
// `user_facets` que foram dropadas. Vocab agora vive em `user_vocab`
// (Inc 33), populado via `_aggregateVocabCounts`/`_aggregateShelfCounts`
// + agregação inline de genres/styles em `_repopulateVocab`.

async function aggregateCounts(userId: number): Promise<{
  total: number;
  active: number;
  unrated: number;
  discarded: number;
}> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${records.status} = 'active' THEN 1 ELSE 0 END)`,
      unrated: sql<number>`SUM(CASE WHEN ${records.status} = 'unrated' THEN 1 ELSE 0 END)`,
      discarded: sql<number>`SUM(CASE WHEN ${records.status} = 'discarded' THEN 1 ELSE 0 END)`,
    })
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.archived, false)));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    unrated: Number(row?.unrated ?? 0),
    discarded: Number(row?.discarded ?? 0),
  };
}

async function aggregateTracksSelected(userId: number): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, false),
        eq(tracks.selected, true),
      ),
    );
  return Number(row?.c ?? 0);
}

/* -------- Recompute (UPSERT) -------- */

export async function recomputeFacets(userId: number): Promise<void> {
  // Inc 34 (029): user_facets retém apenas counters. Vocabulário
  // (genres/styles/moods/contexts/shelves) é re-populado em user_vocab
  // via `_repopulateVocab` (self-contained, agrega internamente).
  const [counts, tracksSelectedTotal] = await Promise.all([
    aggregateCounts(userId),
    aggregateTracksSelected(userId),
  ]);

  await db
    .insert(userFacets)
    .values({
      userId,
      recordsTotal: counts.total,
      recordsActive: counts.active,
      recordsUnrated: counts.unrated,
      recordsDiscarded: counts.discarded,
      tracksSelectedTotal,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userFacets.userId,
      set: {
        recordsTotal: sql`excluded.records_total`,
        recordsActive: sql`excluded.records_active`,
        recordsUnrated: sql`excluded.records_unrated`,
        recordsDiscarded: sql`excluded.records_discarded`,
        tracksSelectedTotal: sql`excluded.tracks_selected_total`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Inc 33: re-popula user_vocab do zero pra este user — drift correction.
  // Filtro `archived=false` em todos os ramos (FR-013): apenas registros
  // não-arquivados contam pro vocabulário ativo.
  await _repopulateVocab(userId);
}

/**
 * Inc 33/34 helper privado — re-popula `user_vocab` do user a partir do
 * estado autoritativo de records/tracks (archived=false). DELETE + INSERT
 * idempotente. Self-contained: agrega genres/styles via SELECT em records
 * + delega moods/contexts/shelves a `_aggregateVocabCounts`/`_aggregateShelfCounts`.
 */
async function _repopulateVocab(userId: number): Promise<void> {
  // Genres + styles via SELECT direto records archived=false.
  const recordsRows = await db
    .select({ genres: records.genres, styles: records.styles })
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.archived, false)));
  const genresMap = new Map<string, number>();
  const stylesMap = new Map<string, number>();
  for (const r of recordsRows) {
    for (const g of (r.genres ?? []) as string[]) {
      if (typeof g === 'string' && g.trim().length > 0) {
        genresMap.set(g, (genresMap.get(g) ?? 0) + 1);
      }
    }
    for (const s of (r.styles ?? []) as string[]) {
      if (typeof s === 'string' && s.trim().length > 0) {
        stylesMap.set(s, (stylesMap.get(s) ?? 0) + 1);
      }
    }
  }

  // Moods/contexts via JOIN tracks ↔ records, shelves via DISTINCT.
  const [moodsCounts, contextsCounts, shelfCounts] = await Promise.all([
    _aggregateVocabCounts(userId, tracks.moods),
    _aggregateVocabCounts(userId, tracks.contexts),
    _aggregateShelfCounts(userId),
  ]);

  await db.delete(userVocab).where(eq(userVocab.userId, userId));

  const inserts: Array<Promise<unknown>> = [];

  for (const [term, count] of genresMap) {
    if (count <= 0) continue;
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'genres',
        term,
        refCount: count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }
  for (const [term, count] of stylesMap) {
    if (count <= 0) continue;
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'styles',
        term,
        refCount: count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }
  for (const m of moodsCounts) {
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'moods',
        term: m.term,
        refCount: m.count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }
  for (const c of contextsCounts) {
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'contexts',
        term: c.term,
        refCount: c.count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }
  for (const sh of shelfCounts) {
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'shelves',
        term: sh.term,
        refCount: sh.count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }

  await Promise.all(inserts);
}

/**
 * Re-agrega vocabulário (moods/contexts) com count — usado por
 * `_repopulateVocab`. Filtro archived=false (FR-013).
 */
async function _aggregateVocabCounts(
  userId: number,
  column: typeof tracks.moods | typeof tracks.contexts,
): Promise<Array<{ term: string; count: number }>> {
  const rows = await db
    .select({
      value: sql<string>`value`,
      count: sql<number>`COUNT(*)`,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .innerJoin(sql`json_each(${column})`, sql`1=1`)
    .where(and(eq(records.userId, userId), eq(records.archived, false)))
    .groupBy(sql`value`);

  return rows
    .filter((r) => typeof r.value === 'string' && r.value.trim().length > 0)
    .map((r) => ({ term: r.value, count: Number(r.count) }));
}

/**
 * Re-agrega shelves com count — usado por `_repopulateVocab`.
 * Filtro archived=false + shelf_location IS NOT NULL.
 */
async function _aggregateShelfCounts(
  userId: number,
): Promise<Array<{ term: string; count: number }>> {
  const rows = await db
    .select({
      shelf: records.shelfLocation,
      count: sql<number>`COUNT(*)`,
    })
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, false),
        isNotNull(records.shelfLocation),
      ),
    )
    .groupBy(records.shelfLocation);

  return rows
    .filter((r) => typeof r.shelf === 'string' && r.shelf.trim().length > 0)
    .map((r) => ({ term: r.shelf as string, count: Number(r.count) }));
}

/* -------- Inc 27: Delta updates direcionados -------- */

type RecordStatus = 'unrated' | 'active' | 'discarded';

/**
 * Atualiza counters de records por status em user_facets quando um
 * disco muda de status. UPDATE com expressão atômica nos 3 counters.
 * No-op se prev === next.
 *
 * Custo: ~3 row reads (1 row de user_facets).
 */
export async function applyRecordStatusDelta(
  userId: number,
  prev: RecordStatus,
  next: RecordStatus,
): Promise<void> {
  if (prev === next) return;
  await db
    .update(userFacets)
    .set({
      recordsActive: sql`MAX(0, ${userFacets.recordsActive} + ${next === 'active' ? 1 : 0} - ${prev === 'active' ? 1 : 0})`,
      recordsUnrated: sql`MAX(0, ${userFacets.recordsUnrated} + ${next === 'unrated' ? 1 : 0} - ${prev === 'unrated' ? 1 : 0})`,
      recordsDiscarded: sql`MAX(0, ${userFacets.recordsDiscarded} + ${next === 'discarded' ? 1 : 0} - ${prev === 'discarded' ? 1 : 0})`,
      updatedAt: new Date(),
    })
    .where(eq(userFacets.userId, userId));
}

/**
 * Atualiza tracksSelectedTotal em user_facets quando uma faixa é
 * (de)selecionada. UPDATE com expressão atômica. MAX(0, ...) defensivo.
 *
 * Custo: ~3 row reads.
 */
export async function applyTrackSelectedDelta(
  userId: number,
  delta: -1 | 1,
): Promise<void> {
  await db
    .update(userFacets)
    .set({
      tracksSelectedTotal: sql`MAX(0, ${userFacets.tracksSelectedTotal} + ${delta})`,
      updatedAt: new Date(),
    })
    .where(eq(userFacets.userId, userId));
}

/**
 * Inc 33: `recomputeShelvesOnly` e `recomputeVocabularyOnly` foram
 * REMOVIDOS — substituídos por `applyVocabDelta` direcionado em
 * `src/lib/queries/user-vocab.ts`, que opera em `user_vocab` sem scan
 * da coleção em writes. Drift residual é corrigido por `recomputeFacets`
 * (acima) que re-popula `user_vocab` via `_repopulateVocab`.
 *
 * Inc 34 (029): `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves`
 * também REMOVIDOS — alimentavam exclusivamente as colunas JSON em
 * `user_facets` que foram dropadas. `_repopulateVocab` agora agrega
 * genres/styles inline via SELECT em records.
 *
 * Wrapper que despacha em paralelo (Promise.all) baseado no scope
 * do que mudou. Try/catch defensivo no caller — write principal já
 * foi committado, falha no delta só causa drift transitório (cron resolve).
 *
 * Scope vazio = no-op (zero queries). Útil pra Server Actions
 * que sabem que algo não impacta facets mas querem um único call site.
 */
export type DeltaScope = {
  recordStatus?: { prev: RecordStatus; next: RecordStatus };
  trackSelected?: { delta: -1 | 1 };
};

export async function applyDeltaForWrite(
  userId: number,
  scope: DeltaScope,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (scope.recordStatus) {
    tasks.push(applyRecordStatusDelta(userId, scope.recordStatus.prev, scope.recordStatus.next));
  }
  if (scope.trackSelected) {
    tasks.push(applyTrackSelectedDelta(userId, scope.trackSelected.delta));
  }
  if (tasks.length === 0) return;
  await Promise.all(tasks);
}
