import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { records } from '@/db/schema';

/**
 * Arquiva um disco que saiu da coleção Discogs (FR-036).
 * NEVER toca campos autorais — Princípio I da Constituição.
 * Sinaliza `archived=true`; DJ reconhece via `acknowledgeArchivedRecord`.
 */
export async function archiveRecord(userId: number, recordId: number): Promise<{ archived: true }> {
  await db
    .update(records)
    .set({
      archived: true,
      archivedAt: new Date(),
      archivedAcknowledgedAt: null, // pendente de reconhecimento do DJ
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(records.id, recordId),
        eq(records.userId, userId),
        eq(records.archived, false),
      ),
    );
  return { archived: true };
}
