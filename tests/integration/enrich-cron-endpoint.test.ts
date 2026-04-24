import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * T030 — Full loop: POST /api/cron/sync-daily com CRON_SECRET válido
 * faz tracks sem `audioFeaturesSyncedAt` receberem valor na DB.
 *
 * Confirma que o cron integra corretamente com `enrichUserBacklog` e
 * que a cadeia de escrita chega até a tabela `tracks`.
 */

describe('T030 — cron endpoint dispara enriquecimento end-to-end', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    process.env.CRON_SECRET = 'supersecret';
    ctx = await createTestDb();

    vi.doMock('@/db', () => ({ db: ctx.db }));

    // Sync Discogs stub — não é foco deste teste
    vi.doMock('@/lib/discogs/sync', () => ({
      runDailyAutoSync: vi.fn(async () => ({ outcome: 'ok' })),
    }));

    // Enrich clients determinísticos
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: vi.fn(async () => 'mb-release'),
      fetchReleaseRecordings: vi.fn(async () => [
        { position: 'A1', title: 'x', recordingMbid: 'mbid-end2end' },
      ]),
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: vi.fn(async () => ({
        bpm: 128,
        camelot: '7A',
        energy: 4,
        moods: ['electronic'],
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/discogs/sync');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
    if (ORIGINAL_ENV === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('POST com bearer válido + user com track fresh → track recebe audio features', async () => {
    const schema = await import('@/db/schema');

    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'u_t030',
        email: 'e@e',
        discogsUsername: 'felipe',
        discogsTokenEncrypted: 'v1:a:b:c',
        discogsCredentialStatus: 'valid',
      })
      .returning();
    const [r] = await ctx.db
      .insert(schema.records)
      .values({ userId: u.id, discogsId: 9001, artist: 'X', title: 'Y', status: 'active' })
      .returning();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r.id, position: 'A1', title: 'Fresh' })
      .returning();

    // Pré-condição
    const [before] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(before.audioFeaturesSource).toBeNull();
    expect(before.audioFeaturesSyncedAt).toBeNull();
    expect(before.bpm).toBeNull();

    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', {
      method: 'POST',
      headers: { authorization: 'Bearer supersecret' },
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrich.tracksUpdated).toBe(1);

    // Pós-condição: track enriquecida
    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.audioFeaturesSource).toBe('acousticbrainz');
    expect(after.bpm).toBe(128);
    expect(after.musicalKey).toBe('7A');
    expect(after.energy).toBe(4);
    expect(after.moods).toEqual(['electronic']);
    expect(after.mbid).toBe('mbid-end2end');
    expect(after.audioFeaturesSyncedAt).toBeInstanceOf(Date);
  });

  it('POST sem bearer → 401 e tracks intactas', async () => {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'u_t030b',
        email: 'e@e',
        discogsUsername: 'felipe',
        discogsTokenEncrypted: 'v1:a:b:c',
      })
      .returning();
    const [r] = await ctx.db
      .insert(schema.records)
      .values({ userId: u.id, discogsId: 9002, artist: 'A', title: 'B', status: 'active' })
      .returning();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r.id, position: 'A1', title: 'T' })
      .returning();

    const { POST } = await import('@/app/api/cron/sync-daily/route');
    const req = new Request('http://localhost/api/cron/sync-daily', { method: 'POST' });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(401);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.audioFeaturesSource).toBeNull();
    expect(after.bpm).toBeNull();
  });
});
