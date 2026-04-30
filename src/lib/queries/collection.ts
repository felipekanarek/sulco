import 'server-only';
import { and, desc, eq, exists, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import type { Record as RecordRow } from '@/db/schema';
import { matchesNormalizedText } from '@/lib/text';
import { cacheUser } from '@/lib/cache';

export type BombaFilter = 'any' | 'only' | 'none';
export type StatusFilter = 'all' | 'unrated' | 'active' | 'discarded';

export type CollectionQuery = {
  userId: number;
  status: StatusFilter;
  text: string;
  genres: string[]; // AND entre termos (FR-006)
  styles: string[]; // AND entre estilos (FR-006)
  bomba: BombaFilter; // tri-estado (FR-006)
};

export type CollectionRow = Pick<
  RecordRow,
  | 'id'
  | 'artist'
  | 'title'
  | 'year'
  | 'label'
  | 'country'
  | 'format'
  | 'coverUrl'
  | 'status'
  | 'shelfLocation'
> & {
  /** Garantidos não-nulos pelo mapping do queryCollection (`?? []`). */
  genres: string[];
  styles: string[];
  hasBomb: boolean;
  tracksTotal: number;
  tracksSelected: number;
};

export type CollectionCounts = {
  total: number;
  ativos: number;
  naoAvaliados: number;
  descartados: number;
};

/**
 * Helper compartilhado entre `queryCollection` (listagem) e
 * `pickRandomUnratedRecord` (sorteio aleatório, Inc 010). Garante
 * paridade semântica entre listagem e sorteio (FR-004 do 011).
 *
 * Recebe apenas filtros refinos (texto, genres, styles, bomba). Filtros
 * base (`userId`, `archived`, `status`) são responsabilidade do caller.
 */
export function buildCollectionFilters(q: {
  text: string;
  genres: string[];
  styles: string[];
  bomba: BombaFilter;
  /**
   * Quando true, ignora o filtro `text` no SQL — caller deve
   * aplicar `matchesNormalizedText` em JS pós-query (Inc 18 /
   * 021). Default false preserva callers existentes.
   */
  omitText?: boolean;
}): SQL[] {
  const conds: SQL[] = [];

  if (!q.omitText && q.text.length > 0) {
    const pattern = `%${q.text.toLowerCase()}%`;
    conds.push(
      sql`(lower(${records.artist}) LIKE ${pattern} OR lower(${records.title}) LIKE ${pattern} OR lower(COALESCE(${records.label},'')) LIKE ${pattern})`,
    );
  }

  // OR dentro de gêneros (FR-006): disco aparece se tiver QUALQUER um dos gêneros selecionados
  if (q.genres.length > 0) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM json_each(${records.genres}) WHERE value IN ${q.genres})`,
    );
  }

  // OR dentro de estilos (FR-006): mesma lógica, mais granular
  if (q.styles.length > 0) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM json_each(${records.styles}) WHERE value IN ${q.styles})`,
    );
  }

  if (q.bomba === 'only') {
    conds.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(tracks)
          .where(and(eq(tracks.recordId, records.id), eq(tracks.isBomb, true))),
      ),
    );
  } else if (q.bomba === 'none') {
    conds.push(
      sql`NOT EXISTS (SELECT 1 FROM ${tracks} WHERE ${tracks.recordId} = ${records.id} AND ${tracks.isBomb} = 1)`,
    );
  }

  return conds;
}

async function queryCollectionRaw(q: CollectionQuery): Promise<CollectionRow[]> {
  const conds: SQL[] = [eq(records.userId, q.userId), eq(records.archived, false)];

  if (q.status !== 'all') {
    conds.push(eq(records.status, q.status));
  }

  // Inc 18 (021): text filter sai do SQL e vai pra JS pós-query
  // pra ser accent-insensitive. Demais filtros continuam SQL.
  conds.push(...buildCollectionFilters({ ...q, omitText: true }));

  const rowsRaw = await db
    .select({
      id: records.id,
      artist: records.artist,
      title: records.title,
      year: records.year,
      label: records.label,
      country: records.country,
      format: records.format,
      coverUrl: records.coverUrl,
      genres: records.genres,
      styles: records.styles,
      status: records.status,
      shelfLocation: records.shelfLocation,
    })
    .from(records)
    .where(and(...conds))
    .orderBy(desc(records.importedAt));

  // Inc 18: aplicar text filter accent-insensitive antes da
  // agregação de tracks (economiza JOIN/aggregation pra rows
  // descartadas).
  const rows =
    q.text.trim().length > 0
      ? rowsRaw.filter((r) =>
          matchesNormalizedText([r.artist, r.title, r.label], q.text),
        )
      : rowsRaw;

  if (rows.length === 0) return [];

  const recordIds = rows.map((r) => r.id);

  // Agregações de tracks por disco — query separada com GROUP BY é
  // MUITO mais confiável que subquery-in-select no drizzle+libsql
  // (mesmo problema que já tinha acontecido com `hasBomb`).
  const trackAggRows = await db
    .select({
      recordId: tracks.recordId,
      total: sql<number>`COUNT(*)`,
      selected: sql<number>`SUM(CASE WHEN ${tracks.selected} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(tracks)
    .where(inArray(tracks.recordId, recordIds))
    .groupBy(tracks.recordId);
  const trackAggMap = new Map<number, { total: number; selected: number }>();
  for (const r of trackAggRows) {
    trackAggMap.set(r.recordId, {
      total: Number(r.total ?? 0),
      selected: Number(r.selected ?? 0),
    });
  }

  // Busca separada de IDs com Bomba — mais confiável que subquery em select.
  const bombRows = await db
    .select({ recordId: tracks.recordId })
    .from(tracks)
    .where(and(inArray(tracks.recordId, recordIds), eq(tracks.isBomb, true)))
    .groupBy(tracks.recordId);
  const bombSet = new Set(bombRows.map((b) => b.recordId));

  return rows.map((r) => {
    const agg = trackAggMap.get(r.id) ?? { total: 0, selected: 0 };
    return {
      ...r,
      genres: (r.genres ?? []) as string[],
      styles: (r.styles ?? []) as string[],
      hasBomb: bombSet.has(r.id),
      tracksTotal: agg.total,
      tracksSelected: agg.selected,
    };
  });
}

// Inc 23 (022): wrapper cacheUser absorve filtros via cache key
// composto. Tag por user invalida todas as variantes em writes.
export const queryCollection = (q: CollectionQuery): Promise<CollectionRow[]> => {
  const cachedFn = cacheUser(
    (_userId: number, query: CollectionQuery) => queryCollectionRaw(query),
    'queryCollection',
  );
  return cachedFn(q.userId, q);
};

async function collectionCountsRaw(userId: number): Promise<CollectionCounts> {
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      ativos: sql<number>`SUM(CASE WHEN ${records.status} = 'active' THEN 1 ELSE 0 END)`,
      naoAvaliados: sql<number>`SUM(CASE WHEN ${records.status} = 'unrated' THEN 1 ELSE 0 END)`,
      descartados: sql<number>`SUM(CASE WHEN ${records.status} = 'discarded' THEN 1 ELSE 0 END)`,
    })
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.archived, false)));

  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    ativos: Number(r?.ativos ?? 0),
    naoAvaliados: Number(r?.naoAvaliados ?? 0),
    descartados: Number(r?.descartados ?? 0),
  };
}

// Inc 23 (022): cache wrapper.
export const collectionCounts = cacheUser(collectionCountsRaw, 'collectionCounts');

/** Retorna a soma global de faixas com `selected=true` do usuário. */
async function countSelectedTracksRaw(userId: number): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(tracks)
    .innerJoin(records, eq(tracks.recordId, records.id))
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, false),
        eq(tracks.selected, true),
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

// Inc 23 (022): cache wrapper.
export const countSelectedTracks = cacheUser(countSelectedTracksRaw, 'countSelectedTracks');

export type FacetCount = { value: string; count: number };

async function countFacet(
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

async function listUserGenresRaw(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.genres);
}

async function listUserStylesRaw(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.styles);
}

// Inc 23 (022): cache wrappers.
export const listUserGenres = cacheUser(listUserGenresRaw, 'listUserGenres');
export const listUserStyles = cacheUser(listUserStylesRaw, 'listUserStyles');

/**
 * Lista distinct de prateleiras (`shelfLocation`) em uso pelo user.
 * Ordenadas alfabeticamente case-insensitive (Inc 21 / Decisão 2).
 * Filtra null e strings vazias/whitespace-only — uma garantia
 * defensiva para casos legados que possam existir.
 */
async function listUserShelvesRaw(userId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ shelf: records.shelfLocation })
    .from(records)
    .where(and(eq(records.userId, userId), isNotNull(records.shelfLocation)))
    .orderBy(sql`lower(${records.shelfLocation})`);

  return rows
    .map((r) => r.shelf)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

// Inc 23 (022): cache wrapper.
export const listUserShelves = cacheUser(listUserShelvesRaw, 'listUserShelves');
