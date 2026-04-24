import 'server-only';

// Orquestrador do enriquecimento de audio features via AcousticBrainz.
// Expõe enrichTrack, enrichRecord, enrichUserBacklog — consumidos pelo
// cron diário (src/app/api/cron/sync-daily) e pelo trigger imediato
// pós-import (src/lib/discogs/apply-update).
// Ver specs/005-acousticbrainz-audio-features/contracts/server-actions.md.

import { and, desc, eq, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { records, syncRuns, tracks } from '@/db/schema';
import { compareTrackPositions } from '@/lib/queries/curadoria';
import { fetchAudioFeatures, type AudioFeatures } from './acousticbrainz';
import { fetchReleaseRecordings, searchReleaseByDiscogsId, type MBRecordingRef } from './musicbrainz';
import { markTrackSyncAttempt, writeEnrichment } from './write';

const RETRY_WINDOW_DAYS = 30;
const RETRY_WINDOW_SECONDS = RETRY_WINDOW_DAYS * 24 * 60 * 60;
const SOURCE_NAME = 'acousticbrainz' as const;

export type EnrichOutcome =
  | { outcome: 'updated'; fields: Array<'bpm' | 'musicalKey' | 'energy' | 'moods'> }
  | { outcome: 'skipped'; reason: 'manual' | 'no_mbid' | 'no_ab_data' | 'recently_tried' | 'not_found' }
  | { outcome: 'error'; message: string };

export type RecordEnrichSummary = {
  recordId: number;
  mbidsResolved: number;
  tracksUpdated: number;
  tracksSkipped: number;
  tracksErrored: number;
};

export type BacklogOpts = {
  maxRecords?: number;
  maxDurationMs?: number;
};

export type BacklogRunSummary = {
  recordsProcessed: number;
  tracksUpdated: number;
  tracksSkipped: number;
  errors: number;
  durationMs: number;
};

type TrackRow = {
  id: number;
  recordId: number;
  position: string;
  title: string;
  mbid: string | null;
  audioFeaturesSource: 'acousticbrainz' | 'manual' | null;
  audioFeaturesSyncedAt: Date | null;
};

/**
 * Seleciona o MBID de recording que bate com a posição do track Sulco.
 * Usa `compareTrackPositions` pro match tolerante a variações
 * ("A1" vs "1A", etc).
 */
function matchRecordingMbid(
  sulcoPosition: string,
  mbRefs: MBRecordingRef[],
): string | null {
  for (const ref of mbRefs) {
    if (compareTrackPositions(sulcoPosition, ref.position) === 0) {
      return ref.recordingMbid;
    }
  }
  return null;
}

function diffUpdatedFields(track: TrackRow, feats: AudioFeatures): Array<'bpm' | 'musicalKey' | 'energy' | 'moods'> {
  // Estima quais campos foram gravados com base no estado atual (null-guard).
  // Não é 100% exato (race com edição paralela poderia distorcer), mas
  // suficiente pro retorno informativo.
  const updated: Array<'bpm' | 'musicalKey' | 'energy' | 'moods'> = [];
  if (feats.bpm != null) updated.push('bpm');
  if (feats.camelot != null) updated.push('musicalKey');
  if (feats.energy != null) updated.push('energy');
  if (feats.moods.length > 0) updated.push('moods');
  return updated;
}

/**
 * Enriquece UMA faixa. Assume que `trackId` pertence ao `userId`
 * (chamador valida — aqui confiamos no contrato).
 */
export async function enrichTrack(userId: number, trackId: number): Promise<EnrichOutcome> {
  const rows = await db
    .select({
      id: tracks.id,
      recordId: tracks.recordId,
      position: tracks.position,
      title: tracks.title,
      mbid: tracks.mbid,
      audioFeaturesSource: tracks.audioFeaturesSource,
      audioFeaturesSyncedAt: tracks.audioFeaturesSyncedAt,
      discogsId: records.discogsId,
      recordArchived: records.archived,
      recordStatus: records.status,
    })
    .from(tracks)
    .innerJoin(records, eq(records.id, tracks.recordId))
    .where(and(eq(tracks.id, trackId), eq(records.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return { outcome: 'skipped', reason: 'not_found' };
  if (row.audioFeaturesSource === 'manual') return { outcome: 'skipped', reason: 'manual' };
  if (row.audioFeaturesSource === 'acousticbrainz') {
    // já resolvida — não re-tenta
    return { outcome: 'skipped', reason: 'recently_tried' };
  }

  // Resolver MBID se ainda não temos
  let mbid = row.mbid;
  if (!mbid) {
    try {
      const mbReleaseId = await searchReleaseByDiscogsId(row.discogsId);
      if (!mbReleaseId) {
        await markTrackSyncAttempt(row.id, null);
        return { outcome: 'skipped', reason: 'no_mbid' };
      }
      const refs = await fetchReleaseRecordings(mbReleaseId);
      mbid = matchRecordingMbid(row.position, refs);
      if (!mbid) {
        await markTrackSyncAttempt(row.id, null);
        return { outcome: 'skipped', reason: 'no_mbid' };
      }
    } catch (err) {
      return { outcome: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  // Buscar audio features
  let feats: AudioFeatures | null;
  try {
    feats = await fetchAudioFeatures(mbid);
  } catch (err) {
    return { outcome: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  if (!feats) {
    await markTrackSyncAttempt(row.id, mbid);
    return { outcome: 'skipped', reason: 'no_ab_data' };
  }

  const wrote = await writeEnrichment(row.id, {
    mbid,
    bpm: feats.bpm,
    camelot: feats.camelot,
    energy: feats.energy,
    moods: feats.moods,
    source: SOURCE_NAME,
  });
  if (!wrote) {
    // Race: DJ editou entre a leitura e a escrita → virou 'manual'.
    return { outcome: 'skipped', reason: 'manual' };
  }
  return {
    outcome: 'updated',
    fields: diffUpdatedFields(
      {
        id: row.id,
        recordId: row.recordId,
        position: row.position,
        title: row.title,
        mbid: row.mbid,
        audioFeaturesSource: row.audioFeaturesSource,
        audioFeaturesSyncedAt: row.audioFeaturesSyncedAt,
      },
      feats,
    ),
  };
}

/**
 * Enriquece TODAS as faixas elegíveis de um disco. Faz 1 chamada
 * MB (search + fetch recordings) pro disco inteiro, depois itera
 * em AB por faixa.
 */
export async function enrichRecord(userId: number, recordId: number): Promise<RecordEnrichSummary> {
  const summary: RecordEnrichSummary = {
    recordId,
    mbidsResolved: 0,
    tracksUpdated: 0,
    tracksSkipped: 0,
    tracksErrored: 0,
  };

  const recRows = await db
    .select({
      id: records.id,
      discogsId: records.discogsId,
      archived: records.archived,
      status: records.status,
    })
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)))
    .limit(1);

  const rec = recRows[0];
  if (!rec) return summary;
  // 005 FR-016: pula só archived (spec não exige filtro de status).
  // Discos 'unrated' também são elegíveis pra entregar sugestão na
  // triagem, que é onde o DJ mais precisa (insight da sessão dev
  // 2026-04-24 smoke test).
  if (rec.archived) return summary;

  // Faixas elegíveis: source IS NULL E (nunca tentou OU tentou há >30 dias)
  const cutoff = Math.floor(Date.now() / 1000) - RETRY_WINDOW_SECONDS;
  const eligible = await db
    .select({
      id: tracks.id,
      position: tracks.position,
      title: tracks.title,
      mbid: tracks.mbid,
    })
    .from(tracks)
    .where(
      and(
        eq(tracks.recordId, recordId),
        isNull(tracks.audioFeaturesSource),
        or(
          isNull(tracks.audioFeaturesSyncedAt),
          lt(tracks.audioFeaturesSyncedAt, new Date(cutoff * 1000)),
        ),
      ),
    );

  if (eligible.length === 0) return summary;

  // Resolver MB release uma vez por disco
  let mbRefs: MBRecordingRef[] = [];
  let mbSearchFailed = false;
  try {
    const mbReleaseId = await searchReleaseByDiscogsId(rec.discogsId);
    if (mbReleaseId) {
      mbRefs = await fetchReleaseRecordings(mbReleaseId);
    }
  } catch (err) {
    mbSearchFailed = true;
    console.warn('[enrichRecord] MB failed', { recordId, err: err instanceof Error ? err.message : err });
  }

  for (const track of eligible) {
    // Se MB falhou geral, marca attempt e segue
    if (mbSearchFailed) {
      summary.tracksErrored += 1;
      continue;
    }
    let mbid = track.mbid;
    if (!mbid) {
      mbid = matchRecordingMbid(track.position, mbRefs);
      if (!mbid) {
        await markTrackSyncAttempt(track.id, null);
        summary.tracksSkipped += 1;
        continue;
      }
    }
    summary.mbidsResolved += 1;

    let feats: AudioFeatures | null = null;
    try {
      feats = await fetchAudioFeatures(mbid);
    } catch (err) {
      summary.tracksErrored += 1;
      console.warn('[enrichRecord] AB failed', { trackId: track.id, err: err instanceof Error ? err.message : err });
      continue;
    }

    if (!feats) {
      await markTrackSyncAttempt(track.id, mbid);
      summary.tracksSkipped += 1;
      continue;
    }

    const wrote = await writeEnrichment(track.id, {
      mbid,
      bpm: feats.bpm,
      camelot: feats.camelot,
      energy: feats.energy,
      moods: feats.moods,
      source: SOURCE_NAME,
    });
    if (wrote) summary.tracksUpdated += 1;
    else summary.tracksSkipped += 1;
  }

  return summary;
}

/**
 * Processa backlog de um user. Chamado pelo cron diário.
 * Registra execução em `syncRuns` com kind='audio_features'.
 */
export async function enrichUserBacklog(userId: number, opts: BacklogOpts = {}): Promise<BacklogRunSummary> {
  const startedAt = new Date();
  const startMs = Date.now();
  const maxDurationMs = opts.maxDurationMs ?? 15 * 60 * 1000;
  const maxRecords = opts.maxRecords ?? Number.POSITIVE_INFINITY;

  const insertResult = await db
    .insert(syncRuns)
    .values({ userId, kind: 'audio_features', startedAt, outcome: 'running' })
    .returning({ id: syncRuns.id });
  const runId = insertResult[0].id;

  const summary: BacklogRunSummary = {
    recordsProcessed: 0,
    tracksUpdated: 0,
    tracksSkipped: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    // Discos elegíveis: não arquivados, com ao menos 1 track elegível.
    // FR-016: spec só exige pular archived. Status 'unrated'/'discarded'
    // entram — valor principal da feature é ajudar na triagem.
    // Ordenação: 'active' primeiro (DJ já marcou pra curar); depois
    // 'unrated' (maioria do acervo); 'discarded' por último.
    const cutoff = Math.floor(Date.now() / 1000) - RETRY_WINDOW_SECONDS;
    const eligibleRecords = await db
      .selectDistinct({
        id: records.id,
        status: records.status,
      })
      .from(records)
      .innerJoin(tracks, eq(tracks.recordId, records.id))
      .where(
        and(
          eq(records.userId, userId),
          eq(records.archived, false),
          isNull(tracks.audioFeaturesSource),
          or(
            isNull(tracks.audioFeaturesSyncedAt),
            lt(tracks.audioFeaturesSyncedAt, new Date(cutoff * 1000)),
          ),
        ),
      )
      .orderBy(
        desc(
          sql`CASE ${records.status}
                WHEN 'active'    THEN 2
                WHEN 'unrated'   THEN 1
                WHEN 'discarded' THEN 0
                ELSE 0
              END`,
        ),
      );

    for (const rec of eligibleRecords) {
      if (summary.recordsProcessed >= maxRecords) break;
      if (Date.now() - startMs >= maxDurationMs) break;

      try {
        const recSummary = await enrichRecord(userId, rec.id);
        summary.tracksUpdated += recSummary.tracksUpdated;
        summary.tracksSkipped += recSummary.tracksSkipped;
        summary.errors += recSummary.tracksErrored;
      } catch (err) {
        summary.errors += 1;
        console.warn('[enrichUserBacklog] record failed', { recordId: rec.id, err });
      }
      summary.recordsProcessed += 1;
    }

    summary.durationMs = Date.now() - startMs;

    await db
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        outcome: summary.errors > 0 && summary.tracksUpdated === 0 ? 'erro' : 'ok',
        newCount: summary.tracksUpdated,
        conflictCount: summary.tracksSkipped,
        errorMessage: summary.errors > 0 ? `${summary.errors} failures during run` : null,
      })
      .where(eq(syncRuns.id, runId));

    return summary;
  } catch (err) {
    summary.durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), outcome: 'erro', errorMessage: message })
      .where(eq(syncRuns.id, runId));
    throw err;
  }
}
