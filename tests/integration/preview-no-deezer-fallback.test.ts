import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * 008 / T017 — quando Deezer não tem hit (data: []), grava marker '' e
 * retorna deezerUrl=null. 2ª chamada usa cache sem chamar fetch.
 */

describe('008 — sem hit Deezer = marker cache (T017)', () => {
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
        clerkUserId: 'u_preview_no_hit',
        email: 'n@ex.com',
        discogsUsername: 'x',
        discogsTokenEncrypted: 'v1:a:b:c',
        allowlisted: true,
      })
      .returning();
    userId = u.id;
    const [r] = await ctx.db
      .insert(schema.records)
      .values({
        userId,
        discogsId: 200,
        artist: 'Honey B',
        title: 'Obscuro',
        status: 'active',
      })
      .returning();
    recordId = r.id;

    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: vi.fn(async () => ({
        id: userId,
        clerkUserId: 'u_preview_no_hit',
        email: 'n@ex.com',
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

  it('Deezer 0 hits → grava marker "" e retorna deezerUrl=null; cache hit não chama fetch', async () => {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId, position: 'A1', title: 'Obscuro' })
      .returning();

    searchSpy.mockResolvedValueOnce(null);

    const { resolveTrackPreview } = await import('@/lib/actions');
    const first = await resolveTrackPreview({ trackId: t.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data?.deezerUrl).toBeNull();
    expect(first.data?.cached).toBe(false);
    expect(searchSpy).toHaveBeenCalledTimes(1);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.previewUrl).toBe('');
    expect(after.previewUrlCachedAt).toBeInstanceOf(Date);

    const second = await resolveTrackPreview({ trackId: t.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data?.deezerUrl).toBeNull();
    expect(second.data?.cached).toBe(true);
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('Deezer hit sem preview (string vazia) → mesmo marker; cache hit subsequente', async () => {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({ recordId, position: 'B1', title: 'Sem preview' })
      .returning();

    searchSpy.mockResolvedValueOnce({
      previewUrl: null,
      matchedTitle: 'Sem preview',
      matchedArtist: 'Honey B',
    });

    const { resolveTrackPreview } = await import('@/lib/actions');
    const first = await resolveTrackPreview({ trackId: t.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data?.deezerUrl).toBeNull();

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.previewUrl).toBe('');

    await resolveTrackPreview({ trackId: t.id });
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });
});
