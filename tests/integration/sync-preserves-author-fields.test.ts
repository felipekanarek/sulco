import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db';

/**
 * FR-054 — Gate de CI que verifica Princípio I da Constituição:
 *
 *   "Campos autorais pertencem ao usuário e nunca são sobrescritos
 *    por fontes externas."
 *
 * Setup: user + record com TODOS os campos autorais preenchidos;
 * mock do Discogs retornando dados DIFERENTES (tentando ser adversário).
 *
 * Comando dedicado: `npm run test:constitution`. Se este teste falha,
 * merge deve ser bloqueado.
 */

// ---------- Discogs fetch mock ----------

const MOCK_RELEASE_DIFFERENT = {
  id: 12345,
  artists_sort: 'HACKER TENTANDO SOBRESCREVER',
  title: 'OUTRO TITULO',
  year: 1900,
  labels: [{ name: 'LABEL DIFERENTE' }],
  country: 'XX',
  formats: [{ name: 'CD', descriptions: ['Single'] }],
  images: [{ type: 'primary', uri: 'https://evil.example/cover.jpg' }],
  genres: ['Novo Gênero'],
  styles: ['Novo Estilo'],
  tracklist: [
    { position: 'A1', title: 'Título mudou', duration: '9:99' },
    { position: 'A2', title: 'Outra que mudou', duration: '1:23' },
  ],
};

function installFetchMock() {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/releases/')) {
      return new Response(JSON.stringify(MOCK_RELEASE_DIFFERENT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/collection/')) {
      return new Response(
        JSON.stringify({
          pagination: { page: 1, pages: 1, per_page: 100, items: 1 },
          releases: [{ id: 12345, date_added: new Date().toISOString() }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ---------- Helpers DB ----------

async function seedUserWithCuratedTrack(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  const schema = await import('@/db/schema');
  const [u] = await db
    .insert(schema.users)
    .values({
      clerkUserId: 'user_test_fr054',
      email: 'felipe@example.com',
      discogsUsername: 'felipekanarek',
      discogsTokenEncrypted: 'v1:aaa:bbb:ccc',
      discogsCredentialStatus: 'valid',
    })
    .returning();

  const [r] = await db
    .insert(schema.records)
    .values({
      userId: u.id,
      discogsId: 12345,
      artist: 'Original Artist',
      title: 'Original Title',
      year: 1999,
      label: 'Original Label',
      country: 'BR',
      format: 'LP, Album',
      coverUrl: 'https://img.discogs.com/original.jpg',
      genres: ['Jazz'],
      styles: ['Soul-Jazz'],
      // AUTHOR — o que NUNCA pode ser alterado por sync
      status: 'active',
      shelfLocation: 'E3-P2',
      notes: 'Minha nota pessoal sobre esse disco',
    })
    .returning();

  const [t1] = await db
    .insert(schema.tracks)
    .values({
      recordId: r.id,
      position: 'A1',
      title: 'Original Track Title',
      duration: '5:00',
      selected: true,
      bpm: 120,
      musicalKey: '8A',
      energy: 4,
      rating: 3,
      moods: ['solar', 'festivo'],
      contexts: ['pico'],
      fineGenre: 'soul-jazz orquestral',
      references: 'lembra Floating Points',
      comment: 'Crítica essencial',
      isBomb: true,
    })
    .returning();

  const [t2] = await db
    .insert(schema.tracks)
    .values({
      recordId: r.id,
      position: 'A2',
      title: 'Second track',
      duration: '3:45',
      selected: false,
      rating: null,
    })
    .returning();

  return { userId: u.id, recordId: r.id, trackId1: t1.id, trackId2: t2.id };
}

// ---------- Snapshot helper ----------

async function snapshotAuthorFields(
  db: Awaited<ReturnType<typeof createTestDb>>['db'],
  recordId: number,
) {
  const schema = await import('@/db/schema');
  const [record] = await db.select().from(schema.records).where(eq(schema.records.id, recordId));
  const tracks = await db.select().from(schema.tracks).where(eq(schema.tracks.recordId, recordId));
  return {
    record: {
      status: record.status,
      shelfLocation: record.shelfLocation,
      notes: record.notes,
      archived: record.archived,
    },
    tracks: tracks.map((t) => ({
      id: t.id,
      position: t.position,
      selected: t.selected,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      energy: t.energy,
      rating: t.rating,
      moods: t.moods,
      contexts: t.contexts,
      fineGenre: t.fineGenre,
      references: t.references,
      comment: t.comment,
      isBomb: t.isBomb,
    })),
  };
}

// ---------- Tests ----------

describe('FR-054 — sync preserva campos autorais (Princípio I)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    ctx = await createTestDb();
    // Substitui o singleton @/db pelo DB in-memory deste teste
    vi.doMock('@/db', () => ({ db: ctx.db }));
    // Substitui o cliente Discogs para não chamar PAT encryption/decryption real
    vi.doMock('@/lib/discogs/client', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/discogs/client')>();
      return {
        ...actual,
        fetchCollectionPage: async () => ({
          pagination: { page: 1, pages: 1, per_page: 100, items: 1 },
          releases: [{ id: 12345, date_added: new Date().toISOString() }],
        }),
        fetchRelease: async () => ({
          id: 12345,
          artist: 'HACKER',
          title: 'OUTRO TITULO',
          year: 1900,
          label: 'LABEL DIFERENTE',
          country: 'XX',
          format: 'CD, Single',
          coverUrl: 'https://evil.example/cover.jpg',
          genres: ['Novo Gênero'],
          styles: ['Novo Estilo'],
          tracklist: [
            { position: 'A1', title: 'Título mudou', duration: '9:99' },
            { position: 'A2', title: 'Outra que mudou', duration: '1:23' },
          ],
        }),
        validateCredential: async () => true,
      };
    });
    installFetchMock();
  });

  afterEach(() => {
    vi.doUnmock('@/db');
    vi.doUnmock('@/lib/discogs/client');
    vi.unstubAllGlobals();
    vi.resetModules();
    ctx.client.close();
  });

  it('applyDiscogsUpdate (isNew=false) preserva status/shelfLocation/notes do record e todos os campos autorais das faixas', async () => {
    const { userId, recordId, trackId1 } = await seedUserWithCuratedTrack(ctx.db);
    const before = await snapshotAuthorFields(ctx.db, recordId);

    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');
    await applyDiscogsUpdate(
      userId,
      {
        id: 12345,
        artist: 'HACKER',
        title: 'OUTRO TITULO',
        year: 1900,
        label: 'LABEL DIFERENTE',
        country: 'XX',
        format: 'CD, Single',
        coverUrl: 'https://evil.example/cover.jpg',
        genres: ['Novo Gênero'],
        styles: ['Novo Estilo'],
        tracklist: [
          { position: 'A1', title: 'Título mudou', duration: '9:99' },
          { position: 'A2', title: 'Outra que mudou', duration: '1:23' },
        ],
      },
      { isNew: false },
    );

    const after = await snapshotAuthorFields(ctx.db, recordId);

    // Record: autorais intactos
    expect(after.record.status).toBe(before.record.status);
    expect(after.record.shelfLocation).toBe(before.record.shelfLocation);
    expect(after.record.notes).toBe(before.record.notes);
    expect(after.record.archived).toBe(before.record.archived);

    // Tracks: TODOS os campos autorais intactos
    for (let i = 0; i < before.tracks.length; i++) {
      const b = before.tracks[i];
      const a = after.tracks.find((t) => t.id === b.id);
      expect(a, `Track ${b.id} deveria existir após sync`).toBeDefined();
      expect(a!.selected, `selected preservado #${b.id}`).toBe(b.selected);
      expect(a!.bpm, `bpm preservado #${b.id}`).toBe(b.bpm);
      expect(a!.musicalKey, `musicalKey preservado #${b.id}`).toBe(b.musicalKey);
      expect(a!.energy, `energy preservado #${b.id}`).toBe(b.energy);
      expect(a!.rating, `rating preservado #${b.id}`).toBe(b.rating);
      expect(a!.moods, `moods preservado #${b.id}`).toEqual(b.moods);
      expect(a!.contexts, `contexts preservado #${b.id}`).toEqual(b.contexts);
      expect(a!.fineGenre, `fineGenre preservado #${b.id}`).toBe(b.fineGenre);
      expect(a!.references, `references preservado #${b.id}`).toBe(b.references);
      expect(a!.comment, `comment preservado #${b.id}`).toBe(b.comment);
      expect(a!.isBomb, `isBomb preservado #${b.id}`).toBe(b.isBomb);
    }

    // Espelho Discogs atualizado (título/label vieram do mock)
    const schema = await import('@/db/schema');
    const [r] = await ctx.db.select().from(schema.records).where(eq(schema.records.id, recordId));
    expect(r.title).toBe('OUTRO TITULO');
    expect(r.label).toBe('LABEL DIFERENTE');
    expect(r.year).toBe(1900);

    // Track 1 teve título Discogs atualizado também
    const [updatedTrack] = await ctx.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, trackId1));
    expect(updatedTrack.title).toBe('Título mudou');
  });

  it('FR-037b: faixa reaparecendo no Discogs reseta conflict=false preservando autorais', async () => {
    const { userId, recordId, trackId1 } = await seedUserWithCuratedTrack(ctx.db);

    // Simula que a faixa A1 estava em conflito (Discogs tinha removido antes)
    const schema = await import('@/db/schema');
    await ctx.db
      .update(schema.tracks)
      .set({ conflict: true, conflictDetectedAt: new Date() })
      .where(eq(schema.tracks.id, trackId1));

    const before = await snapshotAuthorFields(ctx.db, recordId);

    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');
    await applyDiscogsUpdate(
      userId,
      {
        id: 12345,
        artist: 'x',
        title: 'x',
        year: null,
        label: null,
        country: null,
        format: null,
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [
          { position: 'A1', title: 'A1 de volta', duration: null },
          { position: 'A2', title: 'A2', duration: null },
        ],
      },
      { isNew: false },
    );

    const [t1] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId1));
    expect(t1.conflict).toBe(false);
    expect(t1.conflictDetectedAt).toBeNull();

    // Autorais permanecem intactos
    const after = await snapshotAuthorFields(ctx.db, recordId);
    const a = after.tracks.find((t) => t.id === trackId1)!;
    const b = before.tracks.find((t) => t.id === trackId1)!;
    expect(a.selected).toBe(b.selected);
    expect(a.bpm).toBe(b.bpm);
    expect(a.rating).toBe(b.rating);
    expect(a.isBomb).toBe(b.isBomb);
    expect(a.moods).toEqual(b.moods);
  });

  it('FR-037b: disco archived reaparecendo reseta archived=false preservando autorais', async () => {
    const { userId, recordId } = await seedUserWithCuratedTrack(ctx.db);

    const schema = await import('@/db/schema');
    await ctx.db
      .update(schema.records)
      .set({
        archived: true,
        archivedAt: new Date(),
        archivedAcknowledgedAt: new Date(),
      })
      .where(eq(schema.records.id, recordId));

    const before = await snapshotAuthorFields(ctx.db, recordId);

    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');
    await applyDiscogsUpdate(
      userId,
      {
        id: 12345,
        artist: 'x',
        title: 'x',
        year: null,
        label: null,
        country: null,
        format: null,
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [
          { position: 'A1', title: 'A1', duration: null },
          { position: 'A2', title: 'A2', duration: null },
        ],
      },
      { isNew: false },
    );

    const [r] = await ctx.db.select().from(schema.records).where(eq(schema.records.id, recordId));
    expect(r.archived).toBe(false);
    expect(r.archivedAt).toBeNull();
    expect(r.archivedAcknowledgedAt).toBeNull();

    const after = await snapshotAuthorFields(ctx.db, recordId);
    expect(after.record.status).toBe(before.record.status);
    expect(after.record.shelfLocation).toBe(before.record.shelfLocation);
    expect(after.record.notes).toBe(before.record.notes);
  });

  it('FR-037: faixa removida do Discogs vira conflict=true preservando autorais', async () => {
    const { userId, recordId, trackId2 } = await seedUserWithCuratedTrack(ctx.db);

    const before = await snapshotAuthorFields(ctx.db, recordId);

    const { applyDiscogsUpdate } = await import('@/lib/discogs/apply-update');
    await applyDiscogsUpdate(
      userId,
      {
        id: 12345,
        artist: 'x',
        title: 'x',
        year: null,
        label: null,
        country: null,
        format: null,
        coverUrl: null,
        genres: [],
        styles: [],
        tracklist: [
          // só A1; A2 sumiu
          { position: 'A1', title: 'A1', duration: null },
        ],
      },
      { isNew: false },
    );

    const schema = await import('@/db/schema');
    const [t2] = await ctx.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId2));
    expect(t2.conflict).toBe(true);
    expect(t2.conflictDetectedAt).not.toBeNull();

    // Mesmo em conflito, autorais preservados
    const after = await snapshotAuthorFields(ctx.db, recordId);
    const a = after.tracks.find((t) => t.id === trackId2)!;
    const b = before.tracks.find((t) => t.id === trackId2)!;
    expect(a.selected).toBe(b.selected);
    expect(a.bpm).toBe(b.bpm);
    expect(a.rating).toBe(b.rating);
  });
});
