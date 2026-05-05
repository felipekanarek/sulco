/**
 * Inc 37 (034) Tier 1 — `updateRecordStatus` Server Action.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/auth → fixture user via vi.doMock (Q2 clarification)
 * - @/lib/cache → revalidateUserCache spy
 * - next/cache → revalidatePath no-op
 *
 * Princípio coberto: I (AUTHOR proteção) + VI (cobertura por camada).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('updateRecordStatus (Inc 37 Tier 1)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let seed: Awaited<ReturnType<typeof seedCollectionFixture>>;
  let revalidateUserCacheSpy: ReturnType<typeof vi.fn>;

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
    revalidateUserCacheSpy = vi.fn();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
      unstable_cache: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
    }));
    vi.doMock('@/lib/cache', () => ({
      cacheUser: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
      revalidateUserCache: revalidateUserCacheSpy,
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

  async function getStatus(recordId: number): Promise<string> {
    const schema = await import('@/db/schema');
    const [r] = await ctx.db
      .select({ status: schema.records.status })
      .from(schema.records)
      .where(eq(schema.records.id, recordId));
    return r.status;
  }

  it('caminho feliz: active → discarded persiste', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordStatus } = await import('@/lib/actions');

    expect(await getStatus(seed.r1)).toBe('active');

    const result = await updateRecordStatus({
      recordId: seed.r1,
      status: 'discarded',
    });

    expect(result).toEqual({ ok: true });
    expect(await getStatus(seed.r1)).toBe('discarded');
  });

  it('Zod rejeita status inválido', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordStatus } = await import('@/lib/actions');

    const result = await updateRecordStatus({
      recordId: seed.r1,
      // @ts-expect-error — testando rejeição de status inválido
      status: 'invalid',
    });

    expect(result.ok).toBe(false);
    // status original mantido
    expect(await getStatus(seed.r1)).toBe('active');
  });

  it('ownership-fail: u2 NÃO consegue mudar status de record do u1', async () => {
    await mockAuthAs(seed.u2);
    const { updateRecordStatus } = await import('@/lib/actions');

    const result = await updateRecordStatus({
      recordId: seed.r1,
      status: 'discarded',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
    expect(await getStatus(seed.r1)).toBe('active');
  });

  it('revalidateUserCache chamado pós-update', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordStatus } = await import('@/lib/actions');

    await updateRecordStatus({ recordId: seed.r1, status: 'discarded' });

    expect(revalidateUserCacheSpy).toHaveBeenCalledWith(seed.u1);
  });

  it('Princípio I: campos não-status (shelfLocation/notes) intactos', async () => {
    await mockAuthAs(seed.u1);
    const schema = await import('@/db/schema');
    const [before] = await ctx.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, seed.r1));

    const { updateRecordStatus } = await import('@/lib/actions');
    await updateRecordStatus({ recordId: seed.r1, status: 'unrated' });

    const [after] = await ctx.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, seed.r1));

    expect(after.shelfLocation).toBe(before.shelfLocation);
    expect(after.notes).toBe(before.notes);
    expect(after.archived).toBe(before.archived);
    expect(after.artist).toBe(before.artist);
    expect(after.title).toBe(before.title);
  });
});
