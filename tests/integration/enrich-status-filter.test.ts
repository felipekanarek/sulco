import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * FR-016: enrich filtra APENAS archived=true. Discos `unrated`,
 * `active` e `discarded` são todos elegíveis — o valor principal
 * da feature é ajudar na triagem, que acontece sobre discos unrated.
 *
 * Também testa a ORDENAÇÃO: active primeiro, unrated depois,
 * discarded por último. Assim, quando DJ marca um disco como active,
 * ele tende a ser enriquecido no próximo cron antes dos unrated.
 */

describe('enrich filtro de status (FR-016)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  const mbSearch = vi.fn();
  const mbRecordings = vi.fn();
  const abFetch = vi.fn();

  beforeEach(async () => {
    ctx = await createTestDb();
    mbSearch.mockClear();
    mbRecordings.mockClear();
    abFetch.mockClear();
    mbSearch.mockResolvedValue('mb-release');
    mbRecordings.mockResolvedValue([
      { position: 'A1', title: 'x', recordingMbid: 'mbid-universal' },
    ]);
    abFetch.mockResolvedValue({
      bpm: 120,
      camelot: '8A',
      energy: 3,
      moods: ['happy'],
    });

    vi.doMock('@/db', () => ({ db: ctx.db }));
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: mbSearch,
      fetchReleaseRecordings: mbRecordings,
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: abFetch,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  async function seed() {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u_status', email: 'e@e' })
      .returning();

    // 4 discos: 1 active, 2 unrated, 1 discarded, 1 archived
    // Cada um com 1 track elegível
    const [rActive] = await ctx.db.insert(schema.records).values({
      userId: u.id, discogsId: 1, artist: 'A', title: 'Active', status: 'active',
    }).returning();
    const [rUnrated1] = await ctx.db.insert(schema.records).values({
      userId: u.id, discogsId: 2, artist: 'B', title: 'Unrated1', status: 'unrated',
    }).returning();
    const [rUnrated2] = await ctx.db.insert(schema.records).values({
      userId: u.id, discogsId: 3, artist: 'C', title: 'Unrated2', status: 'unrated',
    }).returning();
    const [rDiscarded] = await ctx.db.insert(schema.records).values({
      userId: u.id, discogsId: 4, artist: 'D', title: 'Discarded', status: 'discarded',
    }).returning();
    const [rArchived] = await ctx.db.insert(schema.records).values({
      userId: u.id, discogsId: 5, artist: 'E', title: 'Archived', status: 'unrated', archived: true,
    }).returning();

    const trackIds: Record<string, number> = {};
    for (const [key, rec] of Object.entries({
      active: rActive, unrated1: rUnrated1, unrated2: rUnrated2, discarded: rDiscarded, archived: rArchived,
    })) {
      const [t] = await ctx.db.insert(schema.tracks).values({
        recordId: rec.id, position: 'A1', title: `t_${key}`,
      }).returning();
      trackIds[key] = t.id;
    }

    return { userId: u.id, trackIds, schema };
  }

  it('unrated é enriquecido (não filtra por status)', async () => {
    const { userId, trackIds, schema } = await seed();

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');
    const summary = await enrichUserBacklog(userId);

    // 4 processados (active + 2 unrated + discarded), NÃO archived
    expect(summary.recordsProcessed).toBe(4);
    expect(summary.tracksUpdated).toBe(4);

    // Track de unrated foi enriquecida
    const [unrated1After] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackIds.unrated1));
    expect(unrated1After.audioFeaturesSource).toBe('acousticbrainz');
    expect(unrated1After.bpm).toBe(120);

    // Track de archived ficou intacta
    const [archivedAfter] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackIds.archived));
    expect(archivedAfter.audioFeaturesSource).toBeNull();
    expect(archivedAfter.bpm).toBeNull();
  });

  it('active é priorizado na ordem de processamento', async () => {
    const { userId, schema } = await seed();

    const callOrder: string[] = [];
    mbSearch.mockImplementation(async (discogsId: number) => {
      callOrder.push(`discogs:${discogsId}`);
      return 'mb-release';
    });

    const { enrichUserBacklog } = await import('@/lib/acousticbrainz');
    await enrichUserBacklog(userId);

    // discogs:1 (active) deve ser chamado ANTES de discogs:2/3 (unrated)
    const activeIdx = callOrder.indexOf('discogs:1');
    const unrated1Idx = callOrder.indexOf('discogs:2');
    const unrated2Idx = callOrder.indexOf('discogs:3');
    const discardedIdx = callOrder.indexOf('discogs:4');
    const archivedIdx = callOrder.indexOf('discogs:5');

    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).toBeLessThan(unrated1Idx);
    expect(activeIdx).toBeLessThan(unrated2Idx);
    // discarded vem por último (antes só de archived, que é excluído)
    expect(discardedIdx).toBeGreaterThan(unrated1Idx);
    expect(discardedIdx).toBeGreaterThan(unrated2Idx);
    // archived NUNCA deveria aparecer
    expect(archivedIdx).toBe(-1);
  });

  it('enrichRecord rejeita archived=true com summary zerado', async () => {
    const { userId, schema } = await seed();

    // Pega o record archived
    const [archivedRec] = await ctx.db.select().from(schema.records).where(eq(schema.records.discogsId, 5));

    const { enrichRecord } = await import('@/lib/acousticbrainz');
    const summary = await enrichRecord(userId, archivedRec.id);

    expect(summary.tracksUpdated).toBe(0);
    expect(summary.mbidsResolved).toBe(0);
    // MB nunca chamado pq rejeitou antes
    expect(mbSearch).not.toHaveBeenCalled();
  });

  it('enrichRecord aceita discarded (spec só exige pular archived)', async () => {
    const { userId, schema, trackIds } = await seed();

    const [discardedRec] = await ctx.db.select().from(schema.records).where(eq(schema.records.discogsId, 4));

    const { enrichRecord } = await import('@/lib/acousticbrainz');
    const summary = await enrichRecord(userId, discardedRec.id);

    expect(summary.tracksUpdated).toBe(1);

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackIds.discarded));
    expect(after.audioFeaturesSource).toBe('acousticbrainz');
  });
});
