import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns, tracks, users } from '@/db/schema';

export type SyncRunRow = {
  id: number;
  kind: 'initial_import' | 'daily_auto' | 'manual' | 'reimport_record' | 'audio_features';
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

/** Versão minimalista só para calcular se o badge deve aparecer no header. */
export async function computeBadgeActive(userId: number): Promise<boolean> {
  const snap = await loadStatusSnapshot(userId);
  return snap.badgeActive;
}

/* ============================================================
   005 — Audio features coverage (FR-021, FR-022, US4)
   ============================================================ */

type FieldCoverage = {
  total: number;
  fromSource: number; // valor atual é sugestão externa não-confirmada
  fromManual: number; // DJ marcou como 'manual' (confirmado ou editado)
};

export type AudioFeaturesCoverage = {
  totalTracks: number;
  withBpm: FieldCoverage;
  withKey: FieldCoverage;
  withEnergy: FieldCoverage;
  withMoods: FieldCoverage;
  lastRun: {
    startedAt: Date;
    finishedAt: Date | null;
    tracksUpdated: number;
    outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial';
  } | null;
};

/**
 * Estatísticas agregadas pro painel `/status` do user:
 *  - total de faixas ativas (records.archived=false AND status='active')
 *  - quantas com cada campo de audio features preenchido
 *  - breakdown por source (acousticbrainz vs. manual)
 *  - última execução da rotina (kind='audio_features')
 *
 * Uma query SQL única com agregação condicional. Alvo SC-007: <1s em 3000 discos.
 */
export async function getAudioFeaturesCoverage(userId: number): Promise<AudioFeaturesCoverage> {
  // Query agregada: total + fills + breakdown por source em uma passagem
  const [agg] = await db
    .select({
      totalTracks: sql<number>`COUNT(*)`,
      withBpmTotal: sql<number>`COUNT(${tracks.bpm})`,
      withBpmSource: sql<number>`SUM(CASE WHEN ${tracks.bpm} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'acousticbrainz' THEN 1 ELSE 0 END)`,
      withBpmManual: sql<number>`SUM(CASE WHEN ${tracks.bpm} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'manual' THEN 1 ELSE 0 END)`,
      withKeyTotal: sql<number>`COUNT(${tracks.musicalKey})`,
      withKeySource: sql<number>`SUM(CASE WHEN ${tracks.musicalKey} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'acousticbrainz' THEN 1 ELSE 0 END)`,
      withKeyManual: sql<number>`SUM(CASE WHEN ${tracks.musicalKey} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'manual' THEN 1 ELSE 0 END)`,
      withEnergyTotal: sql<number>`COUNT(${tracks.energy})`,
      withEnergySource: sql<number>`SUM(CASE WHEN ${tracks.energy} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'acousticbrainz' THEN 1 ELSE 0 END)`,
      withEnergyManual: sql<number>`SUM(CASE WHEN ${tracks.energy} IS NOT NULL AND ${tracks.audioFeaturesSource} = 'manual' THEN 1 ELSE 0 END)`,
      withMoodsTotal: sql<number>`SUM(CASE WHEN ${tracks.moods} IS NOT NULL AND ${tracks.moods} <> '[]' THEN 1 ELSE 0 END)`,
      withMoodsSource: sql<number>`SUM(CASE WHEN ${tracks.moods} IS NOT NULL AND ${tracks.moods} <> '[]' AND ${tracks.audioFeaturesSource} = 'acousticbrainz' THEN 1 ELSE 0 END)`,
      withMoodsManual: sql<number>`SUM(CASE WHEN ${tracks.moods} IS NOT NULL AND ${tracks.moods} <> '[]' AND ${tracks.audioFeaturesSource} = 'manual' THEN 1 ELSE 0 END)`,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(
      and(
        eq(records.userId, userId),
        eq(records.archived, false),
        eq(records.status, 'active'),
      ),
    );

  // Última execução da rotina de enriquecimento
  const [lastRun] = await db
    .select({
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      newCount: syncRuns.newCount,
      outcome: syncRuns.outcome,
    })
    .from(syncRuns)
    .where(and(eq(syncRuns.userId, userId), eq(syncRuns.kind, 'audio_features')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return {
    totalTracks: Number(agg?.totalTracks ?? 0),
    withBpm: {
      total: Number(agg?.withBpmTotal ?? 0),
      fromSource: Number(agg?.withBpmSource ?? 0),
      fromManual: Number(agg?.withBpmManual ?? 0),
    },
    withKey: {
      total: Number(agg?.withKeyTotal ?? 0),
      fromSource: Number(agg?.withKeySource ?? 0),
      fromManual: Number(agg?.withKeyManual ?? 0),
    },
    withEnergy: {
      total: Number(agg?.withEnergyTotal ?? 0),
      fromSource: Number(agg?.withEnergySource ?? 0),
      fromManual: Number(agg?.withEnergyManual ?? 0),
    },
    withMoods: {
      total: Number(agg?.withMoodsTotal ?? 0),
      fromSource: Number(agg?.withMoodsSource ?? 0),
      fromManual: Number(agg?.withMoodsManual ?? 0),
    },
    lastRun: lastRun
      ? {
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          tracksUpdated: Number(lastRun.newCount),
          outcome: lastRun.outcome,
        }
      : null,
  };
}
