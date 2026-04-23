import 'server-only';
import { and, desc, eq, exists, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import type { Record as RecordRow } from '@/db/schema';

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

export async function queryCollection(q: CollectionQuery): Promise<CollectionRow[]> {
  const conds: SQL[] = [eq(records.userId, q.userId), eq(records.archived, false)];

  if (q.status !== 'all') {
    conds.push(eq(records.status, q.status));
  }

  if (q.text.length > 0) {
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

  const rows = await db
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
      hasBomb: sql<number>`EXISTS (SELECT 1 FROM ${tracks} WHERE ${tracks.recordId} = ${records.id} AND ${tracks.isBomb} = 1)`,
      tracksTotal: sql<number>`(SELECT COUNT(*) FROM ${tracks} WHERE ${tracks.recordId} = ${records.id})`,
      tracksSelected: sql<number>`(SELECT COUNT(*) FROM ${tracks} WHERE ${tracks.recordId} = ${records.id} AND ${tracks.selected} = 1)`,
    })
    .from(records)
    .where(and(...conds))
    .orderBy(desc(records.importedAt));

  return rows.map((r) => ({
    ...r,
    genres: r.genres ?? [],
    styles: r.styles ?? [],
    hasBomb: Boolean(r.hasBomb),
    tracksTotal: Number(r.tracksTotal ?? 0),
    tracksSelected: Number(r.tracksSelected ?? 0),
  }));
}

export async function collectionCounts(userId: number): Promise<CollectionCounts> {
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

/** Retorna a soma global de faixas com `selected=true` do usuário. */
export async function countSelectedTracks(userId: number): Promise<number> {
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

export async function listUserGenres(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.genres);
}

export async function listUserStyles(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.styles);
}
