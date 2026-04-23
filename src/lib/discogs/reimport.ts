import 'server-only';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns } from '@/db/schema';
import {
  DiscogsAuthError,
  DiscogsError,
  fetchRelease,
} from './client';
import { applyDiscogsUpdate } from './apply-update';
import { markCredentialInvalid } from './index';
import type { SyncOutcome } from './import';

const COOLDOWN_MS = 60_000;

export type ReimportOutcome =
  | SyncOutcome
  | { outcome: 'rate_limited'; retryAfterSeconds: number };

/**
 * Reimport individual de um disco (FR-034, FR-034a).
 * - Cooldown 60s por `(userId, recordId)`: se último reimport OK foi há
 *   menos que 60s, retorna `rate_limited` com retryAfterSeconds restante.
 * - Atualiza APENAS colunas Discogs via `applyDiscogsUpdate` (Princípio I).
 * - Registra syncRun `kind='reimport_record'` para histórico/painel.
 */
export async function reimportRecordJob(
  userId: number,
  recordId: number,
): Promise<ReimportOutcome> {
  // Carrega o disco para obter discogsId + validar ownership
  const recordRows = await db
    .select({ discogsId: records.discogsId })
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)))
    .limit(1);
  if (recordRows.length === 0) {
    return { outcome: 'erro', errorMessage: 'Disco não encontrado.' };
  }
  const discogsId = recordRows[0].discogsId;

  // Cooldown: procura um reimport deste (userId, recordId) com outcome='ok'
  // terminado há menos de 60s.
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);
  const recent = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        eq(syncRuns.kind, 'reimport_record'),
        eq(syncRuns.targetRecordId, recordId),
        eq(syncRuns.outcome, 'ok'),
        gt(syncRuns.finishedAt, cooldownCutoff),
      ),
    )
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  if (recent.length > 0 && recent[0].finishedAt) {
    const elapsed = Date.now() - recent[0].finishedAt.getTime();
    const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
    return { outcome: 'rate_limited', retryAfterSeconds: remaining };
  }

  // Cria syncRun
  const inserted = await db
    .insert(syncRuns)
    .values({
      userId,
      kind: 'reimport_record',
      targetRecordId: recordId,
      startedAt: new Date(),
      outcome: 'running',
    })
    .returning({ id: syncRuns.id });
  const runId = inserted[0].id;

  try {
    const full = await fetchRelease(userId, discogsId);
    await applyDiscogsUpdate(userId, full, { isNew: false });

    await db
      .update(syncRuns)
      .set({
        outcome: 'ok',
        finishedAt: new Date(),
        newCount: 0,
      })
      .where(eq(syncRuns.id, runId));

    return { outcome: 'ok', newCount: 0, removedCount: 0, conflictCount: 0 };
  } catch (err) {
    if (err instanceof DiscogsAuthError) {
      await markCredentialInvalid(userId);
      await db
        .update(syncRuns)
        .set({
          outcome: 'erro',
          errorMessage: 'Token Discogs rejeitado (HTTP 401)',
          finishedAt: new Date(),
        })
        .where(eq(syncRuns.id, runId));
      return { outcome: 'erro', errorMessage: 'Token Discogs rejeitado' };
    }
    if (err instanceof DiscogsError && err.status === 429) {
      const retry = err.retryAfterSeconds ?? 60;
      await db
        .update(syncRuns)
        .set({
          outcome: 'rate_limited',
          errorMessage: `Rate limit; retry em ${retry}s`,
          finishedAt: new Date(),
        })
        .where(eq(syncRuns.id, runId));
      return { outcome: 'rate_limited', retryAfterSeconds: retry };
    }
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(syncRuns)
      .set({
        outcome: 'erro',
        errorMessage: msg.slice(0, 500),
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId));
    return { outcome: 'erro', errorMessage: msg };
  }
}
