/**
 * Inc 37 (034) Tier 2 — `applyVocabDelta` (Inc 33).
 *
 * Mocks ativados: @/db → test-db.
 *
 * Princípio coberto: VI bullet 4 — equivalence em otimização de
 * write-path crítico (substitui recomputeFacets scan).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

describe('applyVocabDelta (Inc 37 Tier 2)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let userId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'user_vocab_test',
        email: 'vocab@example.com',
        discogsUsername: 'v',
      })
      .returning();
    userId = u.id;
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.resetModules();
    ctx.client.close();
  });

  async function getRefCount(kind: string, term: string): Promise<number | null> {
    const schema = await import('@/db/schema');
    const rows = await ctx.db
      .select({ refCount: schema.userVocab.refCount })
      .from(schema.userVocab)
      .where(
        and(
          eq(schema.userVocab.userId, userId),
          eq(schema.userVocab.kind, kind as 'genres'),
          eq(schema.userVocab.term, term),
        ),
      );
    return rows.length > 0 ? rows[0].refCount : null;
  }

  it('UPSERT increment: 1ª chamada cria entry com refCount=1', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['Funk'], []);
    expect(await getRefCount('genres', 'Funk')).toBe(1);
  });

  it('UPSERT increment: 2ª chamada atualiza refCount pra 2', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['Funk'], []);
    await applyVocabDelta(userId, 'genres', ['Funk'], []);
    expect(await getRefCount('genres', 'Funk')).toBe(2);
  });

  it('DELETE decrement: removendo até 0 deleta entry', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['Funk'], []);
    expect(await getRefCount('genres', 'Funk')).toBe(1);

    await applyVocabDelta(userId, 'genres', [], ['Funk']);
    expect(await getRefCount('genres', 'Funk')).toBeNull(); // entry deletada
  });

  it('decrement com refCount > 1 não deleta, apenas decrementa', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['Funk', 'Funk'], []);
    expect(await getRefCount('genres', 'Funk')).toBe(2);

    await applyVocabDelta(userId, 'genres', [], ['Funk']);
    expect(await getRefCount('genres', 'Funk')).toBe(1);
  });

  it('clamp em 0: decrement em entry inexistente é no-op (sem erro)', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await expect(
      applyVocabDelta(userId, 'genres', [], ['Inexistente']),
    ).resolves.not.toThrow();
    expect(await getRefCount('genres', 'Inexistente')).toBeNull();
  });

  it('idempotência: ambos arrays vazios é no-op (zero queries)', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', [], []);

    const schema = await import('@/db/schema');
    const all = await ctx.db.select().from(schema.userVocab);
    expect(all.length).toBe(0);
  });

  it('diff misto: added + removed simultâneos aplicam corretamente', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['Funk', 'Jazz'], []);
    expect(await getRefCount('genres', 'Funk')).toBe(1);
    expect(await getRefCount('genres', 'Jazz')).toBe(1);

    // Diff: troca Jazz por Soul
    await applyVocabDelta(userId, 'genres', ['Soul'], ['Jazz']);
    expect(await getRefCount('genres', 'Funk')).toBe(1); // intacto
    expect(await getRefCount('genres', 'Jazz')).toBeNull(); // deletado
    expect(await getRefCount('genres', 'Soul')).toBe(1); // novo
  });

  it('filtra empty/whitespace de added/removed', async () => {
    const { applyVocabDelta } = await import('@/lib/queries/user-vocab');
    await applyVocabDelta(userId, 'genres', ['', '  ', 'Funk', '\t'], []);
    const schema = await import('@/db/schema');
    const all = await ctx.db.select().from(schema.userVocab);
    expect(all.length).toBe(1);
    expect(all[0].term).toBe('Funk');
  });
});
