import 'server-only';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { syncRuns } from '@/db/schema';

const STALE_RUN_MS = 15 * 60 * 1000; // 15 min

/**
 * Mata runs zumbis: `outcome='running'` sem progresso há mais de 15 min.
 * Acontece quando o processo Node morre no meio do job (dev reload, crash,
 * serverless timeout). Sem isso, o próximo disparo abortaria achando que
 * há um em execução.
 */
export async function killZombieSyncRuns(
  userId: number,
  kind?: 'initial_import' | 'daily_auto' | 'manual' | 'reimport_record',
) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const base = and(
    eq(syncRuns.userId, userId),
    eq(syncRuns.outcome, 'running'),
    lt(syncRuns.startedAt, cutoff),
  );
  const conds = kind ? and(base, eq(syncRuns.kind, kind)) : base;
  await db
    .update(syncRuns)
    .set({
      outcome: 'erro',
      errorMessage: sql`COALESCE(${syncRuns.errorMessage}, '') || ' [run zumbi; processo caiu sem finalizar]'`,
      finishedAt: new Date(),
    })
    .where(conds);
}
