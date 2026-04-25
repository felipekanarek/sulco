import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns } from '@/db/schema';
import { killZombieSyncRuns } from './zombie';
import {
  DiscogsAuthError,
  DiscogsError,
  fetchCollectionPage,
  fetchRelease,
} from './client';
import { applyDiscogsUpdate } from './apply-update';
import { archiveRecord } from './archive';
import { markCredentialInvalid } from './index';
import type { SyncOutcome } from './import';

const PER_PAGE = 100;

type SyncKind = 'daily_auto' | 'manual';

/**
 * Sync incremental (FR-032, FR-033):
 * - Busca apenas a primeira página de `date_added desc`.
 * - Compara discogsIds atuais com o `snapshotJson` do último syncRun
 *   (daily_auto|manual) do usuário para detectar remoções (FR-036).
 * - Novos → applyDiscogsUpdate(isNew=true) com fetchRelease detalhado.
 * - Removidos → archiveRecord (NEVER deleta, nunca toca autorais).
 * - Grava o novo snapshotJson para a próxima execução comparar.
 */
async function runIncrementalSync(userId: number, kind: SyncKind): Promise<SyncOutcome> {
  // Impede runs paralelos do mesmo kind para o mesmo usuário
  // Antes de verificar concorrência, mata runs zumbis (processo caiu sem
  // atualizar finished_at): running há >15 min sem progresso vira erro.
  await killZombieSyncRuns(userId, kind);

  const running = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        eq(syncRuns.kind, kind),
        eq(syncRuns.outcome, 'running'),
      ),
    )
    .limit(1);
  if (running.length > 0) {
    return {
      outcome: 'erro',
      errorMessage: `Já existe um ${kind} em execução para este usuário.`,
    };
  }

  // 007/Bug 11: snapshot anterior compartilhável entre manual/daily_auto
  // (ambos representam estado completo da 1ª página da coleção).
  // initial_import salva `{totalItems}`, não array de IDs — ignorado.
  // reimport_record é por-disco — não entra no fallback.
  const snapshotKindFallback: SyncKind[] =
    kind === 'manual'
      ? ['manual', 'daily_auto']
      : ['daily_auto', 'manual'];
  const previous = await db
    .select({ kind: syncRuns.kind, snapshotJson: syncRuns.snapshotJson })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        inArray(syncRuns.kind, snapshotKindFallback),
        eq(syncRuns.outcome, 'ok'),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  const prevIds = parseSnapshotIds(previous[0]?.snapshotJson ?? null);
  console.info(
    previous[0]
      ? `[sync] ${kind} herdou snapshot de kind=${previous[0].kind} com ${prevIds?.length ?? 0} ids`
      : `[sync] ${kind} sem snapshot anterior — pula detecção de removidos nesta execução`,
  );

  const inserted = await db
    .insert(syncRuns)
    .values({
      userId,
      kind,
      startedAt: new Date(),
      outcome: 'running',
    })
    .returning({ id: syncRuns.id });
  const runId = inserted[0].id;

  let newCount = 0;
  let removedCount = 0;
  let conflictCount = 0;

  try {
    const page = await fetchCollectionPage(userId, { page: 1, perPage: PER_PAGE });
    const currentIds = page.releases.map((r) => r.id);
    const currentSet = new Set(currentIds);

    // IDs locais que já existiam ANTES deste sync (para detectar novos vs. update)
    const localRows = await db
      .select({ discogsId: records.discogsId })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.archived, false)));
    const localIds = new Set(localRows.map((r) => r.discogsId));

    // 007/Bug 11: chama `fetchRelease` APENAS pra discos novos (ainda
    // não existem em `records`). Pra existentes, pular — assumimos
    // metadata Discogs estável após import inicial. DJ pode forçar
    // refresh de disco específico via botão "Reimportar este disco"
    // (kind='reimport_record', fluxo separado).
    //
    // Sem este filtro, sync incremental fazia 100 requests Discogs
    // por execução (1 por disco da 1ª página), estourando rate limit
    // ~1 req/s × 100 = 100s → Vercel Lambda timeout 60s → run zumbi.
    for (const rel of page.releases) {
      if (localIds.has(rel.id)) continue; // existente, pular
      const full = await fetchRelease(userId, rel.id);
      const res = await applyDiscogsUpdate(userId, full, { isNew: true });
      if (res.created) newCount += 1;
    }

    // Remoções: discos que estavam no snapshot anterior E não estão mais
    // na página atual. Só marca archived para os que estavam ATIVOS (snapshot
    // anterior reflete o que tinha visto na primeira página). FR-036: archive,
    // nunca delete, preserva autorais.
    if (prevIds) {
      for (const oldId of prevIds) {
        if (!currentSet.has(oldId)) {
          // busca o record local com esse discogsId
          const target = await db
            .select({ id: records.id })
            .from(records)
            .where(
              and(
                eq(records.userId, userId),
                eq(records.discogsId, oldId),
                eq(records.archived, false),
              ),
            )
            .limit(1);
          if (target.length > 0) {
            await archiveRecord(userId, target[0].id);
            removedCount += 1;
          }
        }
      }
    }

    // Conflitos acumulados — conta tracks com conflict=true criados neste run
    // (como `applyDiscogsUpdate` pode marcar conflito ao remover faixas,
    // conflictCount fica aproximado; detalhes precisos virão via /status).
    conflictCount = 0; // rastreamento fino será incremental na próxima iteração

    await db
      .update(syncRuns)
      .set({
        outcome: 'ok',
        finishedAt: new Date(),
        newCount,
        removedCount,
        conflictCount,
        snapshotJson: JSON.stringify(currentIds),
      })
      .where(eq(syncRuns.id, runId));

    return { outcome: 'ok', newCount, removedCount, conflictCount };
  } catch (err) {
    if (err instanceof DiscogsAuthError) {
      await markCredentialInvalid(userId);
      await db
        .update(syncRuns)
        .set({
          outcome: 'erro',
          errorMessage: 'Token Discogs rejeitado (HTTP 401)',
          finishedAt: new Date(),
          newCount,
          removedCount,
        })
        .where(eq(syncRuns.id, runId));
      return { outcome: 'erro', errorMessage: 'Token Discogs rejeitado' };
    }
    if (err instanceof DiscogsError && err.status === 429) {
      await db
        .update(syncRuns)
        .set({
          outcome: 'rate_limited',
          errorMessage: `Rate limit; retomar em ${err.retryAfterSeconds ?? 60}s`,
          finishedAt: new Date(),
          newCount,
          removedCount,
        })
        .where(eq(syncRuns.id, runId));
      return {
        outcome: 'rate_limited',
        retryAfterSeconds: err.retryAfterSeconds ?? 60,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(syncRuns)
      .set({
        outcome: 'erro',
        errorMessage: msg.slice(0, 500),
        finishedAt: new Date(),
        newCount,
        removedCount,
      })
      .where(eq(syncRuns.id, runId));
    return { outcome: 'erro', errorMessage: msg };
  }
}

export async function runDailyAutoSync(userId: number): Promise<SyncOutcome> {
  return runIncrementalSync(userId, 'daily_auto');
}

export async function runManualSync(userId: number): Promise<SyncOutcome> {
  return runIncrementalSync(userId, 'manual');
}

function parseSnapshotIds(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number')) {
      return parsed;
    }
    // Compatibilidade com `initial_import` que guarda { totalItems: N }
    return null;
  } catch {
    return null;
  }
}
