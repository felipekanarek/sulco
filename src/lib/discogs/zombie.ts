import 'server-only';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { syncRuns } from '@/db/schema';

// Em serverless Vercel Hobby, maxDuration é hard-killed em 60s.
// Threshold de 65s reclama o run 5s após a morte garantida, minimizando
// o gap entre workers. Margem curta mas segura: a persistência é granular
// (newCount por release, lastCheckpointPage por página), então mesmo que
// o worker morra mid-página o próximo retoma sem perda via skip-existing.
const STALE_RUN_MS = 65 * 1000;

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
