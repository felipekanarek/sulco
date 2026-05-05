/**
 * Inc 37 (034) Tier 1 — `updateRecordAuthorFields` Server Action.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/auth → fixture user via vi.doMock (Q2 clarification)
 * - @/lib/cache → revalidateUserCache spy
 * - next/cache → revalidatePath no-op
 *
 * Princípio coberto: I (AUTHOR proteção — shelfLocation/notes
 * exclusivos do DJ).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('updateRecordAuthorFields (Inc 37 Tier 1)', () => {
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

  async function recordSnapshot(recordId: number) {
    const schema = await import('@/db/schema');
    const [r] = await ctx.db
      .select()
      .from(schema.records)
      .where(eq(schema.records.id, recordId));
    return r;
  }

  it('caminho feliz: shelfLocation + notes persistem', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordAuthorFields } = await import('@/lib/actions');

    const result = await updateRecordAuthorFields({
      recordId: seed.r1,
      shelfLocation: 'F-NOVO',
      notes: 'minha nota nova',
    });

    expect(result).toEqual({ ok: true });

    const after = await recordSnapshot(seed.r1);
    expect(after.shelfLocation).toBe('F-NOVO');
    expect(after.notes).toBe('minha nota nova');
  });

  it('Zod rejeita shelfLocation > 50 chars', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordAuthorFields } = await import('@/lib/actions');

    const result = await updateRecordAuthorFields({
      recordId: seed.r1,
      shelfLocation: 'A'.repeat(51),
    });

    expect(result.ok).toBe(false);

    // shelfLocation original preservado
    const after = await recordSnapshot(seed.r1);
    expect(after.shelfLocation).toBe('E1');
  });

  it('null clears shelfLocation', async () => {
    await mockAuthAs(seed.u1);
    const { updateRecordAuthorFields } = await import('@/lib/actions');

    await updateRecordAuthorFields({
      recordId: seed.r1,
      shelfLocation: null,
    });

    const after = await recordSnapshot(seed.r1);
    expect(after.shelfLocation).toBeNull();
  });

  it('ownership-fail: u2 NÃO consegue editar record do u1', async () => {
    await mockAuthAs(seed.u2);
    const { updateRecordAuthorFields } = await import('@/lib/actions');

    const result = await updateRecordAuthorFields({
      recordId: seed.r1,
      shelfLocation: 'HACK',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);

    const after = await recordSnapshot(seed.r1);
    expect(after.shelfLocation).toBe('E1');
  });

  it('Princípio I: status/archived/artist/title intactos pós-edit', async () => {
    await mockAuthAs(seed.u1);
    const before = await recordSnapshot(seed.r1);

    const { updateRecordAuthorFields } = await import('@/lib/actions');
    await updateRecordAuthorFields({
      recordId: seed.r1,
      shelfLocation: 'NOVA',
      notes: 'editado',
    });

    const after = await recordSnapshot(seed.r1);
    expect(after.status).toBe(before.status);
    expect(after.archived).toBe(before.archived);
    expect(after.artist).toBe(before.artist);
    expect(after.title).toBe(before.title);
    expect(after.year).toBe(before.year);
    expect(after.format).toBe(before.format);
  });
});
