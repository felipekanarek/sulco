import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * Inc 36 (033) — `record_formats` pivot consistente cross-write.
 *
 * Princípio VI (bullet 4): otimização sem mudança comportamental MUST ter
 * teste de integração assertando que o resultado é idêntico ao
 * comportamento prévio.
 *
 * Escopo: hooks de write em `applyDiscogsUpdate` (insert/update/reaparição)
 * mantêm `record_formats` em sincronia com `records.format`. FR-004 +
 * data-model "Estado de transição".
 */

describe('record_formats pivot (Inc 36) — applyDiscogsUpdate hooks', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.resetModules();
    ctx.client.close();
  });

  async function seedUser() {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({
        clerkUserId: 'user_test_inc36',
        email: 'felipe@example.com',
        discogsUsername: 'felipekanarek',
      })
      .returning();
    return u.id;
  }

  async function pivotTokens(recordId: number): Promise<string[]> {
    const schema = await import('@/db/schema');
    const rows = await ctx.db
      .select({ token: schema.recordFormats.token })
      .from(schema.recordFormats)
      .where(eq(schema.recordFormats.recordId, recordId));
    return rows.map((r) => r.token).sort();
  }

  it('INSERT path popula record_formats com tokens base do composite Discogs', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    const result = await applyDiscogsUpdate(
      userId,
      {
        id: 100,
        artist: 'A',
        title: 'T',
        year: 1985,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP, Album, Stereo',
        coverUrl: null,
        genres: ['Funk'],
        styles: ['Soul'],
        tracklist: [],
      },
      { isNew: true },
    );

    expect(result.created).toBe(true);
    const tokens = await pivotTokens(result.recordId);
    expect(tokens).toEqual(['Album', 'LP', 'Stereo', 'Vinyl']);
  });

  it('INSERT path com format vazio não popula pivot (FR-002 edge case)', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    const result = await applyDiscogsUpdate(
      userId,
      {
        id: 101,
        artist: 'A',
        title: 'T',
        year: null,
        label: null,
        country: null,
        format: '',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: true },
    );

    const tokens = await pivotTokens(result.recordId);
    expect(tokens).toEqual([]);
  });

  it('UPDATE path com diff de format aplica added + removed corretamente', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    // INSERT inicial: "Vinyl, LP"
    const r = await applyDiscogsUpdate(
      userId,
      {
        id: 200,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: true },
    );
    expect(await pivotTokens(r.recordId)).toEqual(['LP', 'Vinyl']);

    // UPDATE: muda pra "Vinyl, LP, Stereo" (adiciona Stereo)
    await applyDiscogsUpdate(
      userId,
      {
        id: 200,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP, Stereo',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: false },
    );
    expect(await pivotTokens(r.recordId)).toEqual(['LP', 'Stereo', 'Vinyl']);

    // UPDATE: muda pra "CD" (remove tudo, adiciona CD)
    await applyDiscogsUpdate(
      userId,
      {
        id: 200,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'CD',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: false },
    );
    expect(await pivotTokens(r.recordId)).toEqual(['CD']);
  });

  it('UPDATE path com format igual é no-op no pivot (idempotência)', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');

    const r = await applyDiscogsUpdate(
      userId,
      {
        id: 300,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP, Album',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: true },
    );
    const before = await pivotTokens(r.recordId);

    // Mesmo format — no-op esperado
    await applyDiscogsUpdate(
      userId,
      {
        id: 300,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP, Album',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: false },
    );
    const after = await pivotTokens(r.recordId);
    expect(after).toEqual(before);
  });

  it('FK CASCADE: delete físico de record limpa pivot (Princípio IV)', async () => {
    const userId = await seedUser();
    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');
    const schema = await import('@/db/schema');

    const r = await applyDiscogsUpdate(
      userId,
      {
        id: 400,
        artist: 'A',
        title: 'T',
        year: 1990,
        label: 'L',
        country: 'BR',
        format: 'Vinyl, LP',
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [],
      },
      { isNew: true },
    );
    expect(await pivotTokens(r.recordId)).toEqual(['LP', 'Vinyl']);

    // Hard-delete record (cenário raríssimo coberto por FK CASCADE)
    await ctx.db.delete(schema.records).where(eq(schema.records.id, r.recordId));
    expect(await pivotTokens(r.recordId)).toEqual([]);
  });
});
