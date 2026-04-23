import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns } from '@/db/schema';
import {
  DiscogsAuthError,
  DiscogsError,
  fetchCollectionPage,
  fetchRelease,
} from './client';
import { applyDiscogsUpdate } from './apply-update';
import { markCredentialInvalid } from './index';
import { killZombieSyncRuns } from './zombie';

export type SyncOutcome =
  | { outcome: 'ok'; newCount: number; removedCount: number; conflictCount: number }
  | { outcome: 'parcial'; lastCheckpointPage: number; reason: string }
  | { outcome: 'rate_limited'; retryAfterSeconds: number }
  | { outcome: 'erro'; errorMessage: string };

const PER_PAGE = 100;

/**
 * Importa toda a coleção Discogs do usuário para `records` + `tracks`.
 * Incremental: grava checkpoint por página para permitir retomada (FR-031).
 *
 * - Em 401 → credencial invalidada; abortamos o run.
 * - Em 429 → marca `rate_limited` com `retryAfterSeconds`; run atual termina;
 *   o próximo disparo continua do último checkpoint.
 * - Em exception inesperada → outcome `erro`.
 */
export async function runInitialImport(
  userId: number,
  opts?: { resumeFromPage?: number },
): Promise<SyncOutcome> {
  // Mata runs zumbis antes de verificar concorrência (evita que processo
  // morto deixe o run em estado 'running' para sempre)
  await killZombieSyncRuns(userId, 'initial_import');

  // Se já existe run em andamento, não inicia outro (idempotência)
  const running = await db
    .select({ id: syncRuns.id, lastCheckpointPage: syncRuns.lastCheckpointPage })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        eq(syncRuns.kind, 'initial_import'),
        eq(syncRuns.outcome, 'running'),
      ),
    )
    .limit(1);

  let runId: number;
  let startPage = opts?.resumeFromPage ?? 1;

  if (running.length > 0) {
    runId = running[0].id;
    startPage = (running[0].lastCheckpointPage ?? 0) + 1;
  } else {
    // Se existe um anterior 'parcial'/'rate_limited' sem sucesso posterior, retoma.
    if (!opts?.resumeFromPage) {
      const lastPartial = await db
        .select({ lastCheckpointPage: syncRuns.lastCheckpointPage })
        .from(syncRuns)
        .where(
          and(
            eq(syncRuns.userId, userId),
            eq(syncRuns.kind, 'initial_import'),
          ),
        )
        .orderBy(asc(syncRuns.startedAt))
        .limit(100); // toma o último grupo pequeno
      const mostRecent = lastPartial.at(-1);
      if (mostRecent?.lastCheckpointPage) {
        startPage = mostRecent.lastCheckpointPage + 1;
      }
    }

    const inserted = await db
      .insert(syncRuns)
      .values({
        userId,
        kind: 'initial_import',
        startedAt: new Date(),
        outcome: 'running',
        lastCheckpointPage: startPage > 1 ? startPage - 1 : null,
      })
      .returning({ id: syncRuns.id });
    runId = inserted[0].id;
  }

  let newCount = 0;
  let conflictCount = 0;

  try {
    // Pega a primeira página uma vez para saber o total (`pagination.items`).
    // Esse valor é guardado em snapshotJson como `{ totalItems, currentPage }` para
    // o componente de progresso renderizar `X de Y` consistentemente (FR-030).
    const firstPage = await fetchCollectionPage(userId, { page: startPage, perPage: PER_PAGE });
    let pageNum = startPage;
    let totalPages = firstPage.pagination.pages;
    const totalItems = firstPage.pagination.items;

    await db
      .update(syncRuns)
      .set({
        snapshotJson: JSON.stringify({ totalItems }),
      })
      .where(eq(syncRuns.id, runId));

    // processPage já atualiza newCount incrementalmente no DB row;
    // local `newCount` fica como hint pra syncRun de erro — ressincronizamos
    // lendo do DB no fim de cada página.
    const readNewCount = async (): Promise<number> => {
      const [row] = await db
        .select({ newCount: syncRuns.newCount })
        .from(syncRuns)
        .where(eq(syncRuns.id, runId))
        .limit(1);
      return Number(row?.newCount ?? 0);
    };

    await processPage(userId, firstPage.releases);
    // Checkpoint após processar a página inicial completamente.
    await db
      .update(syncRuns)
      .set({ lastCheckpointPage: pageNum })
      .where(eq(syncRuns.id, runId));
    newCount = await readNewCount();

    while (pageNum < totalPages) {
      pageNum += 1;
      const page = await fetchCollectionPage(userId, { page: pageNum, perPage: PER_PAGE });
      totalPages = page.pagination.pages;
      await processPage(userId, page.releases);

      // checkpoint após cada página
      await db
        .update(syncRuns)
        .set({ lastCheckpointPage: pageNum })
        .where(eq(syncRuns.id, runId));
      newCount = await readNewCount();
    }

    // Sucesso
    await db
      .update(syncRuns)
      .set({
        outcome: 'ok',
        finishedAt: new Date(),
        lastCheckpointPage: pageNum,
        newCount,
        conflictCount,
      })
      .where(eq(syncRuns.id, runId));

    return { outcome: 'ok', newCount, removedCount: 0, conflictCount };
  } catch (err) {
    // Nos UPDATEs de erro/rate_limited, NÃO setamos `newCount` porque
    // `processPage` já incrementa a coluna no DB a cada release importado.
    // Sobrescrever com a variável local `newCount` (só atualizada ao final
    // de uma página inteira) zeraria o progresso parcial já gravado.
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
      await db
        .update(syncRuns)
        .set({
          outcome: 'rate_limited',
          errorMessage: `Rate limit; retomar em ${err.retryAfterSeconds ?? 60}s`,
          finishedAt: new Date(),
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
      })
      .where(eq(syncRuns.id, runId));
    return { outcome: 'erro', errorMessage: msg };
  }

  async function processPage(userId: number, releases: { id: number; date_added: string }[]) {
    // Otimização crítica para retomada após rate_limited:
    // pré-busca quais discogsIds desta página JÁ foram importados pelo user
    // e pula direto (applyDiscogsUpdate seria idempotente mas faz 1 fetchRelease
    // por release — cada um consome quota que já foi gasta em retomadas anteriores).
    if (releases.length === 0) return;
    const existingRows = await db
      .select({ discogsId: records.discogsId })
      .from(records)
      .where(
        and(
          eq(records.userId, userId),
          inArray(
            records.discogsId,
            releases.map((r) => r.id),
          ),
        ),
      );
    const existingIds = new Set(existingRows.map((r) => r.discogsId));

    for (const rel of releases) {
      if (existingIds.has(rel.id)) continue; // já importado; evita gastar quota
      const full = await fetchRelease(userId, rel.id);
      await applyDiscogsUpdate(userId, full, { isNew: true });
      // incremento parcial em syncRuns — se der rate_limit no próximo release,
      // o progresso até aqui fica refletido.
      await db
        .update(syncRuns)
        .set({ newCount: sql`${syncRuns.newCount} + 1` })
        .where(eq(syncRuns.id, runId));
    }
  }
}
