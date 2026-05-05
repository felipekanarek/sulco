/**
 * Inc 37 (034) Tier 2 — `applyPivotDelta` (Inc 35).
 *
 * Mocks ativados: @/db → test-db.
 *
 * Princípio coberto: VI bullet 4 — equivalence em otimização de pivots.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

describe('applyPivotDelta (Inc 37 Tier 2)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let userId: number;
  let recordId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'user_pivot_test',
        email: 'pivot@example.com',
        discogsUsername: 'p',
      })
      .returning();
    userId = u.id;
    const [r] = await ctx.db
      .insert(schema.records)
      .values({
        userId,
        discogsId: 9999,
        artist: 'Test',
        title: 'Test',
      })
      .returning();
    recordId = r.id;
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.resetModules();
    ctx.client.close();
  });

  async function pivotGenres(): Promise<string[]> {
    const schema = await import('@/db/schema');
    const rows = await ctx.db
      .select({ genre: schema.recordGenres.genre })
      .from(schema.recordGenres)
      .where(eq(schema.recordGenres.recordId, recordId));
    return rows.map((r) => r.genre).sort();
  }

  it('INSERT batched: added populates pivot', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk', 'Soul'], []);
    expect(await pivotGenres()).toEqual(['Funk', 'Soul']);
  });

  it('DELETE seletivo: removed elimina apenas os tokens listados', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk', 'Soul', 'Jazz'], []);
    expect(await pivotGenres()).toEqual(['Funk', 'Jazz', 'Soul']);

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, [], ['Jazz']);
    expect(await pivotGenres()).toEqual(['Funk', 'Soul']);
  });

  it('idempotência: re-INSERT do mesmo token via onConflictDoNothing', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk'], []);
    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk'], []);
    expect(await pivotGenres()).toEqual(['Funk']); // sem duplicação
  });

  it('filtro empty/whitespace: ignora tokens vazios em added', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(
      recordGenres,
      'recordId',
      'genre',
      recordId,
      ['', '  ', 'Funk', '\t'],
      [],
    );
    expect(await pivotGenres()).toEqual(['Funk']);
  });

  it('filtro empty/whitespace: ignora tokens vazios em removed', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk'], []);
    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, [], ['', '  ']);
    expect(await pivotGenres()).toEqual(['Funk']); // não toca
  });

  it('no-op quando ambos arrays vazios', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, [], []);
    expect(await pivotGenres()).toEqual([]);
  });

  it('diff misto: added + removed simultâneos', async () => {
    const { applyPivotDelta } = await import('@/lib/pivot-helpers');
    const { recordGenres } = await import('@/db/schema');

    await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, ['Funk', 'Jazz'], []);
    await applyPivotDelta(
      recordGenres,
      'recordId',
      'genre',
      recordId,
      ['Soul'], // add
      ['Jazz'], // remove
    );
    expect(await pivotGenres()).toEqual(['Funk', 'Soul']);
  });
});
