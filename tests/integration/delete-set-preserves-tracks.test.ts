/**
 * Inc 37 (034) Tier 1 — `deleteSet` (Inc 30) preserva tracks/records.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/auth → fixture user via vi.doMock (Q2 clarification)
 * - next/cache → revalidatePath no-op
 *
 * Princípio coberto: I (curadoria de tracks preservada) + IV
 * (delete físico só do set, FK CASCADE só toca set_tracks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('deleteSet (Inc 30) — Tier 1 ownership + preservation', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let seed: Awaited<ReturnType<typeof seedCollectionFixture>>;

  async function mockAuthAs(userId: number) {
    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: async () => ({
        id: userId,
        clerkUserId: userId === seed.u1 ? 'user_test_owner' : 'user_test_other',
        email: 'test@example.com',
        discogsUsername: 'test',
        needsOnboarding: false,
        importAcknowledgedAt: new Date(),
      }),
      getCurrentUser: async () => ({ id: userId }),
    }));
  }

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
      unstable_cache: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
    }));
    vi.doMock('@/lib/cache', () => ({
      cacheUser: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
      revalidateUserCache: vi.fn(),
    }));
    seed = await seedCollectionFixture(ctx.db);
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/auth');
    vi.doUnmock('next/cache');
    vi.doUnmock('@/lib/cache');
    vi.resetModules();
    ctx.client.close();
  });

  it('caminho feliz: deleta set + set_tracks via FK CASCADE; tracks intactas', async () => {
    await mockAuthAs(seed.u1);
    const schema = await import('@/db/schema');
    const { deleteSet } = await import('@/lib/actions');

    // Antes: set existe + 3 set_tracks + tracks existem
    const setsBefore = await ctx.db.select().from(schema.sets);
    const setTracksBefore = await ctx.db.select().from(schema.setTracks);
    const tracksBefore = await ctx.db.select().from(schema.tracks);
    expect(setsBefore.length).toBe(1);
    expect(setTracksBefore.length).toBe(3);
    expect(tracksBefore.length).toBe(5);

    const result = await deleteSet({ setId: seed.s1 });
    expect(result).toEqual({ ok: true });

    // Depois: set deletado, set_tracks limpas via CASCADE, tracks intactas
    const setsAfter = await ctx.db.select().from(schema.sets);
    const setTracksAfter = await ctx.db.select().from(schema.setTracks);
    const tracksAfter = await ctx.db.select().from(schema.tracks);
    expect(setsAfter.length).toBe(0);
    expect(setTracksAfter.length).toBe(0);
    expect(tracksAfter.length).toBe(5); // Princípio I: curadoria preservada
  });

  it('records permanecem intactos pós-delete (Princípio I)', async () => {
    await mockAuthAs(seed.u1);
    const schema = await import('@/db/schema');
    const { deleteSet } = await import('@/lib/actions');

    await deleteSet({ setId: seed.s1 });

    const records = await ctx.db.select().from(schema.records);
    expect(records.length).toBe(5);
    // status/shelfLocation preservados
    const r1After = records.find((r) => r.id === seed.r1);
    expect(r1After?.status).toBe('active');
    expect(r1After?.shelfLocation).toBe('E1');
  });

  it('campos AUTHOR de tracks preservados (selected/bpm/moods/contexts/etc)', async () => {
    await mockAuthAs(seed.u1);
    const schema = await import('@/db/schema');
    const { deleteSet } = await import('@/lib/actions');

    const beforeT1 = await ctx.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, seed.t1));

    await deleteSet({ setId: seed.s1 });

    const afterT1 = await ctx.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, seed.t1));

    expect(afterT1[0].selected).toBe(beforeT1[0].selected);
    expect(afterT1[0].bpm).toBe(beforeT1[0].bpm);
    expect(afterT1[0].musicalKey).toBe(beforeT1[0].musicalKey);
    expect(afterT1[0].moods).toEqual(beforeT1[0].moods);
    expect(afterT1[0].rating).toBe(beforeT1[0].rating);
    expect(afterT1[0].isBomb).toBe(beforeT1[0].isBomb);
  });

  it('ownership-fail: u2 NÃO consegue deletar set do u1', async () => {
    await mockAuthAs(seed.u2);
    const schema = await import('@/db/schema');
    const { deleteSet } = await import('@/lib/actions');

    const result = await deleteSet({ setId: seed.s1 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);

    // Set continua existindo
    const sets = await ctx.db.select().from(schema.sets);
    expect(sets.length).toBe(1);
    expect(sets[0].id).toBe(seed.s1);
  });

  it('set inexistente retorna erro estruturado', async () => {
    await mockAuthAs(seed.u1);
    const { deleteSet } = await import('@/lib/actions');

    const result = await deleteSet({ setId: 99999 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });
});
