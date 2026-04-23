import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import type { DiscogsRelease } from './client';

/**
 * Aplica um release do Discogs ao banco local — APENAS colunas DISCOGS.
 * Nunca toca campos autorais (Princípio I da Constituição).
 *
 * Upsert em `records` por `(userId, discogsId)` — dedupe Q3/sessão 2.
 *
 * Reconciliação de reaparição (FR-037b):
 * - Se o disco estava `archived=true` e volta a aparecer → reseta
 *   `archived=false, archivedAt=null, archivedAcknowledgedAt=null`.
 * - Se uma faixa estava `conflict=true` e volta a aparecer no release →
 *   reseta `conflict=false, conflictDetectedAt=null`.
 * - Faixas que o Discogs removeu ganham `conflict=true`.
 *
 * Em todos os casos, campos autorais permanecem intactos.
 */
export async function applyDiscogsUpdate(
  userId: number,
  release: DiscogsRelease,
  opts: { isNew: boolean },
): Promise<{ recordId: number; created: boolean }> {
  // ---------------- records ----------------
  const existing = await db
    .select({ id: records.id, archived: records.archived })
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.discogsId, release.id)))
    .limit(1);

  let recordId: number;
  let created = false;

  if (existing.length === 0) {
    const inserted = await db
      .insert(records)
      .values({
        userId,
        discogsId: release.id,
        artist: release.artist,
        title: release.title,
        year: release.year,
        label: release.label,
        country: release.country,
        format: release.format,
        coverUrl: release.coverUrl,
        genres: release.genres,
        styles: release.styles,
        // status começa 'unrated' por default do schema; se opts.isNew=false (reimport
        // de disco que sumiu do DB) também começa 'unrated' — caller decide quando criar.
        importedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: records.id });
    recordId = inserted[0].id;
    created = true;
  } else {
    recordId = existing[0].id;
    // UPDATE só em colunas DISCOGS. Reaparição: se archived=true, reseta.
    const wasArchived = existing[0].archived;
    await db
      .update(records)
      .set({
        artist: release.artist,
        title: release.title,
        year: release.year,
        label: release.label,
        country: release.country,
        format: release.format,
        coverUrl: release.coverUrl,
        genres: release.genres,
        styles: release.styles,
        updatedAt: new Date(),
        ...(wasArchived
          ? { archived: false, archivedAt: null, archivedAcknowledgedAt: null }
          : {}),
      })
      .where(eq(records.id, recordId));
  }

  // ---------------- tracks ----------------
  // Carrega tracks existentes deste record para calcular diff
  const existingTracks = await db
    .select({
      id: tracks.id,
      position: tracks.position,
      conflict: tracks.conflict,
    })
    .from(tracks)
    .where(eq(tracks.recordId, recordId));

  // Dedup defensivo: alguns releases do Discogs (box sets, medleys com sub_tracks
  // achatados) trazem múltiplas entradas com a mesma `position`. Mantemos a
  // primeira ocorrência para respeitar a UNIQUE `(recordId, position)` do schema.
  const incomingByPosition = new Map<string, (typeof release.tracklist)[number]>();
  for (const t of release.tracklist) {
    if (!incomingByPosition.has(t.position)) {
      incomingByPosition.set(t.position, t);
    }
  }
  const existingByPosition = new Map(existingTracks.map((t) => [t.position, t]));

  // Upsert de faixas presentes no release (itera o map deduplicado)
  for (const incoming of incomingByPosition.values()) {
    const local = existingByPosition.get(incoming.position);
    if (!local) {
      // nova faixa
      await db.insert(tracks).values({
        recordId,
        position: incoming.position,
        title: incoming.title,
        duration: incoming.duration,
        updatedAt: new Date(),
      });
    } else {
      // reaparição (FR-037b): se estava em conflict, reseta
      const resetConflict = local.conflict
        ? { conflict: false, conflictDetectedAt: null as Date | null }
        : {};
      await db
        .update(tracks)
        .set({
          title: incoming.title,
          duration: incoming.duration,
          updatedAt: new Date(),
          ...resetConflict,
        })
        .where(eq(tracks.id, local.id));
    }
  }

  // Faixas que existiam e agora sumiram do release ganham conflict=true (FR-037)
  for (const local of existingTracks) {
    if (!incomingByPosition.has(local.position) && !local.conflict) {
      await db
        .update(tracks)
        .set({ conflict: true, conflictDetectedAt: new Date() })
        .where(eq(tracks.id, local.id));
    }
  }

  return { recordId, created };
}
