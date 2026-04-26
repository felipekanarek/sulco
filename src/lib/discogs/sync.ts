import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
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

  // 007 (segunda iteração): snapshot anterior NÃO é mais necessário pra
  // detectar removidos. Sync agora compara localIds (records.discogsId
  // ativos) vs currentIds (paginação completa Discogs). Snapshot continua
  // sendo gravado ao final pra histórico/debug, mas não é LIDO.

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
    // 007/Bug 12 (segunda iteração): pagina a coleção INTEIRA pra
    // detectar removidos corretamente. Sync incremental originalmente
    // só pegava 1ª página, o que falhava pra discos antigos removidos
    // (estavam em página 2+ → snapshot nem sabia). Acervos típicos
    // do Sulco têm 20–30 páginas (2000-3000 discos × 100/página) →
    // ~30s de fetches sequenciais (rate limit Discogs ~1 req/s). Cabe
    // em Vercel Lambda 60s + budget pros novos/archives.
    const firstPage = await fetchCollectionPage(userId, {
      page: 1,
      perPage: PER_PAGE,
    });
    const currentIds: number[] = firstPage.releases.map((r) => r.id);
    const totalPages = firstPage.pagination.pages;
    for (let p = 2; p <= totalPages; p++) {
      const next = await fetchCollectionPage(userId, {
        page: p,
        perPage: PER_PAGE,
      });
      for (const r of next.releases) currentIds.push(r.id);
    }
    const currentSet = new Set(currentIds);

    // IDs locais que já existiam ANTES deste sync
    const localRows = await db
      .select({ discogsId: records.discogsId })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.archived, false)));
    const localIds = new Set(localRows.map((r) => r.discogsId));

    // 007/Bug 11: fetchRelease APENAS pra discos novos. Pra os já
    // existentes em `records`, pular — assumimos metadata Discogs
    // estável após import inicial. DJ pode forçar refresh via botão
    // "Reimportar este disco" (kind='reimport_record').
    for (const releaseId of currentIds) {
      if (localIds.has(releaseId)) continue;
      const full = await fetchRelease(userId, releaseId);
      const res = await applyDiscogsUpdate(userId, full, { isNew: true });
      if (res.created) newCount += 1;
    }

    // Removidos: discos em `records` (ativo, não-archived) que não
    // estão mais em currentIds (= sumiram da coleção Discogs).
    // Com paginação completa, comparação é exata: se não tá em
    // currentSet, não tá no Discogs. (Race entre user editando
    // coleção durante o sync é rara e cabe pro próximo sync corrigir.)
    for (const localId of localIds) {
      if (currentSet.has(localId)) continue;
      const target = await db
        .select({ id: records.id })
        .from(records)
        .where(
          and(
            eq(records.userId, userId),
            eq(records.discogsId, localId),
            eq(records.archived, false),
          ),
        )
        .limit(1);
      if (target.length === 0) continue;
      await archiveRecord(userId, target[0].id);
      removedCount += 1;
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

