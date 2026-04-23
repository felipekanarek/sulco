import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sets, setTracks, tracks } from '@/db/schema';
import { deriveSetStatus, type SetStatus } from '@/lib/tz';

export type SetRow = {
  id: number;
  name: string;
  eventDate: Date | null;
  location: string | null;
  briefing: string | null;
  trackCount: number;
  recordCount: number;
  createdAt: Date | null;
  status: SetStatus;
};

/**
 * Lista todos os sets do usuário ordenados por `eventDate DESC` (sets com data
 * vêm primeiro, sets sem data — draft — vão para o fim ordenados por createdAt).
 */
export async function listSets(userId: number): Promise<SetRow[]> {
  const rows = await db
    .select({
      id: sets.id,
      name: sets.name,
      eventDate: sets.eventDate,
      location: sets.location,
      briefing: sets.briefing,
      createdAt: sets.createdAt,
      trackCount: sql<number>`(SELECT COUNT(*) FROM ${setTracks} WHERE ${setTracks.setId} = ${sets.id})`,
      recordCount: sql<number>`(SELECT COUNT(DISTINCT ${tracks.recordId}) FROM ${setTracks} JOIN ${tracks} ON ${tracks.id} = ${setTracks.trackId} WHERE ${setTracks.setId} = ${sets.id})`,
    })
    .from(sets)
    .where(eq(sets.userId, userId))
    .orderBy(
      // sets com eventDate primeiro (desc); nulos por createdAt desc
      sql`${sets.eventDate} IS NULL`,
      desc(sets.eventDate),
      desc(sets.createdAt),
    );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    eventDate: r.eventDate,
    location: r.location,
    briefing: r.briefing,
    createdAt: r.createdAt,
    trackCount: Number(r.trackCount ?? 0),
    recordCount: Number(r.recordCount ?? 0),
    status: deriveSetStatus(r.eventDate),
  }));
}

/** Carrega um set pelo id, escopo do user. Retorna null se não pertencer. */
export async function loadSet(userId: number, setId: number) {
  const row = await db
    .select()
    .from(sets)
    .where(and(eq(sets.id, setId), eq(sets.userId, userId)))
    .limit(1);
  return row[0] ?? null;
}
