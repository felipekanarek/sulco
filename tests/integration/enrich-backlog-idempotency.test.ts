import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * T028 / FR-015 — query de elegibilidade exclui faixas com tentativa
 * recente (<30 dias). Re-execução do backlog NÃO re-tenta faixas que
 * já foram marcadas com `audio_features_synced_at` recente.
 */

describe('T028 — backlog idempotency (FR-015)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  const mbSearch = vi.fn(async () => 'mb-release');
  const mbRecordings = vi.fn(async () => [
    { position: 'A1', title: 'x', recordingMbid: 'mbid-1' },
  ]);
  const abFetch = vi.fn(async () => ({
    bpm: 100,
    camelot: '5A',
    energy: 2,
    moods: [],
  }));

  beforeEach(async () => {
    ctx = await createTestDb();
    mbSearch.mockClear();
    mbRecordings.mockClear();
    abFetch.mockClear();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: mbSearch,
      fetchReleaseRecordings: mbRecordings,
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: abFetch,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  async function seed() {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u_t028', email: 'e@e' })
      .returning();
    const [r] = await ctx.db
      .insert(schema.records)
      .values({ userId: u.id, discogsId: 1, artist: 'X', title: 'Y', status: 'active' })
      .returning();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r.id, position: 'A1', title: 'T' })
      .returning();
    return { userId: u.id, recordId: r.id, trackId: t.id, schema };
  }

  it('faixa tentada há 5 dias NÃO é re-consultada (<30 dias cutoff)', async () => {
    const { userId, trackId, schema } = await seed();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await ctx.db
      .update(schema.tracks)
      .set({ audioFeaturesSyncedAt: fiveDaysAgo })
      .where(eq(schema.tracks.id, trackId));

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');
    const summary = await enrichUserBacklog(userId);

    expect(summary.recordsProcessed).toBe(0);
    // MB não foi chamado pq a query de elegibilidade filtrou a track
    expect(mbSearch).not.toHaveBeenCalled();
    expect(abFetch).not.toHaveBeenCalled();
  });

  it('faixa tentada há 40 dias É re-consultada (>30 dias)', async () => {
    const { userId, trackId, schema } = await seed();
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await ctx.db
      .update(schema.tracks)
      .set({ audioFeaturesSyncedAt: fortyDaysAgo })
      .where(eq(schema.tracks.id, trackId));

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');
    const summary = await enrichUserBacklog(userId);

    expect(summary.recordsProcessed).toBe(1);
    expect(mbSearch).toHaveBeenCalled();
  });

  it('faixa já enriquecida (source=acousticbrainz) NÃO é re-consultada mesmo se antiga', async () => {
    const { userId, trackId, schema } = await seed();
    await ctx.db
      .update(schema.tracks)
      .set({
        audioFeaturesSource: 'acousticbrainz',
        audioFeaturesSyncedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        bpm: 100,
      })
      .where(eq(schema.tracks.id, trackId));

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');
    const summary = await enrichUserBacklog(userId);

    expect(summary.recordsProcessed).toBe(0);
    expect(mbSearch).not.toHaveBeenCalled();
  });

  it('segunda execução do backlog sobre acervo fresh skippa faixas já tentadas', async () => {
    const { userId } = await seed();

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');

    // Primeira rodada: faixa elegível, AB retorna, fica com source='acousticbrainz'
    const first = await enrichUserBacklog(userId);
    expect(first.tracksUpdated).toBe(1);
    expect(mbSearch).toHaveBeenCalledTimes(1);
    expect(abFetch).toHaveBeenCalledTimes(1);

    // Segunda rodada: nada mais pra fazer, mocks não são chamados de novo
    const second = await enrichUserBacklog(userId);
    expect(second.recordsProcessed).toBe(0);
    expect(mbSearch).toHaveBeenCalledTimes(1);
    expect(abFetch).toHaveBeenCalledTimes(1);
  });
});
