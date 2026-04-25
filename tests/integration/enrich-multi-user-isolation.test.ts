import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * T021 / SC-008 — Enriquecimento de um user NÃO toca faixas de outro
 * user, mesmo quando ambos têm a mesma release Discogs no acervo.
 */

describe('T021 — multi-user isolation (SC-008)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: vi.fn(async () => 'mb-release-shared'),
      fetchReleaseRecordings: vi.fn(async () => [
        { position: 'A1', title: 'Shared', recordingMbid: 'mbid-shared' },
      ]),
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: vi.fn(async () => ({
        bpm: 125,
        camelot: '7B',
        energy: 4,
        moods: ['party'],
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  it('enrichUserBacklog(user1) não afeta tracks do user2 (mesma discogsId)', async () => {
    const schema = await import('@/db/schema');

    const [u1] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u1', email: 'u1@example.com' })
      .returning();
    const [u2] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u2', email: 'u2@example.com' })
      .returning();

    const [r1] = await ctx.db
      .insert(schema.records)
      .values({ userId: u1.id, discogsId: 55555, artist: 'X', title: 'Y', status: 'active' })
      .returning();
    const [r2] = await ctx.db
      .insert(schema.records)
      .values({ userId: u2.id, discogsId: 55555, artist: 'X', title: 'Y', status: 'active' })
      .returning();

    const [t1] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r1.id, position: 'A1', title: 'Same' })
      .returning();
    const [t2] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r2.id, position: 'A1', title: 'Same' })
      .returning();

    const { enrichRecord } = await import('@/lib/acousticbrainz');
    const summary = await enrichRecord(u1.id, r1.id);

    expect(summary.tracksUpdated).toBe(1);

    const [afterT1] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t1.id));
    const [afterT2] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t2.id));

    // User1 enriquecido
    expect(afterT1.audioFeaturesSource).toBe('acousticbrainz');
    expect(afterT1.bpm).toBe(125);
    expect(afterT1.mbid).toBe('mbid-shared');

    // User2 intacto — ownership check via records.user_id
    expect(afterT2.audioFeaturesSource).toBeNull();
    expect(afterT2.bpm).toBeNull();
    expect(afterT2.musicalKey).toBeNull();
    expect(afterT2.mbid).toBeNull();
    expect(afterT2.audioFeaturesSyncedAt).toBeNull();
  });

  it('enrichTrack bloqueia trackId de outro user (ownership check)', async () => {
    const schema = await import('@/db/schema');

    const [u1] = await ctx.db.insert(schema.users).values({ clerkUserId: 'u1', email: 'u1@e' }).returning();
    const [u2] = await ctx.db.insert(schema.users).values({ clerkUserId: 'u2', email: 'u2@e' }).returning();
    const [r2] = await ctx.db
      .insert(schema.records)
      .values({ userId: u2.id, discogsId: 7777, artist: 'A', title: 'B', status: 'active' })
      .returning();
    const [t2] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r2.id, position: 'A1', title: 'x' })
      .returning();

    const { enrichTrack } = await import('@/lib/acousticbrainz');
    const result = await enrichTrack(u1.id, t2.id);

    expect(result.outcome).toBe('skipped');
    if (result.outcome === 'skipped') expect(result.reason).toBe('not_found');

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t2.id));
    expect(after.audioFeaturesSource).toBeNull();
    expect(after.bpm).toBeNull();
  });
});
