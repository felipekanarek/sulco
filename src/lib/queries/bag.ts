import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, setTracks, tracks } from '@/db/schema';

export type BagDisc = {
  recordId: number;
  artist: string;
  recordTitle: string;
  coverUrl: string | null;
  shelfLocation: string | null;
  tracksInSet: number;
  hasBomb: boolean; // alguma faixa DESTE disco marcada com isBomb e que está no set
};

/**
 * Deriva a bag física de um set (FR-027).
 * Retorna a lista de discos únicos cujas faixas compõem o set, ordenados
 * por `shelfLocation` (NULL no fim) e depois artista. Não é persistido —
 * derivado em tempo de leitura a cada chamada.
 */
export async function derivePhysicalBag(
  userId: number,
  setId: number,
): Promise<BagDisc[]> {
  const rows = await db
    .select({
      recordId: records.id,
      artist: records.artist,
      recordTitle: records.title,
      coverUrl: records.coverUrl,
      shelfLocation: records.shelfLocation,
      tracksInSet: sql<number>`COUNT(${tracks.id})`,
      hasBomb: sql<number>`MAX(CASE WHEN ${tracks.isBomb} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(setTracks)
    .innerJoin(tracks, eq(tracks.id, setTracks.trackId))
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(setTracks.setId, setId), eq(records.userId, userId)))
    .groupBy(records.id)
    .orderBy(
      // shelfLocation preenchido primeiro; nulos no fim; depois artista
      sql`${records.shelfLocation} IS NULL`,
      asc(records.shelfLocation),
      asc(records.artist),
    );

  return rows.map((r) => ({
    recordId: r.recordId,
    artist: r.artist,
    recordTitle: r.recordTitle,
    coverUrl: r.coverUrl,
    shelfLocation: r.shelfLocation,
    tracksInSet: Number(r.tracksInSet ?? 0),
    hasBomb: Boolean(r.hasBomb),
  }));
}
