import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { records, tracks } from '@/db/schema';
import { applyVocabDelta } from '@/lib/queries/user-vocab';

/**
 * Arquiva um disco que saiu da coleção Discogs (FR-036).
 * NEVER toca campos autorais — Princípio I da Constituição.
 * Sinaliza `archived=true`; DJ reconhece via `acknowledgeArchivedRecord`.
 *
 * Inc 33: ao arquivar, decrementa todas as referências do disco em
 * `user_vocab` (genres + styles do record + moods/contexts de TODAS
 * as tracks + shelf). Restore (reaparição) é tratado em
 * `applyDiscogsUpdate` quando record volta com `wasArchived=true`.
 */
export async function archiveRecord(userId: number, recordId: number): Promise<{ archived: true }> {
  // Carrega genres/styles/shelf do record + moods/contexts de todas as tracks
  // ANTES do UPDATE. Necessário pra computar bulk decrement.
  const [recordRow] = await db
    .select({
      genres: records.genres,
      styles: records.styles,
      shelf: records.shelfLocation,
      format: records.format,
      country: records.country,
      label: records.label,
      archived: records.archived,
    })
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)))
    .limit(1);

  // Skip se já arquivado (idempotência) — mesmo comportamento do
  // WHERE archived=false antigo no UPDATE.
  if (!recordRow || recordRow.archived) {
    return { archived: true };
  }

  const trackRows = await db
    .select({ moods: tracks.moods, contexts: tracks.contexts })
    .from(tracks)
    .where(eq(tracks.recordId, recordId));

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

  // Bulk decrement em user_vocab.
  try {
    const genres = (recordRow.genres ?? []) as string[];
    const styles = (recordRow.styles ?? []) as string[];
    if (genres.length > 0) await applyVocabDelta(userId, 'genres', [], genres);
    if (styles.length > 0) await applyVocabDelta(userId, 'styles', [], styles);
    if (recordRow.shelf) await applyVocabDelta(userId, 'shelves', [], [recordRow.shelf]);
    // Inc 8 (032): decrementa format/country/label do record arquivado.
    const fmt = (recordRow.format ?? '').trim();
    const ctry = (recordRow.country ?? '').trim();
    const lbl = (recordRow.label ?? '').trim();
    if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [], [fmt]);
    if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [], [ctry]);
    if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [], [lbl]);

    const allMoods = trackRows.flatMap((t) => (t.moods ?? []) as string[]);
    const allContexts = trackRows.flatMap((t) => (t.contexts ?? []) as string[]);
    if (allMoods.length > 0) await applyVocabDelta(userId, 'moods', [], allMoods);
    if (allContexts.length > 0) await applyVocabDelta(userId, 'contexts', [], allContexts);
  } catch (err) {
    console.error('[applyVocabDelta] erro pós-archive:', err);
  }

  return { archived: true };
}
