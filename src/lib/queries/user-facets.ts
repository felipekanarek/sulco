import 'server-only';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks, userFacets } from '@/db/schema';

/**
 * Inc 24 — denormalização de filtros + counts.
 *
 * `getUserFacets(userId)` — leitura barata (1 SELECT). Usado por todas
 * as queries que antes scaneavam toda a coleção (genres/styles/moods/
 * contexts/shelves/counts). Defaults seguros se row ausente.
 *
 * `recomputeFacets(userId)` — recalcula tudo a partir das fontes
 * (records + tracks) e UPSERT na row do user. Síncrono (Clarification
 * Q1). Chamado no fim das Server Actions de write críticas.
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

export async function getUserFacets(userId: number): Promise<UserFacets> {
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
}

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
}
