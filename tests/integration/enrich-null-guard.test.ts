import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * T020 / SC-003 — Princípio I retroativo e prospectivo.
 *
 * Três cenários:
 *   A) Track legada pós-backfill (source='manual') + dados no DJ → enrich não toca
 *   B) Track mista (DJ preencheu só bpm, outros null, source='manual') → bloco trancado, key não recebe sugestão
 *   C) Track totalmente limpa (source=null) → enrich preenche todos os 4 campos
 */

describe('T020 — null-guard regression (SC-003)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    vi.doMock('@/db', () => ({ db: ctx.db }));
    // Mocka clientes externos pra devolver dados determinísticos
    vi.doMock('@/lib/acousticbrainz/musicbrainz', () => ({
      searchReleaseByDiscogsId: vi.fn(async () => 'mb-release-id-fake'),
      fetchReleaseRecordings: vi.fn(async () => [
        { position: 'A1', title: 'Mock', recordingMbid: 'mbid-a1' },
      ]),
    }));
    vi.doMock('@/lib/acousticbrainz/acousticbrainz', () => ({
      fetchAudioFeatures: vi.fn(async (_mbid: string) => ({
        bpm: 118,
        camelot: '5B',
        energy: 3,
        moods: ['happy'],
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/acousticbrainz/musicbrainz');
    vi.doUnmock('@/lib/acousticbrainz/acousticbrainz');
    vi.resetModules();
    ctx.client.close();
  });

  async function seedUserAndRecord() {
    const schema = await import('@/db/schema');
    const [u] = await ctx.db
      .insert(schema.users)
      .values({ clerkUserId: 'u_t020', email: 'e@example.com' })
      .returning();
    const [r] = await ctx.db
      .insert(schema.records)
      .values({
        userId: u.id,
        discogsId: 12345,
        artist: 'X', title: 'Y',
        status: 'active',
      })
      .returning();
    return { userId: u.id, recordId: r.id, schema };
  }

  it('Cenário A — track legada (source=manual, dados do DJ) não é tocada', async () => {
    const { userId, recordId, schema } = await seedUserAndRecord();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'A1',
        title: 'Legacy',
        bpm: 120,
        musicalKey: '3A',
        energy: 4,
        moods: ['solar'],
        audioFeaturesSource: 'manual',
      })
      .returning();

    const { enrichTrack } = await import('@/lib/acousticbrainz');
    const result = await enrichTrack(userId, t.id);

    expect(result.outcome).toBe('skipped');
    if (result.outcome === 'skipped') expect(result.reason).toBe('manual');

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.bpm).toBe(120);
    expect(after.musicalKey).toBe('3A');
    expect(after.energy).toBe(4);
    expect(after.moods).toEqual(['solar']);
    expect(after.audioFeaturesSource).toBe('manual');
    // Timestamp não atualiza pq a query de elegibilidade já exclui 'manual'
    expect(after.audioFeaturesSyncedAt).toBeNull();
  });

  it('Cenário B — track mista (source=manual, só bpm preenchido) trava bloco inteiro', async () => {
    const { userId, recordId, schema } = await seedUserAndRecord();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'A1',
        title: 'Partial',
        bpm: 120,
        musicalKey: null,
        energy: null,
        moods: [],
        audioFeaturesSource: 'manual',
      })
      .returning();

    const { enrichTrack } = await import('@/lib/acousticbrainz');
    const result = await enrichTrack(userId, t.id);

    expect(result.outcome).toBe('skipped');

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.bpm).toBe(120);           // DJ preservado
    expect(after.musicalKey).toBeNull();    // BLOQUEADO pelo source=manual
    expect(after.energy).toBeNull();        // BLOQUEADO
    expect(after.moods).toEqual([]);        // BLOQUEADO
    expect(after.audioFeaturesSource).toBe('manual');
  });

  it('Cenário C — track totalmente limpa (source=null) preenche os 4 campos com sugestão', async () => {
    const { userId, recordId, schema } = await seedUserAndRecord();
    const [t] = await ctx.db
      .insert(schema.tracks)
      .values({
        recordId,
        position: 'A1',
        title: 'Fresh',
        bpm: null,
        musicalKey: null,
        energy: null,
        moods: [],
        audioFeaturesSource: null,
      })
      .returning();

    const { enrichTrack } = await import('@/lib/acousticbrainz');
    const result = await enrichTrack(userId, t.id);

    expect(result.outcome).toBe('updated');

    const [after] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, t.id));
    expect(after.bpm).toBe(118);
    expect(after.musicalKey).toBe('5B');
    expect(after.energy).toBe(3);
    expect(after.moods).toEqual(['happy']);
    expect(after.audioFeaturesSource).toBe('acousticbrainz');
    expect(after.audioFeaturesSyncedAt).toBeInstanceOf(Date);
    expect(after.mbid).toBe('mbid-a1');
  });
});
