/**
 * Inc 37 (034) Tier 1 — `updateTrackCuration` Server Action.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/auth → fixture user via vi.doMock (Q2 clarification)
 * - @/lib/cache → revalidateUserCache spy
 * - next/cache → revalidatePath no-op
 *
 * Princípio coberto: I (AUTHOR proteção — campos curatoriais soberanos
 * do DJ) + VI (cobertura por camada).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('updateTrackCuration (Inc 37 Tier 1)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let seed: Awaited<ReturnType<typeof seedCollectionFixture>>;

  async function mockAuthAs(userId: number) {
    vi.doMock('@/lib/auth', () => ({
      requireCurrentUser: async () => ({
        id: userId,
        clerkUserId: 'user_test',
        email: 'test@example.com',
        discogsUsername: 'test',
        needsOnboarding: false,
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

  async function trackSnapshot(trackId: number) {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, trackId));
    return t;
  }

  it('caminho feliz: bpm + key + energy + rating persistem', async () => {
    await mockAuthAs(seed.u1);
    const { updateTrackCuration } = await import('@/lib/actions');

    const result = await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      bpm: 110,
      musicalKey: '5A',
      energy: 4,
      rating: 2,
    });

    expect(result).toEqual({ ok: true });

    const after = await trackSnapshot(seed.t3);
    expect(after.bpm).toBe(110);
    expect(after.musicalKey).toBe('5A');
    expect(after.energy).toBe(4);
    expect(after.rating).toBe(2);
  });

  it('Zod rejeita BPM out-of-range (>250)', async () => {
    await mockAuthAs(seed.u1);
    const { updateTrackCuration } = await import('@/lib/actions');

    const result = await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      bpm: 300,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();

    const after = await trackSnapshot(seed.t3);
    expect(after.bpm).toBe(90); // valor original do seed
  });

  it('Zod rejeita musicalKey inválido (não-Camelot)', async () => {
    await mockAuthAs(seed.u1);
    const { updateTrackCuration } = await import('@/lib/actions');

    const result = await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      musicalKey: 'invalid',
    });

    expect(result.ok).toBe(false);

    const after = await trackSnapshot(seed.t3);
    expect(after.musicalKey).toBe('12A'); // original
  });

  it('Zod rejeita energy fora de 1..5', async () => {
    await mockAuthAs(seed.u1);
    const { updateTrackCuration } = await import('@/lib/actions');

    const result = await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      energy: 10,
    });

    expect(result.ok).toBe(false);
  });

  it('multi-select moods/contexts persistem', async () => {
    await mockAuthAs(seed.u1);
    const { updateTrackCuration } = await import('@/lib/actions');

    await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      moods: ['solar', 'novo-mood'],
      contexts: ['pico', 'novo-contexto'],
    });

    const after = await trackSnapshot(seed.t3);
    expect(after.moods).toEqual(['solar', 'novo-mood']);
    expect(after.contexts).toEqual(['pico', 'novo-contexto']);
  });

  it('ownership via record JOIN: u2 NÃO consegue editar track de record do u1', async () => {
    await mockAuthAs(seed.u2);
    const { updateTrackCuration } = await import('@/lib/actions');

    const before = await trackSnapshot(seed.t3);

    const result = await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      bpm: 999,
    });

    expect(result.ok).toBe(false);

    const after = await trackSnapshot(seed.t3);
    expect(after.bpm).toBe(before.bpm); // intacto
  });

  it('Princípio I: track AUTHOR de OUTRA track e do record intactos pós-edit', async () => {
    await mockAuthAs(seed.u1);
    const beforeT1 = await trackSnapshot(seed.t1);
    const schema = await import('@/db/schema');
    const [beforeR3] = await ctx.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, seed.r3));

    const { updateTrackCuration } = await import('@/lib/actions');
    await updateTrackCuration({
      trackId: seed.t3,
      recordId: seed.r3,
      bpm: 100,
    });

    // Outra track (t1) intacta
    const afterT1 = await trackSnapshot(seed.t1);
    expect(afterT1.bpm).toBe(beforeT1.bpm);
    expect(afterT1.moods).toEqual(beforeT1.moods);
    expect(afterT1.isBomb).toBe(beforeT1.isBomb);

    // Record (r3) intacto
    const [afterR3] = await ctx.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, seed.r3));
    expect(afterR3.status).toBe(beforeR3.status);
    expect(afterR3.shelfLocation).toBe(beforeR3.shelfLocation);
  });
});
