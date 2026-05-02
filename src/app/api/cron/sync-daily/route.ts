import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { runDailyAutoSync } from '@/lib/discogs/sync';
import { killZombieSyncRuns } from '@/lib/discogs/zombie';
import { recomputeFacets } from '@/lib/queries/user-facets';

/**
 * POST /api/cron/sync-daily — FR-032, contracts/cron-endpoint.md.
 *
 * Protegido por `CRON_SECRET` no header `authorization: Bearer <secret>`.
 * Vercel Cron envia automaticamente. Schedule: `0 7 * * *` UTC (= 04:00 SP)
 * definido em `vercel.json` (T009).
 *
 * Para cada user com credencial válida, executa `runDailyAutoSync` sequencial
 * — no piloto com 1 DJ isso é trivial; se virar SaaS vale paralelizar ou
 * filar workers, fora do escopo.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron] CRON_SECRET não configurado');
    return new NextResponse('server misconfigured', { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (presented !== expected) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const eligibleUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        // credencial preenchida + ativa
        eq(users.discogsCredentialStatus, 'valid'),
      ),
    );

  const withDiscogsCreds = await db
    .select({
      id: users.id,
      username: users.discogsUsername,
      token: users.discogsTokenEncrypted,
    })
    .from(users);

  const runnable = withDiscogsCreds
    .filter((u) => u.username && u.token)
    .map((u) => u.id)
    .filter((id) => eligibleUsers.some((e) => e.id === id));

  const started = Date.now();
  let okCount = 0;
  let rateLimitedCount = 0;
  let errCount = 0;
  let zombiesKilled = 0;

  // Inc 26: zombie cleanup centralizado aqui (era em getImportProgress
  // e loadStatusSnapshot, rodando 1× por load — agora 1×/dia/user).
  // Itera TODOS os users (não só os com credencial Discogs), pois
  // zombies podem existir em syncRuns de qualquer kind.
  const allUsers = await db.select({ id: users.id }).from(users);
  for (const u of allUsers) {
    try {
      await killZombieSyncRuns(u.id);
      zombiesKilled += 1;
    } catch (err) {
      console.error(`[cron] killZombieSyncRuns falhou pra user ${u.id}:`, err);
    }
  }

  for (const userId of runnable) {
    try {
      const result = await runDailyAutoSync(userId);
      if (result.outcome === 'ok') okCount += 1;
      else if (result.outcome === 'rate_limited') rateLimitedCount += 1;
      else errCount += 1;
    } catch (err) {
      console.error(`[cron] user ${userId} falhou`, err);
      errCount += 1;
    }
  }

  // Inc 27: drift correction — recompute completo de user_facets
  // pra cada user. Os Server Actions de write usam delta updates
  // direcionados (Inc 27); aqui corrigimos qualquer drift residual
  // (race, edge case, edição via SQL direto). Roda 1×/dia/user;
  // custo ~7 queries pesadas × N users = irrelevante na escala
  // atual (Felipe solo, projetando 5-10 amigos).
  let driftCorrected = 0;
  for (const u of allUsers) {
    try {
      await recomputeFacets(u.id);
      driftCorrected += 1;
    } catch (err) {
      console.error(`[cron] recomputeFacets drift correction falhou pra user ${u.id}:`, err);
    }
  }
  console.log(
    `[cron sync-daily] drift correction: ${driftCorrected}/${allUsers.length} users recomputed`,
  );

  return NextResponse.json(
    {
      ran: runnable.length,
      ok: okCount,
      rate_limited: rateLimitedCount,
      erro: errCount,
      zombies_swept: zombiesKilled,
      drift_corrected: driftCorrected,
      durationMs: Date.now() - started,
    },
    { status: 200 },
  );
}
