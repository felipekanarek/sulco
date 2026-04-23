import 'server-only';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';

export type CuradoriaStatusFilter = 'unrated' | 'active' | 'discarded' | 'all';

export type CuradoriaDisc = {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  country: string | null;
  format: string | null;
  coverUrl: string | null;
  genres: string[];
  styles: string[];
  status: 'unrated' | 'active' | 'discarded';
  shelfLocation: string | null;
  tracks: {
    id: number;
    position: string;
    title: string;
    duration: string | null;
    selected: boolean;
    bpm: number | null;
    musicalKey: string | null;
    energy: number | null;
    rating: number | null;
    moods: string[];
    contexts: string[];
    fineGenre: string | null;
    references: string | null;
    comment: string | null;
    isBomb: boolean;
  }[];
};

/**
 * Retorna TODOS os IDs de records que pertencem ao filtro de triagem,
 * ordenados por `importedAt ASC` (mesma ordem em que foram importados).
 * Usado para construir a lista sequencial de /curadoria.
 */
export async function listCuradoriaIds(
  userId: number,
  statusFilter: CuradoriaStatusFilter,
): Promise<number[]> {
  const conds: SQL[] = [eq(records.userId, userId), eq(records.archived, false)];
  if (statusFilter !== 'all') {
    conds.push(eq(records.status, statusFilter));
  }
  const rows = await db
    .select({ id: records.id })
    .from(records)
    .where(and(...conds))
    .orderBy(asc(records.importedAt), asc(records.id));
  return rows.map((r) => r.id);
}

/** Carrega um disco específico pelo id (escopo do user) com suas faixas. */
export async function loadDisc(
  userId: number,
  recordId: number,
): Promise<CuradoriaDisc | null> {
  const row = await db
    .select()
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)))
    .limit(1);
  if (row.length === 0) return null;
  const r = row[0];

  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.recordId, recordId))
    .orderBy(
      // Ordena por position textualmente; suficiente para "A1, A2, B1, B2..."
      sql`${tracks.position} COLLATE NOCASE`,
      asc(tracks.id),
    );

  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    year: r.year,
    label: r.label,
    country: r.country,
    format: r.format,
    coverUrl: r.coverUrl,
    genres: (r.genres ?? []) as string[],
    styles: (r.styles ?? []) as string[],
    status: r.status,
    shelfLocation: r.shelfLocation,
    tracks: trackRows.map((t) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      duration: t.duration,
      selected: t.selected,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      energy: t.energy,
      rating: t.rating,
      moods: (t.moods ?? []) as string[],
      contexts: (t.contexts ?? []) as string[],
      fineGenre: t.fineGenre,
      references: t.references,
      comment: t.comment,
      isBomb: t.isBomb,
    })),
  };
}
