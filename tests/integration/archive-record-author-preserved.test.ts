/**
 * Inc 37 (034) Tier 1 — `archiveRecord` preserva campos AUTHOR.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/cache → revalidateUserCache no-op (não-mockado, archive.ts não chama)
 *
 * Princípio coberto: I (AUTHOR proteção) + IV (preservação — archive
 * não deleta).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('archiveRecord (Inc 37 Tier 1) — preservação AUTHOR', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let seed: Awaited<ReturnType<typeof seedCollectionFixture>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    seed = await seedCollectionFixture(ctx.db);
  });

  afterEach(() => {
    vi.doUnmock('@/db');
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

  async function trackSnapshot(trackId: number) {
    const schema = await import('@/db/schema');
    const [t] = await ctx.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, trackId));
    return t;
  }

  it('mantém status/shelfLocation/notes intactos pós-archive (Princípio I)', async () => {
    const before = await recordSnapshot(seed.r1);
    expect(before.status).toBe('active');
    expect(before.shelfLocation).toBe('E1');

    const { archiveRecord } = await import('@/lib/discogs/archive');
    await archiveRecord(seed.u1, seed.r1);

    const after = await recordSnapshot(seed.r1);
    expect(after.archived).toBe(true);
    expect(after.archivedAt).not.toBeNull();
    // AUTHOR preservados
    expect(after.status).toBe(before.status);
    expect(after.shelfLocation).toBe(before.shelfLocation);
    expect(after.notes).toBe(before.notes);
  });

  it('mantém TODOS os campos AUTHOR de tracks intactos pós-archive', async () => {
    const beforeT1 = await trackSnapshot(seed.t1);

    const { archiveRecord } = await import('@/lib/discogs/archive');
    await archiveRecord(seed.u1, seed.r1);

    const afterT1 = await trackSnapshot(seed.t1);
    expect(afterT1.selected).toBe(beforeT1.selected);
    expect(afterT1.bpm).toBe(beforeT1.bpm);
    expect(afterT1.musicalKey).toBe(beforeT1.musicalKey);
    expect(afterT1.energy).toBe(beforeT1.energy);
    expect(afterT1.rating).toBe(beforeT1.rating);
    expect(afterT1.moods).toEqual(beforeT1.moods);
    expect(afterT1.contexts).toEqual(beforeT1.contexts);
    expect(afterT1.isBomb).toBe(beforeT1.isBomb);
  });

  it('archived_at setado e archived_acknowledged_at NULL (banner pendente)', async () => {
    const { archiveRecord } = await import('@/lib/discogs/archive');
    await archiveRecord(seed.u1, seed.r1);

    const after = await recordSnapshot(seed.r1);
    expect(after.archivedAt).toBeInstanceOf(Date);
    expect(after.archivedAcknowledgedAt).toBeNull();
  });

  it('pivot record_genres/record_styles permanecem intactos (filter archived=0 cobre)', async () => {
    const schema = await import('@/db/schema');
    const beforeGenres = await ctx.db
      .select()
      .from(schema.recordGenres)
      .where(eq(schema.recordGenres.recordId, seed.r1));
    expect(beforeGenres.length).toBeGreaterThan(0);

    const { archiveRecord } = await import('@/lib/discogs/archive');
    await archiveRecord(seed.u1, seed.r1);

    const afterGenres = await ctx.db
      .select()
      .from(schema.recordGenres)
      .where(eq(schema.recordGenres.recordId, seed.r1));
    expect(afterGenres.length).toBe(beforeGenres.length);
  });

  it('idempotência: re-archive de já-archived é no-op', async () => {
    const { archiveRecord } = await import('@/lib/discogs/archive');
    const result1 = await archiveRecord(seed.u1, seed.r1);
    const after1 = await recordSnapshot(seed.r1);

    const result2 = await archiveRecord(seed.u1, seed.r1);
    const after2 = await recordSnapshot(seed.r1);

    expect(result1).toEqual({ archived: true });
    expect(result2).toEqual({ archived: true });
    // archivedAt do 2º call não deve sobrescrever (idempotência via early return)
    expect(after2.archivedAt?.getTime()).toBe(after1.archivedAt?.getTime());
  });

  it('ownership-fail: archiveRecord(u2, r1) NÃO arquiva record do u1', async () => {
    const { archiveRecord } = await import('@/lib/discogs/archive');
    await archiveRecord(seed.u2, seed.r1); // u2 tenta arquivar record do u1

    const after = await recordSnapshot(seed.r1);
    expect(after.archived).toBe(false); // permanece não-arquivado
  });
});
