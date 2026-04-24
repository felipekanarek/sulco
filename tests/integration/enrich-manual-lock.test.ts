import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * T025 — FR-006b + FR-012 + FR-013.
 *
 * Edição manual dos 4 campos de audio features move `audioFeaturesSource`
 * pra 'manual' e trava o bloco inteiro contra novas sugestões:
 *   (a) Edita com valor novo: bpm 120→121
 *   (b) Edita pro mesmo valor sugerido: bpm 120→120
 *   (c) Limpa campo sugerido: `{ bpm: null }`
 */

describe('T025 — manual lock (FR-006b + FR-013)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let userId = 0;
  let recordId = 0;

  beforeEach(async () => {
    ctx = await createTestDb();

    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));

    // Seed user + record
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'u_t025',
        email: 'e@example.com',
        discogsUsername: 'x',
        discogsTokenEncrypted: 'v1:a:b:c',
      })
      .returning();
    userId = u.id;
    const [r] = await ctx.db
      .insert(schema.records)
      .values({ userId, discogsId: 42, artist: 'X', title: 'Y', status: 'active' })
      .returning();
    recordId = r.id;

    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: vi.fn(async () => ({
        id: userId,
        clerkUserId: 'u_t025',
        email: 'e@example.com',
        discogsUsername: 'x',
        discogsTokenEncrypted: 'v1:a:b:c',
        discogsCredentialStatus: 'valid',
        needsOnboarding: false,
        isOwner: false,
        allowlisted: true,
      })),
    }));

    // Mocka clientes externos pra enrich NÃO bater na rede
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: vi.fn(async () => 'mb-release'),
      fetchReleaseRecordings: vi.fn(async () => [
        { position: 'A1', title: 'x', recordingMbid: 'mbid-locked' },
      ]),
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: vi.fn(async () => ({
        bpm: 130, camelot: '9B', energy: 5, moods: ['aggressive'],
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('next/cache');
    vi.doUnmock('@/lib/auth');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  async function seedTrackWithSuggestion(
    partial: Record<string, unknown> = {},
  ) {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'A1',
        title: 'Suggested',
        selected: true,
        bpm: 120,
        musicalKey: '8A',
        energy: 3,
        moods: ['happy'],
        audioFeaturesSource: 'acousticbrainz',
        ...partial,
      })
      .returning();
    return { trackId: t.id, schema };
  }

  it('(a) edita bpm com valor novo → source=manual + bloco trancado', async () => {
    const { trackId, schema } = await seedTrackWithSuggestion();

    const { updateTrackCuration } = await import('@/lib/actions');
    const res = await updateTrackCuration({ trackId, recordId, bpm: 121 });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.bpm).toBe(121);
    expect(after.audioFeaturesSource).toBe('manual');

    // Enrich depois não muda nada (bloco trancado)
    const { enrichTrack } = await import('@/lib/acousticbrainz');
    const enrichRes = await enrichTrack(userId, trackId);
    expect(enrichRes.outcome).toBe('skipped');

    const [afterEnrich] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(afterEnrich.bpm).toBe(121);
    expect(afterEnrich.musicalKey).toBe('8A');
    expect(afterEnrich.energy).toBe(3);
    expect(afterEnrich.moods).toEqual(['happy']);
  });

  it('(b) edita pro mesmo valor sugerido → ainda vira manual', async () => {
    const { trackId, schema } = await seedTrackWithSuggestion();

    const { updateTrackCuration } = await import('@/lib/actions');
    const res = await updateTrackCuration({ trackId, recordId, bpm: 120 });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.bpm).toBe(120);
    expect(after.audioFeaturesSource).toBe('manual');
  });

  it('(c) limpar campo sugerido (bpm=null) → manual + bpm vazio + outros 3 preservados', async () => {
    const { trackId, schema } = await seedTrackWithSuggestion();

    const { updateTrackCuration } = await import('@/lib/actions');
    const res = await updateTrackCuration({ trackId, recordId, bpm: null });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.bpm).toBeNull();
    expect(after.audioFeaturesSource).toBe('manual');
    // Outros 3 campos não foram tocados
    expect(after.musicalKey).toBe('8A');
    expect(after.energy).toBe(3);
    expect(after.moods).toEqual(['happy']);

    // Enrich não reativa sugestão (source=manual trava)
    const { enrichTrack } = await import('@/lib/acousticbrainz');
    await enrichTrack(userId, trackId);
    const [afterEnrich] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(afterEnrich.bpm).toBeNull();
    expect(afterEnrich.audioFeaturesSource).toBe('manual');
  });

  it('edição em campo NÃO-audio-features (ex. comment) não mexe em audioFeaturesSource', async () => {
    const { trackId, schema } = await seedTrackWithSuggestion();

    const { updateTrackCuration } = await import('@/lib/actions');
    const res = await updateTrackCuration({ trackId, recordId, comment: 'nota nova' });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.comment).toBe('nota nova');
    // Source permanece 'acousticbrainz' (comment não é campo de audio feature)
    expect(after.audioFeaturesSource).toBe('acousticbrainz');
  });
});
