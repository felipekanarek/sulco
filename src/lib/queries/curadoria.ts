import 'server-only';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';

/**
 * Comparador natural de posições de faixa Discogs.
 *
 * Extrai lado (letra) + número e ordena por lado primeiro. Formatos
 * comuns: "A1", "B2" (LP padrão), "1A", "1B" (EPs compilados), "1",
 * "2", "10" (CD), "A" (medley single-track).
 *
 * Regras:
 * 1. Lado (A < B < C...) vem primeiro; posições sem letra (CD) têm
 *    side="" e agrupam antes.
 * 2. Dentro do mesmo lado, número crescente (1 < 2 < 10, numérico,
 *    não lexicográfico).
 * 3. Tiebreaker por string bruta pra estabilidade.
 */
export function compareTrackPositions(a: string, b: string): number {
  const parse = (p: string) => {
    const sideMatch = p.match(/[A-Za-z]+/);
    const trackMatch = p.match(/\d+/);
    return {
      side: sideMatch ? sideMatch[0].toUpperCase() : '',
      track: trackMatch ? parseInt(trackMatch[0], 10) : 0,
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.side !== pb.side) return pa.side.localeCompare(pb.side);
  if (pa.track !== pb.track) return pa.track - pb.track;
  return a.localeCompare(b);
}

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

  const trackRowsRaw = await db
    .select()
    .from(tracks)
    .where(eq(tracks.recordId, recordId));

  // Ordena lado primeiro, depois número: A1, A2, B1, B2 mesmo quando
  // Discogs manda os dados como "1A, 1B, 2A, 2B" ou CDs com "1, 10, 2".
  const trackRows = trackRowsRaw.sort((a, b) => {
    const c = compareTrackPositions(a.position, b.position);
    return c !== 0 ? c : a.id - b.id;
  });

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
