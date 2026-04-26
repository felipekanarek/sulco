import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * 008 / T018 — SC-004: resolveTrackPreview NUNCA toca campos AUTHOR.
 * Pré-popula track com curadoria já feita; chama action; asserta que
 * todos os campos AUTHOR continuam intactos.
 */

describe('008 — Princípio I: resolveTrackPreview não toca AUTHOR (T018)', () => {
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
        clerkUserId: 'u_preview_princ_i',
        email: 'pi@ex.com',
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
        discogsId: 300,
        artist: 'Caetano Veloso',
        title: 'Transa',
        status: 'active',
      })
      .returning();
    recordId = r.id;

    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: vi.fn(async () => ({
        id: userId,
        clerkUserId: 'u_preview_princ_i',
        email: 'pi@ex.com',
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

  it('resolveTrackPreview não altera bpm, musicalKey, energy, moods, contexts, comment, audioFeaturesSource etc.', async () => {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'A1',
        title: 'Pulsar',
        selected: true,
        bpm: 120,
        musicalKey: '8A',
        energy: 4,
        rating: 2,
        moods: ['solar', 'denso'],
        contexts: ['festa diurna'],
        fineGenre: 'samba soul',
        references: 'lembra Floating Points',
        comment: 'incrível',
        isBomb: true,
        audioFeaturesSource: 'manual',
      })
      .returning();

    searchSpy.mockResolvedValueOnce({
      previewUrl: 'https://cdnt-preview.dzcdn.net/pulsar.mp3',
      matchedTitle: 'Pulsar',
      matchedArtist: 'Caetano Veloso',
    });

    const { resolveTrackPreview } = await import('@/lib/actions');
    const res = await resolveTrackPreview({ trackId: t.id });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));

    // AUTHOR — TODOS intactos
    expect(after.selected).toBe(true);
    expect(after.bpm).toBe(120);
    expect(after.musicalKey).toBe('8A');
    expect(after.energy).toBe(4);
    expect(after.rating).toBe(2);
    expect(after.moods).toEqual(['solar', 'denso']);
    expect(after.contexts).toEqual(['festa diurna']);
    expect(after.fineGenre).toBe('samba soul');
    expect(after.references).toBe('lembra Floating Points');
    expect(after.comment).toBe('incrível');
    expect(after.isBomb).toBe(true);
    expect(after.audioFeaturesSource).toBe('manual');

    // SYS — só os 2 campos de preview mudam
    expect(after.previewUrl).toBe('https://cdnt-preview.dzcdn.net/pulsar.mp3');
    expect(after.previewUrlCachedAt).toBeInstanceOf(Date);
  });

  it('invalidateTrackPreview também não toca AUTHOR', async () => {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'B1',
        title: 'Nine Out of Ten',
        selected: true,
        bpm: 95,
        moods: ['contemplativo'],
        previewUrl: 'https://x/y.mp3',
        previewUrlCachedAt: new Date(),
      })
      .returning();

    const { invalidateTrackPreview } = await import('@/lib/actions');
    const res = await invalidateTrackPreview({ trackId: t.id });
    expect(res.ok).toBe(true);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.selected).toBe(true);
    expect(after.bpm).toBe(95);
    expect(after.moods).toEqual(['contemplativo']);
    expect(after.previewUrl).toBeNull();
    expect(after.previewUrlCachedAt).toBeNull();
  });
});
