/**
 * Inc 37 (034) Tier 2 — `buildCollectionFilters` equivalence assertions.
 *
 * Mocks ativados:
 * - @/db → test-db in-memory via vi.doMock
 * - @/lib/cache → cacheUser bypass + revalidateUserCache no-op
 * - @/lib/queries/user-facets → getUserFacets stub
 *
 * Princípio coberto: VI bullet 4 — otimização sem mudança comportamental
 * MUST ter teste de integração assertando resultado idêntico.
 *
 * Cada it() executa `queryCollection` com 1 filtro distinto sobre seed
 * de 5 records e assert no subset retornado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../helpers/test-db';
import { seedCollectionFixture } from '../helpers/seed-collection';

describe('buildCollectionFilters (Inc 37 Tier 2) — 1 it() por filtro', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let seed: Awaited<ReturnType<typeof seedCollectionFixture>>;

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
    vi.doUnmock('next/cache');
    vi.doUnmock('@/lib/cache');
    vi.resetModules();
    ctx.client.close();
  });

  async function queryWithFilter(
    overrides: Partial<{
      status: 'all' | 'unrated' | 'active' | 'discarded';
      text: string;
      genres: string[];
      styles: string[];
      bomba: 'any' | 'only' | 'none';
      formats: string[];
      shelves: string[];
      years: number[];
      countries: string[];
      labels: string[];
    }> = {},
  ): Promise<number[]> {
    const { queryCollection } = await import('@/lib/queries/collection');
    const rows = await queryCollection({
      userId: seed.u1,
      status: overrides.status ?? 'all',
      text: overrides.text ?? '',
      genres: overrides.genres ?? [],
      styles: overrides.styles ?? [],
      bomba: overrides.bomba ?? 'any',
      formats: overrides.formats ?? [],
      shelves: overrides.shelves ?? [],
      years: overrides.years ?? [],
      countries: overrides.countries ?? [],
      labels: overrides.labels ?? [],
    });
    return rows.map((r) => r.id).sort((a, b) => a - b);
  }

  it('sem filtros retorna todos os 5 records do u1', async () => {
    const ids = await queryWithFilter();
    expect(ids).toEqual([seed.r1, seed.r2, seed.r3, seed.r4, seed.r5].sort((a, b) => a - b));
  });

  it('status=active retorna 3 records (r1, r3, r5)', async () => {
    const ids = await queryWithFilter({ status: 'active' });
    expect(ids).toEqual([seed.r1, seed.r3, seed.r5].sort((a, b) => a - b));
  });

  it('status=discarded retorna 1 record (r4)', async () => {
    const ids = await queryWithFilter({ status: 'discarded' });
    expect(ids).toEqual([seed.r4]);
  });

  it('text=A1 retorna apenas r1 (search_text match em artist)', async () => {
    const ids = await queryWithFilter({ text: 'A1' });
    expect(ids).toEqual([seed.r1]);
  });

  it('genre=Funk retorna r1 (única com Funk)', async () => {
    const ids = await queryWithFilter({ genres: ['Funk'] });
    expect(ids).toEqual([seed.r1]);
  });

  it('style=AOR retorna r1', async () => {
    const ids = await queryWithFilter({ styles: ['AOR'] });
    expect(ids).toEqual([seed.r1]);
  });

  it('format=LP retorna r1+r4 (2 LPs)', async () => {
    const ids = await queryWithFilter({ formats: ['LP'] });
    expect(ids).toEqual([seed.r1, seed.r4].sort((a, b) => a - b));
  });

  it('format=Vinyl retorna 4 records (r1, r2, r4, r5 — todos exceto CD)', async () => {
    const ids = await queryWithFilter({ formats: ['Vinyl'] });
    expect(ids).toEqual([seed.r1, seed.r2, seed.r4, seed.r5].sort((a, b) => a - b));
  });

  it('year=1985 retorna apenas r1', async () => {
    const ids = await queryWithFilter({ years: [1985] });
    expect(ids).toEqual([seed.r1]);
  });

  it('country=US retorna r3+r5 (2 records)', async () => {
    const ids = await queryWithFilter({ countries: ['US'] });
    expect(ids).toEqual([seed.r3, seed.r5].sort((a, b) => a - b));
  });

  it('label=Polydor retorna r1', async () => {
    const ids = await queryWithFilter({ labels: ['Polydor'] });
    expect(ids).toEqual([seed.r1]);
  });

  it('shelf=E1 retorna r1+r3', async () => {
    const ids = await queryWithFilter({ shelves: ['E1'] });
    expect(ids).toEqual([seed.r1, seed.r3].sort((a, b) => a - b));
  });

  it('bomba=only retorna apenas r1 (única com isBomb=true)', async () => {
    const ids = await queryWithFilter({ bomba: 'only' });
    expect(ids).toEqual([seed.r1]);
  });

  it('bomba=none retorna 4 records (r2, r3, r4, r5 — sem bomba)', async () => {
    const ids = await queryWithFilter({ bomba: 'none' });
    expect(ids).toEqual([seed.r2, seed.r3, seed.r4, seed.r5].sort((a, b) => a - b));
  });

  it('combinação format=LP + country=BR retorna apenas r1', async () => {
    const ids = await queryWithFilter({ formats: ['LP'], countries: ['BR'] });
    expect(ids).toEqual([seed.r1]);
  });

  it('filtros restritivos sem matches retornam empty', async () => {
    const ids = await queryWithFilter({ formats: ['DAT'] }); // formato inexistente
    expect(ids).toEqual([]);
  });
});
