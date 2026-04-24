import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';

/**
 * T033 — FR-021 + FR-022.
 * `getAudioFeaturesCoverage(userId)` retorna agregados corretos:
 *  - total de faixas ativas
 *  - contagem por campo (bpm/key/energy/moods)
 *  - breakdown por source (acousticbrainz vs. manual)
 *  - última execução da rotina (kind='audio_features')
 */

describe('T033 — getAudioFeaturesCoverage', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.resetModules();
    ctx.client.close();
  });

  async function seed() {
    const schema = await import('@/db/schema');

    const [u1] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u_t033', email: 'felipe@e.com' })
      .returning();
    const [u2] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u_t033_other', email: 'outro@e.com' })
      .returning();

    // record ativo
    const [r1] = await ctx.db
      .insert(schema.records)
      .values({ userId: u1.id, discogsId: 1, artist: 'X', title: 'A', status: 'active' })
      .returning();

    // record arquivado — tracks dele NÃO devem entrar no agg
    const [rArch] = await ctx.db
      .insert(schema.records)
      .values({
        userId: u1.id,
        discogsId: 99,
        artist: 'X',
        title: 'Arch',
        status: 'active',
        archived: true,
      })
      .returning();

    // record de outro user — nunca entra no agg de u1
    const [rOther] = await ctx.db
      .insert(schema.records)
      .values({ userId: u2.id, discogsId: 2, artist: 'Y', title: 'B', status: 'active' })
      .returning();

    // 5 faixas ativas de u1:
    //  t1 → source=acousticbrainz, bpm+key+energy+moods preenchidos
    //  t2 → source=acousticbrainz, só bpm preenchido (key/energy/moods null)
    //  t3 → source=manual, bpm+moods preenchidos
    //  t4 → source=null, bpm preenchido (legado que escapou do backfill)
    //  t5 → source=null, nada preenchido (fresh)
    await ctx.db.insert(schema.tracks).values([
      {
        recordId: r1.id,
        position: 'A1',
        title: 't1',
        bpm: 120,
        musicalKey: '8A',
        energy: 3,
        moods: ['happy'],
        audioFeaturesSource: 'acousticbrainz',
      },
      {
        recordId: r1.id,
        position: 'A2',
        title: 't2',
        bpm: 130,
        audioFeaturesSource: 'acousticbrainz',
      },
      {
        recordId: r1.id,
        position: 'A3',
        title: 't3',
        bpm: 140,
        moods: ['party'],
        audioFeaturesSource: 'manual',
      },
      { recordId: r1.id, position: 'A4', title: 't4', bpm: 90 },
      { recordId: r1.id, position: 'A5', title: 't5' },
    ]);

    // 1 track arquivada (não conta)
    await ctx.db
      .insert(schema.tracks)
      .values({
        recordId: rArch.id,
        position: 'A1',
        title: 'ignore',
        bpm: 200,
        audioFeaturesSource: 'manual',
      });

    // 1 track de outro user (não conta)
    await ctx.db
      .insert(schema.tracks)
      .values({
        recordId: rOther.id,
        position: 'A1',
        title: 'foreign',
        bpm: 200,
        audioFeaturesSource: 'acousticbrainz',
      });

    // Última run de audio_features
    await ctx.db.insert(schema.syncRuns).values([
      {
        userId: u1.id,
        kind: 'audio_features',
        startedAt: new Date('2026-04-20T10:00:00Z'),
        finishedAt: new Date('2026-04-20T10:05:00Z'),
        outcome: 'ok',
        newCount: 42,
      },
      // Run antiga — não deve aparecer como "última"
      {
        userId: u1.id,
        kind: 'audio_features',
        startedAt: new Date('2026-04-15T10:00:00Z'),
        finishedAt: new Date('2026-04-15T10:05:00Z'),
        outcome: 'ok',
        newCount: 10,
      },
    ]);

    return { u1, u2 };
  }

  it('agrega corretamente por campo e por source', async () => {
    const { u1 } = await seed();

    const { getAudioFeaturesCoverage } = await import('@/lib/queries/status');
    const cov = await getAudioFeaturesCoverage(u1.id);

    // 5 tracks ativas do u1 (a arquivada + a de u2 ficam fora)
    expect(cov.totalTracks).toBe(5);

    // BPM: t1, t2, t3, t4 preenchidos (4 total)
    //   fromSource: t1, t2 (acousticbrainz) = 2
    //   fromManual: t3 = 1
    //   (t4 tem bpm mas source=null → não entra em nenhum breakdown, mas conta em total)
    expect(cov.withBpm.total).toBe(4);
    expect(cov.withBpm.fromSource).toBe(2);
    expect(cov.withBpm.fromManual).toBe(1);

    // Key: só t1
    expect(cov.withKey.total).toBe(1);
    expect(cov.withKey.fromSource).toBe(1);
    expect(cov.withKey.fromManual).toBe(0);

    // Energy: só t1
    expect(cov.withEnergy.total).toBe(1);
    expect(cov.withEnergy.fromSource).toBe(1);

    // Moods: t1 + t3
    expect(cov.withMoods.total).toBe(2);
    expect(cov.withMoods.fromSource).toBe(1);
    expect(cov.withMoods.fromManual).toBe(1);
  });

  it('retorna última execução de audio_features (mais recente)', async () => {
    const { u1 } = await seed();

    const { getAudioFeaturesCoverage } = await import('@/lib/queries/status');
    const cov = await getAudioFeaturesCoverage(u1.id);

    expect(cov.lastRun).not.toBeNull();
    expect(cov.lastRun?.tracksUpdated).toBe(42);
    expect(cov.lastRun?.outcome).toBe('ok');
    expect(cov.lastRun?.startedAt.toISOString()).toBe('2026-04-20T10:00:00.000Z');
  });

  it('user sem execuções retorna lastRun=null', async () => {
    const { u2 } = await seed();

    const { getAudioFeaturesCoverage } = await import('@/lib/queries/status');
    const cov = await getAudioFeaturesCoverage(u2.id);

    expect(cov.lastRun).toBeNull();
    // u2 só tem 1 track ativa
    expect(cov.totalTracks).toBe(1);
  });

  it('user sem tracks retorna zeros sem erro', async () => {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'empty', email: 'e@e' })
      .returning();

    const { getAudioFeaturesCoverage } = await import('@/lib/queries/status');
    const cov = await getAudioFeaturesCoverage(u.id);

    expect(cov.totalTracks).toBe(0);
    expect(cov.withBpm).toEqual({ total: 0, fromSource: 0, fromManual: 0 });
    expect(cov.withKey.total).toBe(0);
    expect(cov.lastRun).toBeNull();
  });
});
