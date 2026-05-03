import 'server-only';
import { cache } from 'react';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks, userFacets, userVocab } from '@/db/schema';

/**
 * Inc 24 — denormalização de filtros + counts.
 * Inc 27 — delta updates direcionados em vez de recompute completo.
 *
 * `getUserFacets(userId)` — leitura barata (1 SELECT). Usado por todas
 * as queries que antes scaneavam toda a coleção (genres/styles/moods/
 * contexts/shelves/counts). Defaults seguros se row ausente.
 *
 * `recomputeFacets(userId)` — recalcula TUDO a partir das fontes
 * (records + tracks) e UPSERT na row do user. ~7 queries pesadas,
 * ~50-100k rows lidas. Continua sendo usado em:
 *   - `runIncrementalSync` / `runInitialImport` (operações em massa)
 *   - cron diário `/api/cron/sync-daily` (drift correction)
 *   - backfill via script (raro)
 * Server Actions de edição (status/curation/author) NÃO usam mais —
 * usam delta direcionado.
 *
 * Helpers de delta (Inc 27):
 *   - `applyRecordStatusDelta` — UPDATE atomic counters por status
 *   - `applyTrackSelectedDelta` — UPDATE atomic tracksSelectedTotal
 *   - `recomputeShelvesOnly` — recompute parcial só shelves (1 SELECT DISTINCT)
 *   - `recomputeVocabularyOnly` — recompute parcial só moods OU contexts
 *   - `applyDeltaForWrite` — wrapper que despacha em paralelo via scope
 */

export type FacetCount = { value: string; count: number };

export type UserFacets = {
  userId: number;
  genres: FacetCount[];
  styles: FacetCount[];
  moods: string[];
  contexts: string[];
  shelves: string[];
  recordsTotal: number;
  recordsActive: number;
  recordsUnrated: number;
  recordsDiscarded: number;
  tracksSelectedTotal: number;
  updatedAt: Date;
};

function parseJsonArray<T>(s: string | null | undefined, fallback: T[]): T[] {
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

// Inc 26: wrappar em react.cache() pra dedupar calls dentro do
// mesmo render RSC (4-5 callers paralelos viram 1 SELECT).
export const getUserFacets = cache(async (userId: number): Promise<UserFacets> => {
  const [row] = await db
    .select()
    .from(userFacets)
    .where(eq(userFacets.userId, userId))
    .limit(1);

  if (!row) {
    return {
      userId,
      genres: [],
      styles: [],
      moods: [],
      contexts: [],
      shelves: [],
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
    genres: parseJsonArray<FacetCount>(row.genresJson, []),
    styles: parseJsonArray<FacetCount>(row.stylesJson, []),
    moods: parseJsonArray<string>(row.moodsJson, []),
    contexts: parseJsonArray<string>(row.contextsJson, []),
    shelves: parseJsonArray<string>(row.shelvesJson, []),
    recordsTotal: row.recordsTotal,
    recordsActive: row.recordsActive,
    recordsUnrated: row.recordsUnrated,
    recordsDiscarded: row.recordsDiscarded,
    tracksSelectedTotal: row.tracksSelectedTotal,
    updatedAt: row.updatedAt,
  };
});

/* -------- Internas (queries pesadas) -------- */

async function aggregateFacet(
  userId: number,
  column: typeof records.genres | typeof records.styles,
): Promise<FacetCount[]> {
  const rows = await db
    .select({
      value: sql<string>`value`,
      count: sql<number>`COUNT(*)`,
    })
    .from(records)
    .innerJoin(sql`json_each(${column})`, sql`1=1`)
    .where(and(eq(records.userId, userId), eq(records.archived, false)))
    .groupBy(sql`value`);

  return rows
    .filter((r) => typeof r.value === 'string' && r.value.length > 0)
    .map((r) => ({ value: r.value, count: Number(r.count) }))
    .sort(
      (a, b) =>
        b.count - a.count || a.value.localeCompare(b.value, 'pt-BR'),
    );
}

async function aggregateVocabulary(
  userId: number,
  column: typeof tracks.moods | typeof tracks.contexts,
): Promise<string[]> {
  // Ordenado por frequência (count DESC, desempate alfa) — preserva
  // semântica do `listUserVocabulary` original (FR-017a).
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
    .filter((r) => typeof r.value === 'string' && r.value.length > 0)
    .map((r) => ({ value: r.value, count: Number(r.count) }))
    .sort(
      (a, b) =>
        b.count - a.count || a.value.localeCompare(b.value, 'pt-BR'),
    )
    .map((r) => r.value);
}

async function aggregateShelves(userId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ shelf: records.shelfLocation })
    .from(records)
    .where(and(eq(records.userId, userId), isNotNull(records.shelfLocation)))
    .orderBy(sql`lower(${records.shelfLocation})`);

  return rows
    .map((r) => r.shelf)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

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
  const [genres, styles, moods, contexts, shelves, counts, tracksSelectedTotal] =
    await Promise.all([
      aggregateFacet(userId, records.genres),
      aggregateFacet(userId, records.styles),
      aggregateVocabulary(userId, tracks.moods),
      aggregateVocabulary(userId, tracks.contexts),
      aggregateShelves(userId),
      aggregateCounts(userId),
      aggregateTracksSelected(userId),
    ]);

  await db
    .insert(userFacets)
    .values({
      userId,
      genresJson: JSON.stringify(genres),
      stylesJson: JSON.stringify(styles),
      moodsJson: JSON.stringify(moods),
      contextsJson: JSON.stringify(contexts),
      shelvesJson: JSON.stringify(shelves),
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
        genresJson: sql`excluded.genres_json`,
        stylesJson: sql`excluded.styles_json`,
        moodsJson: sql`excluded.moods_json`,
        contextsJson: sql`excluded.contexts_json`,
        shelvesJson: sql`excluded.shelves_json`,
        recordsTotal: sql`excluded.records_total`,
        recordsActive: sql`excluded.records_active`,
        recordsUnrated: sql`excluded.records_unrated`,
        recordsDiscarded: sql`excluded.records_discarded`,
        tracksSelectedTotal: sql`excluded.tracks_selected_total`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  // Inc 33: re-popula user_vocab do zero pra este user — drift correction.
  // Filtro `archived=false` em todos os 3 ramos (FR-013): apenas registros
  // não-arquivados contam pro vocabulário ativo.
  await _repopulateVocab(userId, genres, styles, moods, contexts, shelves);
}

/**
 * Inc 33 helper privado — re-popula `user_vocab` do user a partir das
 * agregações já calculadas em `recomputeFacets`. DELETE + INSERT idempotente.
 *
 * `genresAgg`/`stylesAgg`: FacetCount[] com {value, count}.
 * `moodsAgg`/`contextsAgg`: agregações já ordenadas (string[]) — perdem
 * count na conversão Inc 24, então recomputamos count via raw SELECT
 * separado pra preservar `ref_count` correto. Trade-off: 2 SELECTs extras
 * vs JSON parsing — aceitável (cron noturno raro).
 * `shelvesAgg`: string[] — recompute count via SELECT.
 */
async function _repopulateVocab(
  userId: number,
  genresAgg: FacetCount[],
  stylesAgg: FacetCount[],
  _moodsAgg: string[],
  _contextsAgg: string[],
  _shelvesAgg: string[],
): Promise<void> {
  // Re-agregar moods/contexts/shelves COM count (não vem em string[]).
  // Filtro archived=false aplicado dentro de aggregateVocabulary/Shelves.
  const [moodsCounts, contextsCounts, shelfCounts] = await Promise.all([
    _aggregateVocabCounts(userId, tracks.moods),
    _aggregateVocabCounts(userId, tracks.contexts),
    _aggregateShelfCounts(userId),
  ]);

  await db.delete(userVocab).where(eq(userVocab.userId, userId));

  const now = sql`(unixepoch())`;
  const inserts: Array<Promise<unknown>> = [];

  for (const g of genresAgg) {
    if (!g.value || g.count <= 0) continue;
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'genres',
        term: g.value,
        refCount: g.count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }),
    );
  }
  for (const s of stylesAgg) {
    if (!s.value || s.count <= 0) continue;
    inserts.push(
      db.insert(userVocab).values({
        userId,
        kind: 'styles',
        term: s.value,
        refCount: s.count,
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

  // Suppress `now` lint — usado via sql`(unixepoch())` por entry.
  void now;

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
 * `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves` permanecem
 * privados — usados por `recomputeFacets` para manter as colunas JSON
 * em `user_facets` populadas como fallback até Inc 34 dropar as colunas.
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
