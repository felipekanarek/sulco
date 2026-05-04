import 'server-only';
import { and, desc, eq, exists, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import type { Record as RecordRow } from '@/db/schema';
import { normalizeText } from '@/lib/text';
import { cacheUser } from '@/lib/cache';
import { getUserFacets } from '@/lib/queries/user-facets';
import { listVocab } from '@/lib/queries/user-vocab';

export type BombaFilter = 'any' | 'only' | 'none';
export type StatusFilter = 'all' | 'unrated' | 'active' | 'discarded';

export type CollectionQuery = {
  userId: number;
  status: StatusFilter;
  text: string;
  genres: string[]; // OR dentro de gêneros (FR-006)
  styles: string[]; // OR dentro de estilos (FR-006)
  bomba: BombaFilter; // tri-estado (FR-006)
  // Inc 8 (032): 5 filtros novos multi-select (opcionais — default [] quando omitido).
  // OR dentro de cada kind, AND entre kinds.
  formats?: string[];
  shelves?: string[];
  years?: number[];
  countries?: string[];
  labels?: string[];
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
 *
 * Inc 32 (027): text filter usa LIKE SQL contra `records.searchText`
 * (versão pre-normalizada de artist + title + label). Paginação SQL
 * volta a funcionar — sem JS post-filter.
 */
export function buildCollectionFilters(q: {
  text: string;
  genres: string[];
  styles: string[];
  bomba: BombaFilter;
  // Inc 8 (032): 5 filtros novos. Opcionais — callers existing (ex: pickRandomUnratedRecord)
  // continuam funcionando sem passar.
  formats?: string[];
  shelves?: string[];
  years?: number[];
  countries?: string[];
  labels?: string[];
}): SQL[] {
  const conds: SQL[] = [];

  if (q.text.length > 0) {
    const normalized = normalizeText(q.text);
    if (normalized.length > 0) {
      conds.push(sql`${records.searchText} LIKE ${`%${normalized}%`}`);
    }
  }

  // OR dentro de gêneros (FR-006): disco aparece se tiver QUALQUER um dos gêneros selecionados
  if (q.genres.length > 0) {
    // Inc 35 (030): substitui `EXISTS json_each(records.genres)` por
    // subquery contra `record_genres_genre_idx`. Antes: ~10-15k rows
    // lidas (json_each scan). Agora: ~30 rows.
    conds.push(
      sql`${records.id} IN (SELECT record_id FROM record_genres WHERE genre IN ${q.genres})`,
    );
  }

  // OR dentro de estilos (FR-006): mesma lógica, mais granular
  if (q.styles.length > 0) {
    // Inc 35: idem styles via `record_styles_style_idx`.
    conds.push(
      sql`${records.id} IN (SELECT record_id FROM record_styles WHERE style IN ${q.styles})`,
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

  // Inc 8 (032): 5 filtros novos single-column, OR dentro de cada kind.
  // Pickers populam via user_vocab (Inc 33 estendido). Filtros usam coluna direta.
  if (q.formats && q.formats.length > 0) {
    // Inc 8 follow-up: format vem composto ("Vinyl, LP, Album, Stereo").
    // Match posicional pra evitar falsos positivos ("LP" ≠ "Maxi-LP"):
    // exato OU início "X, %" OU fim "%, X" OU meio "%, X, %".
    const fmtClauses = q.formats.flatMap((f) => [
      sql`${records.format} = ${f}`,
      sql`${records.format} LIKE ${`${f}, %`}`,
      sql`${records.format} LIKE ${`%, ${f}`}`,
      sql`${records.format} LIKE ${`%, ${f}, %`}`,
    ]);
    conds.push(sql`(${sql.join(fmtClauses, sql` OR `)})`);
  }
  if (q.shelves && q.shelves.length > 0) {
    conds.push(sql`${records.shelfLocation} IN ${q.shelves}`);
  }
  if (q.countries && q.countries.length > 0) {
    conds.push(sql`${records.country} IN ${q.countries}`);
  }
  if (q.labels && q.labels.length > 0) {
    conds.push(sql`${records.label} IN ${q.labels}`);
  }
  if (q.years && q.years.length > 0) {
    // Inc 8 follow-up: multi-select de anos individuais (substitui décadas).
    conds.push(sql`${records.year} IN ${q.years}`);
  }

  return conds;
}

async function queryCollectionRaw(q: CollectionQuery): Promise<CollectionRow[]> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const conds: SQL[] = [eq(records.userId, q.userId), eq(records.archived, false)];

  if (q.status !== 'all') {
    conds.push(eq(records.status, q.status));
  }

  // Inc 32 (027): text filter via LIKE SQL contra records.searchText
  // (pre-normalizado). Paginação SQL volta a funcionar com text filter.
  conds.push(...buildCollectionFilters(q));

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

  const rows = await db
    .select(baseSelect)
    .from(records)
    .where(and(...conds))
    .orderBy(desc(records.importedAt))
    .limit(pageSize)
    .offset(offset);

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

// Inc 33: derivado de user_vocab (1 SELECT contra index).
// Wrapper preservando assinatura externa (FacetCount = {value, count}).
export const listUserGenres = (userId: number): Promise<FacetCount[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'genres');
    return entries.map((e) => ({ value: e.term, count: e.count }));
  }, 'listUserGenres')(userId);

export const listUserStyles = (userId: number): Promise<FacetCount[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'styles');
    return entries.map((e) => ({ value: e.term, count: e.count }));
  }, 'listUserStyles')(userId);

/**
 * Lista distinct de prateleiras (`shelfLocation`) em uso pelo user.
 * Inc 33: derivado de user_vocab kind='shelves'.
 */
export const listUserShelves = (userId: number): Promise<string[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'shelves');
    return entries.map((e) => e.term);
  }, 'listUserShelves')(userId);

/* ============================================================
   Inc 8 (032): wrappers para os 3 kinds novos materializados
   em user_vocab (formats/countries/labels) + helper de range
   de ano pra derivar décadas.
   ============================================================ */

/**
 * Lista distinct de formatos em uso pelo user (~5-150 entries dependendo
 * de quão verboso o Discogs traz a string composta).
 */
export const listUserFormats = (userId: number): Promise<string[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'formats');
    return entries.map((e) => e.term);
  }, 'listUserFormats')(userId);

/**
 * Lista distinct de países em uso pelo user (~10-50 entries típicos).
 */
export const listUserCountries = (userId: number): Promise<string[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'countries');
    return entries.map((e) => e.term);
  }, 'listUserCountries')(userId);

/**
 * Lista distinct de selos em uso pelo user (~centenas de entries em
 * coleções grandes). Picker terá busca interna ativa (>20).
 */
export const listUserLabels = (userId: number): Promise<string[]> =>
  cacheUser(async (uid: number) => {
    const entries = await listVocab(uid, 'labels');
    return entries.map((e) => e.term);
  }, 'listUserLabels')(userId);

/**
 * Inc 8 follow-up: lista distinct de anos da coleção (DESC).
 * Cached cross-request via cacheUser (Inc 23) — invalidado em writes.
 * SELECT DISTINCT scaneia ~2.6k records por user; cache evita re-scan
 * em cada navegação.
 */
export const listUserYears = (userId: number): Promise<number[]> =>
  cacheUser(async (uid: number) => {
    const rows = await db
      .selectDistinct({ year: records.year })
      .from(records)
      .where(
        and(
          eq(records.userId, uid),
          eq(records.archived, false),
          isNotNull(records.year),
        ),
      )
      .orderBy(desc(records.year));
    return rows.map((r) => r.year as number).filter((y) => y != null);
  }, 'listUserYears')(userId);
