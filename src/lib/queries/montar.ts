import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, setTracks, tracks } from '@/db/schema';

export type BombaFilter = 'any' | 'only' | 'none';

export type MontarFilters = {
  bpm?: { min?: number; max?: number };
  musicalKey?: string[]; // OR entre tons selecionados
  energy?: { min?: number; max?: number };
  rating?: { min?: number; max?: number };
  moods?: string[]; // AND entre termos (FR-024)
  contexts?: string[]; // AND entre termos (FR-024)
  bomba?: BombaFilter;
  text?: string;
};

export type Candidate = {
  id: number;
  position: string;
  title: string;
  duration: string | null;
  bpm: number | null;
  musicalKey: string | null;
  energy: number | null;
  rating: number | null;
  moods: string[];
  contexts: string[];
  fineGenre: string | null;
  comment: string | null;
  references: string | null;
  aiAnalysis: string | null;
  isBomb: boolean;
  // 008 — preview de áudio
  previewUrl: string | null;
  previewUrlCachedAt: Date | null;
  // record context
  recordId: number;
  artist: string;
  recordTitle: string;
  coverUrl: string | null;
  shelfLocation: string | null;
  recordNotes: string | null;
  recordGenres: string[];
  recordStyles: string[];
};

/**
 * Retorna faixas-candidatas para compor um set (FR-023).
 * Requer `tracks.selected=true` E `records.status='active'` E `records.archived=false`.
 * Filtros aplicados em AND entre si. Dentro de moods/contexts, AND entre termos
 * (FR-024, reforçado pela memória feedback_filter_semantics).
 *
 * Aplica `inSetIds` como exclusão da query quando passado (evita trazer
 * candidatos já no set).
 */
export async function queryCandidates(
  userId: number,
  filters: MontarFilters,
  opts: {
    excludeTrackIds?: number[];
    limit?: number;
    /**
     * 014 (Inc 1): quando true, ordena por score de campos AUTHOR
     * preenchidos (mais bem-curadas primeiro). Desempate por
     * `tracks.updatedAt DESC`. Usado pelo `suggestSetTracks` pra
     * truncar catálogo elegível em 50 candidatos com mais contexto
     * pra IA. Default false preserva ordem original (rating DESC,
     * artist ASC, position ASC) usada na UI manual.
     */
    rankByCuration?: boolean;
  } = {},
): Promise<Candidate[]> {
  const conds: SQL[] = [
    eq(records.userId, userId),
    eq(records.archived, false),
    eq(records.status, 'active'),
    eq(tracks.selected, true),
  ];

  if (filters.bpm?.min != null) conds.push(gte(tracks.bpm, filters.bpm.min));
  if (filters.bpm?.max != null) conds.push(lte(tracks.bpm, filters.bpm.max));
  if (filters.energy?.min != null) conds.push(gte(tracks.energy, filters.energy.min));
  if (filters.energy?.max != null) conds.push(lte(tracks.energy, filters.energy.max));
  if (filters.rating?.min != null) conds.push(gte(tracks.rating, filters.rating.min));
  if (filters.rating?.max != null) conds.push(lte(tracks.rating, filters.rating.max));
  if (filters.musicalKey && filters.musicalKey.length > 0) {
    conds.push(inArray(tracks.musicalKey, filters.musicalKey));
  }

  // moods/contexts: AND dentro do campo (FR-024)
  if (filters.moods && filters.moods.length > 0) {
    for (const m of filters.moods) {
      conds.push(sql`EXISTS (SELECT 1 FROM json_each(${tracks.moods}) WHERE value = ${m})`);
    }
  }
  if (filters.contexts && filters.contexts.length > 0) {
    for (const c of filters.contexts) {
      conds.push(sql`EXISTS (SELECT 1 FROM json_each(${tracks.contexts}) WHERE value = ${c})`);
    }
  }

  if (filters.bomba === 'only') conds.push(eq(tracks.isBomb, true));
  else if (filters.bomba === 'none') conds.push(eq(tracks.isBomb, false));

  if (filters.text && filters.text.trim().length > 0) {
    const pattern = `%${filters.text.toLowerCase().trim()}%`;
    conds.push(
      sql`(lower(${tracks.title}) LIKE ${pattern} OR lower(${records.artist}) LIKE ${pattern} OR lower(${records.title}) LIKE ${pattern} OR lower(COALESCE(${tracks.fineGenre},'')) LIKE ${pattern})`,
    );
  }

  if (opts.excludeTrackIds && opts.excludeTrackIds.length > 0) {
    conds.push(sql`${tracks.id} NOT IN ${opts.excludeTrackIds}`);
  }

  // 014 (Inc 1): score de "mais bem-curadas" pra ranking quando
  // rankByCuration=true. Soma 1 por campo AUTHOR não-nulo. Inclui
  // ai_analysis (Inc 013). Empate desfeito por updatedAt DESC.
  const curationScore = sql`(
    (CASE WHEN ${tracks.bpm} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.musicalKey} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.energy} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN json_array_length(${tracks.moods}) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN json_array_length(${tracks.contexts}) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.comment} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.aiAnalysis} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.rating} IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN ${tracks.fineGenre} IS NOT NULL THEN 1 ELSE 0 END)
  )`;

  const orderBy = opts.rankByCuration
    ? [desc(curationScore), desc(tracks.updatedAt)]
    : [desc(tracks.rating), asc(records.artist), asc(tracks.position)];

  const rows = await db
    .select({
      id: tracks.id,
      position: tracks.position,
      title: tracks.title,
      duration: tracks.duration,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
      energy: tracks.energy,
      rating: tracks.rating,
      moods: tracks.moods,
      contexts: tracks.contexts,
      fineGenre: tracks.fineGenre,
      comment: tracks.comment,
      references: tracks.references,
      aiAnalysis: tracks.aiAnalysis,
      isBomb: tracks.isBomb,
      previewUrl: tracks.previewUrl,
      previewUrlCachedAt: tracks.previewUrlCachedAt,
      recordId: records.id,
      artist: records.artist,
      recordTitle: records.title,
      coverUrl: records.coverUrl,
      shelfLocation: records.shelfLocation,
      recordNotes: records.notes,
      recordGenres: records.genres,
      recordStyles: records.styles,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(...conds))
    .orderBy(...orderBy)
    .limit(opts.limit ?? 300);

  return rows.map((r) => ({
    ...r,
    moods: (r.moods ?? []) as string[],
    contexts: (r.contexts ?? []) as string[],
    recordGenres: (r.recordGenres ?? []) as string[],
    recordStyles: (r.recordStyles ?? []) as string[],
  }));
}

/** Lista as faixas atualmente no set, em ordem. */
export async function listSetTracks(setId: number, userId: number) {
  // Ownership via records.userId (todas as tracks de um set pertencem ao user do set)
  const rows = await db
    .select({
      trackId: tracks.id,
      position: tracks.position,
      title: tracks.title,
      duration: tracks.duration,
      rating: tracks.rating,
      bpm: tracks.bpm,
      musicalKey: tracks.musicalKey,
      energy: tracks.energy,
      isBomb: tracks.isBomb,
      recordId: records.id,
      artist: records.artist,
      recordTitle: records.title,
      coverUrl: records.coverUrl,
      shelfLocation: records.shelfLocation,
      order: setTracks.order,
    })
    .from(setTracks)
    .innerJoin(tracks, eq(tracks.id, setTracks.trackId))
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(setTracks.setId, setId), eq(records.userId, userId)))
    .orderBy(asc(setTracks.order));
  return rows;
}

/** Vocabulário distinto usado em faixas SELECIONADAS de discos ATIVOS do user. */
export async function listSelectedVocab(
  userId: number,
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  const column = kind === 'moods' ? tracks.moods : tracks.contexts;
  const rows = await db
    .select({ value: sql<string>`DISTINCT value` })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .innerJoin(sql`json_each(${column})`, sql`1=1`)
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, false),
        eq(records.status, 'active'),
        eq(tracks.selected, true),
      ),
    );
  return rows
    .map((r) => r.value)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
