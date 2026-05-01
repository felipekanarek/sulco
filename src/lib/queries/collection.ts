import 'server-only';
import { and, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import type { Record as RecordRow } from '@/db/schema';
import { matchesNormalizedText } from '@/lib/text';
import { cacheUser } from '@/lib/cache';
import { getUserFacets } from '@/lib/queries/user-facets';

export type BombaFilter = 'any' | 'only' | 'none';
export type StatusFilter = 'all' | 'unrated' | 'active' | 'discarded';

export type CollectionQuery = {
  userId: number;
  status: StatusFilter;
  text: string;
  genres: string[]; // AND entre termos (FR-006)
  styles: string[]; // AND entre estilos (FR-006)
  bomba: BombaFilter; // tri-estado (FR-006)
  // Inc 22 (paginação): default page=1, pageSize=50 quando omitido
  page?: number;
  pageSize?: number;
};

/** Default de paginação na listagem da home (Inc 22). */
export const DEFAULT_PAGE_SIZE = 50;

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
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE);
  const offset = (page - 1) * pageSize;
  const hasTextFilter = q.text.trim().length > 0;

  const conds: SQL[] = [eq(records.userId, q.userId), eq(records.archived, false)];

  if (q.status !== 'all') {
    conds.push(eq(records.status, q.status));
  }

  // Inc 18 (021): text filter sai do SQL e vai pra JS pós-query
  // pra ser accent-insensitive. Demais filtros continuam SQL.
  conds.push(...buildCollectionFilters({ ...q, omitText: true }));

  // Inc 22: paginação SQL quando SEM text filter (caso comum, máximo
  // ganho). Com text filter, carrega tudo + filtra JS + pagina JS
  // pra preservar matches accent-insensitive (Inc 18).
  const baseSelect = {
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
  };

  const rowsRaw = hasTextFilter
    ? await db
        .select(baseSelect)
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.importedAt))
    : await db
        .select(baseSelect)
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.importedAt))
        .limit(pageSize)
        .offset(offset);

  // Inc 18: text filter JS sobre o resultado SQL.
  const filtered = hasTextFilter
    ? rowsRaw.filter((r) =>
        matchesNormalizedText([r.artist, r.title, r.label], q.text),
      )
    : rowsRaw;

  // Inc 22: paginação JS aplica APENAS quando há text filter (SQL
  // já trouxe a página correta no caso sem text).
  const rows = hasTextFilter ? filtered.slice(offset, offset + pageSize) : filtered;

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

// Inc 24: derivado de user_facets (1 SELECT) em vez de COUNT-by-status.
export async function collectionCounts(userId: number): Promise<CollectionCounts> {
  const f = await getUserFacets(userId);
  return {
    total: f.recordsTotal,
    ativos: f.recordsActive,
    naoAvaliados: f.recordsUnrated,
    descartados: f.recordsDiscarded,
  };
}

// Inc 24: derivado de user_facets.tracksSelectedTotal.
export async function countSelectedTracks(userId: number): Promise<number> {
  const f = await getUserFacets(userId);
  return f.tracksSelectedTotal;
}

export type FacetCount = { value: string; count: number };

// Inc 24: derivado de user_facets.genresJson/stylesJson (1 SELECT total).
export async function listUserGenres(userId: number): Promise<FacetCount[]> {
  const f = await getUserFacets(userId);
  return f.genres;
}

export async function listUserStyles(userId: number): Promise<FacetCount[]> {
  const f = await getUserFacets(userId);
  return f.styles;
}

/**
 * Lista distinct de prateleiras (`shelfLocation`) em uso pelo user.
 * Inc 24: derivado de user_facets.shelvesJson.
 */
export async function listUserShelves(userId: number): Promise<string[]> {
  const f = await getUserFacets(userId);
  return f.shelves;
}
