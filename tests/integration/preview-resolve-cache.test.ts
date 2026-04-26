import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * 008 / T016 — cache de previewUrl: resolve grava, hit não chama Deezer,
 * invalidate reseta.
 */

describe('008 — resolveTrackPreview cache (T016)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let userId = 0;
  let recordId = 0;
  const searchSpy = vi.fn();

  beforeEach(async () => {
    ctx = await createTestDb();

    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    vi.doMock('next/server', () => ({ after: (fn: () => void) => fn() }));

    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'u_preview_cache',
        email: 'p@ex.com',
        discogsUsername: 'x',
        discogsTokenEncrypted: 'v1:a:b:c',
        allowlisted: true,
      })
      .returning();
    userId = u.id;
    const [r] = await ctx.db
      .insert(schema.records)
      .values({ userId, discogsId: 100, artist: 'Spoon', title: 'Transference', status: 'active' })
      .returning();
    recordId = r.id;

    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: vi.fn(async () => ({
        id: userId,
        clerkUserId: 'u_preview_cache',
        email: 'p@ex.com',
        discogsUsername: 'x',
        discogsTokenEncrypted: 'v1:a:b:c',
        discogsCredentialStatus: 'valid',
        needsOnboarding: false,
        isOwner: false,
        allowlisted: true,
      })),
    }));

    searchSpy.mockReset();
    vi.doMock('@/lib/preview/deezer', () => ({
      searchTrackPreview: searchSpy,
      DeezerServiceError: class extends Error {},
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('next/cache');
    vi.doUnmock('next/server');
    vi.doUnmock('@/lib/auth');
    vi.doUnmock('@/lib/preview/deezer');
    vi.resetModules();
    ctx.client.close();
  });

  async function seedTrack() {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId, position: 'A1', title: 'Before Destruction' })
      .returning();
    return { trackId: t.id, schema };
  }

  it('cenário 1: cache miss → busca Deezer, persiste URL, retorna cached:false', async () => {
    const { trackId, schema } = await seedTrack();
    searchSpy.mockResolvedValueOnce({
      previewUrl: 'https://cdnt-preview.dzcdn.net/abc.mp3',
      matchedTitle: 'Before Destruction',
      matchedArtist: 'Spoon',
    });

    const { resolveTrackPreview } = await import('@/lib/actions');
    const res = await resolveTrackPreview({ trackId });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.deezerUrl).toBe('https://cdnt-preview.dzcdn.net/abc.mp3');
    expect(res.data?.cached).toBe(false);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith('Spoon', 'Before Destruction');

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.previewUrl).toBe('https://cdnt-preview.dzcdn.net/abc.mp3');
    expect(after.previewUrlCachedAt).toBeInstanceOf(Date);
  });

  it('cenário 2: 2ª chamada (cache hit) NÃO chama Deezer, retorna cached:true', async () => {
    const { trackId } = await seedTrack();
    searchSpy.mockResolvedValueOnce({
      previewUrl: 'https://cdnt-preview.dzcdn.net/abc.mp3',
      matchedTitle: 'X',
      matchedArtist: 'Y',
    });

    const { resolveTrackPreview } = await import('@/lib/actions');
    await resolveTrackPreview({ trackId });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    const second = await resolveTrackPreview({ trackId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data?.deezerUrl).toBe('https://cdnt-preview.dzcdn.net/abc.mp3');
    expect(second.data?.cached).toBe(true);
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('cenário 3: invalidateTrackPreview reseta cache pra NULL', async () => {
    const { trackId, schema } = await seedTrack();
    searchSpy.mockResolvedValueOnce({
      previewUrl: 'https://cdnt-preview.dzcdn.net/abc.mp3',
      matchedTitle: 'X',
      matchedArtist: 'Y',
    });
    const { resolveTrackPreview, invalidateTrackPreview } = await import('@/lib/actions');
    await resolveTrackPreview({ trackId });

    const inv = await invalidateTrackPreview({ trackId });
    expect(inv.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId));
    expect(after.previewUrl).toBeNull();
    expect(after.previewUrlCachedAt).toBeNull();
  });

  it('ownership: chamar com track de outro user retorna error', async () => {
    const schema = await import('@/db/schema');
    const [u2] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'u_other',
        email: 'o@ex.com',
        allowlisted: true,
      })
      .returning();
    const [r2] = await ctx.db
      .insert(schema.records)
      .values({ userId: u2.id, discogsId: 999, artist: 'X', title: 'Y', status: 'active' })
      .returning();
    const [t2] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId: r2.id, position: 'A1', title: 'Other' })
      .returning();

    const { resolveTrackPreview } = await import('@/lib/actions');
    const res = await resolveTrackPreview({ trackId: t2.id });
    expect(res.ok).toBe(false);
    expect(searchSpy).not.toHaveBeenCalled();
  });
});
