import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns, tracks, users } from '@/db/schema';
import { killZombieSyncRuns } from '@/lib/discogs/zombie';

export type SyncRunRow = {
  id: number;
  kind: 'initial_import' | 'daily_auto' | 'manual' | 'reimport_record';
  targetRecordId: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial';
  newCount: number;
  removedCount: number;
  conflictCount: number;
  errorMessage: string | null;
};

export type ArchivedPending = {
  recordId: number;
  artist: string;
  title: string;
  coverUrl: string | null;
  archivedAt: Date | null;
};

export type TrackConflict = {
  trackId: number;
  position: string;
  title: string;
  artist: string;
  recordId: number;
  recordTitle: string;
  conflictDetectedAt: Date | null;
};

export type StatusSnapshot = {
  runs: SyncRunRow[];
  archivedPending: ArchivedPending[];
  trackConflicts: TrackConflict[];
  badgeActive: boolean; // há eventos novos desde a última visita?
  lastStatusVisitAt: Date | null;
  hasRunningSync: boolean; // existe syncRun manual/daily_auto com outcome='running'?
};

/**
 * Carrega tudo que o painel `/status` e o `<SyncBadge>` no header precisam.
 * - `runs`: últimas 20 execuções (FR-040)
 * - `archivedPending`: discos archived sem acknowledge (FR-036)
 * - `trackConflicts`: faixas com conflict=true (FR-037)
 * - `badgeActive`: true se houver qualquer syncRun com outcome!='ok' OR
 *    archived pendente OR conflito criado APÓS lastStatusVisitAt (FR-041)
 */
export async function loadStatusSnapshot(userId: number): Promise<StatusSnapshot> {
  // Bug 8 fix: limpa runs zumbis (running >65s sem progresso) ANTES de
  // ler o snapshot. Assim `hasRunningSync` reflete o estado real e o
  // ManualSyncButton/SyncBadge não trava em "em execução" depois que
  // o processo morreu silenciosamente. Idempotente — 0 rows se nenhum
  // zombie, custo: 1 UPDATE com WHERE indexado.
  await killZombieSyncRuns(userId);

  const [userRow] = await db
    .select({ lastStatusVisitAt: users.lastStatusVisitAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const lastVisit = userRow?.lastStatusVisitAt ?? null;

  const runs = await db
    .select({
      id: syncRuns.id,
      kind: syncRuns.kind,
      targetRecordId: syncRuns.targetRecordId,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      outcome: syncRuns.outcome,
      newCount: syncRuns.newCount,
      removedCount: syncRuns.removedCount,
      conflictCount: syncRuns.conflictCount,
      errorMessage: syncRuns.errorMessage,
    })
    .from(syncRuns)
    .where(eq(syncRuns.userId, userId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(20);

  const archivedPending = await db
    .select({
      recordId: records.id,
      artist: records.artist,
      title: records.title,
      coverUrl: records.coverUrl,
      archivedAt: records.archivedAt,
    })
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, true),
        isNull(records.archivedAcknowledgedAt),
      ),
    )
    .orderBy(desc(records.archivedAt));

  const trackConflicts = await db
    .select({
      trackId: tracks.id,
      position: tracks.position,
      title: tracks.title,
      artist: records.artist,
      recordId: records.id,
      recordTitle: records.title,
      conflictDetectedAt: tracks.conflictDetectedAt,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(records.userId, userId), eq(tracks.conflict, true)))
    .orderBy(desc(tracks.conflictDetectedAt));

  // Badge ativo se há QUALQUER alerta que o DJ ainda não viu após a última visita:
  //   - pelo menos 1 archived pendente mais novo que lastVisit, OU
  //   - pelo menos 1 conflict mais novo que lastVisit, OU
  //   - pelo menos 1 syncRun com outcome!='ok' mais novo que lastVisit, OU
  //   - lastVisit ainda é null E existe QUALQUER item acima
  const afterVisit = (d: Date | null): boolean =>
    d != null && (lastVisit == null || d.getTime() > lastVisit.getTime());

  const badgeActive =
    archivedPending.some((r) => afterVisit(r.archivedAt)) ||
    trackConflicts.some((c) => afterVisit(c.conflictDetectedAt)) ||
    runs.some(
      (r) =>
        r.outcome !== 'ok' &&
        r.outcome !== 'running' &&
        afterVisit(r.startedAt),
    );

  const hasRunningSync = runs.some(
    (r) =>
      r.outcome === 'running' &&
      (r.kind === 'manual' || r.kind === 'daily_auto' || r.kind === 'initial_import'),
  );

  return {
    runs: runs.map((r) => ({
      ...r,
      newCount: Number(r.newCount),
      removedCount: Number(r.removedCount),
      conflictCount: Number(r.conflictCount),
    })),
    archivedPending,
    trackConflicts,
    badgeActive,
    lastStatusVisitAt: lastVisit,
    hasRunningSync,
  };
}

// Inc 23 follow-up (022 / Bug 16): cache REVERTIDO — `StatusSnapshot`
// contém múltiplos `Date | null` (runs, archivedPending, trackConflicts,
// lastStatusVisitAt) e `unstable_cache` serializa via JSON, causando
// `TypeError: getTime is not a function` no consumidor após desserialização.
// `/status` é rota fria (acesso pontual), aceita-se reads diretos.

/** Versão minimalista só para calcular se o badge deve aparecer no header. */
export async function computeBadgeActive(userId: number): Promise<boolean> {
  const snap = await loadStatusSnapshot(userId);
  return snap.badgeActive;
}

