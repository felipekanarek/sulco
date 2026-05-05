/**
 * Inc 37 (034) — Fixture compartilhado para testes integration.
 *
 * Cria 2 users + 5 records + 5 tracks + 1 set + pivots Inc 35/36
 * + user_facets + user_vocab populados, conforme spec data-model.md.
 *
 * Usage:
 * ```ts
 * import { createTestDb } from './helpers/test-db';
 * import { seedCollectionFixture } from './helpers/seed-collection';
 *
 * const ctx = await createTestDb();
 * const seed = await seedCollectionFixture(ctx.db);
 * // seed.u1, seed.u2, seed.r1..r5, seed.t1..t5, seed.s1
 * ```
 *
 * Usado por Tier 1 (cenários de ownership-fail u2 → u1) e Tier 2
 * (equivalence assertions sobre buildCollectionFilters).
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

export type SeedResult = {
  u1: number; // owner — todos os records/tracks/set
  u2: number; // outro user — usado em ownership-fail tests
  r1: number; // Vinyl, LP | Funk, Soul | AOR | 1985 | BR | Polydor | E1 | active
  r2: number; // Vinyl, 7" | Rock | Punk | 1979 | UK | EMI | E2 | unrated
  r3: number; // CD | Jazz | Bebop | 1995 | US | Blue Note | E1 | active
  r4: number; // Vinyl, LP | Eletronic | House | 2010 | DE | Kompakt | E3 | discarded
  r5: number; // Vinyl, 12" | Hip Hop | Boom Bap | 1992 | US | Def Jam | E2 | active
  t1: number; // r1 A1 selected, BPM 120, 8A, energy 4, rating 3, moods solar+festivo, contexts pico, isBomb true
  t2: number; // r2 A1 selected, BPM 145, 4A, energy 5, rating 2, moods agressivo, contexts fechamento
  t3: number; // r3 A1 unselected, BPM 90, 12A, energy 2, moods calmo, contexts abertura
  t4: number; // r4 A1 selected, BPM 128, 6A, energy 5, rating 3, moods hipnótico, contexts pico
  t5: number; // r5 A1 selected, BPM 95, 10A, energy 3, rating 1, moods bruto, contexts meio
  s1: number; // set "Set teste" do u1 com t1+t2+t5
};

export async function seedCollectionFixture(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: LibSQLDatabase<any>,
): Promise<SeedResult> {
  const schema = await import('@/db/schema');

  // 2 users
  const [u1Row] = await db
    .insert(schema.users)
    .values({
      clerkUserId: 'user_test_owner',
      email: 'felipe@example.com',
      discogsUsername: 'felipekanarek',
    })
    .returning();
  const [u2Row] = await db
    .insert(schema.users)
    .values({
      clerkUserId: 'user_test_other',
      email: 'other@example.com',
      discogsUsername: 'other',
    })
    .returning();

  const u1 = u1Row.id;
  const u2 = u2Row.id;

  // 5 records do u1
  const recordSeeds: Array<typeof schema.records.$inferInsert> = [
    {
      userId: u1,
      discogsId: 1001,
      artist: 'A1',
      title: 'T1',
      year: 1985,
      label: 'Polydor',
      country: 'BR',
      format: 'Vinyl, LP',
      genres: ['Funk', 'Soul'],
      styles: ['AOR'],
      status: 'active',
      shelfLocation: 'E1',
      searchText: 'a1 t1 polydor',
    },
    {
      userId: u1,
      discogsId: 1002,
      artist: 'A2',
      title: 'T2',
      year: 1979,
      label: 'EMI',
      country: 'UK',
      format: 'Vinyl, 7"',
      genres: ['Rock'],
      styles: ['Punk'],
      status: 'unrated',
      shelfLocation: 'E2',
      searchText: 'a2 t2 emi',
    },
    {
      userId: u1,
      discogsId: 1003,
      artist: 'A3',
      title: 'T3',
      year: 1995,
      label: 'Blue Note',
      country: 'US',
      format: 'CD',
      genres: ['Jazz'],
      styles: ['Bebop'],
      status: 'active',
      shelfLocation: 'E1',
      searchText: 'a3 t3 blue note',
    },
    {
      userId: u1,
      discogsId: 1004,
      artist: 'A4',
      title: 'T4',
      year: 2010,
      label: 'Kompakt',
      country: 'DE',
      format: 'Vinyl, LP',
      genres: ['Eletronic'],
      styles: ['House'],
      status: 'discarded',
      shelfLocation: 'E3',
      searchText: 'a4 t4 kompakt',
    },
    {
      userId: u1,
      discogsId: 1005,
      artist: 'A5',
      title: 'T5',
      year: 1992,
      label: 'Def Jam',
      country: 'US',
      format: 'Vinyl, 12"',
      genres: ['Hip Hop'],
      styles: ['Boom Bap'],
      status: 'active',
      shelfLocation: 'E2',
      searchText: 'a5 t5 def jam',
    },
  ];
  const recordRows = await db.insert(schema.records).values(recordSeeds).returning();
  const [r1, r2, r3, r4, r5] = recordRows.map((r) => r.id);

  // 5 tracks (1 por record, posição A1)
  const trackSeeds: Array<typeof schema.tracks.$inferInsert> = [
    {
      recordId: r1,
      position: 'A1',
      title: 'tk1',
      selected: true,
      bpm: 120,
      musicalKey: '8A',
      energy: 4,
      rating: 3,
      moods: ['solar', 'festivo'],
      contexts: ['pico'],
      isBomb: true,
    },
    {
      recordId: r2,
      position: 'A1',
      title: 'tk2',
      selected: true,
      bpm: 145,
      musicalKey: '4A',
      energy: 5,
      rating: 2,
      moods: ['agressivo'],
      contexts: ['fechamento'],
    },
    {
      recordId: r3,
      position: 'A1',
      title: 'tk3',
      selected: false,
      bpm: 90,
      musicalKey: '12A',
      energy: 2,
      moods: ['calmo'],
      contexts: ['abertura'],
    },
    {
      recordId: r4,
      position: 'A1',
      title: 'tk4',
      selected: true,
      bpm: 128,
      musicalKey: '6A',
      energy: 5,
      rating: 3,
      moods: ['hipnótico'],
      contexts: ['pico'],
    },
    {
      recordId: r5,
      position: 'A1',
      title: 'tk5',
      selected: true,
      bpm: 95,
      musicalKey: '10A',
      energy: 3,
      rating: 1,
      moods: ['bruto'],
      contexts: ['meio'],
    },
  ];
  const trackRows = await db.insert(schema.tracks).values(trackSeeds).returning();
  const [t1, t2, t3, t4, t5] = trackRows.map((t) => t.id);

  // Pivots Inc 35 (record_genres + record_styles + track_moods + track_contexts)
  await db.insert(schema.recordGenres).values([
    { recordId: r1, genre: 'Funk' },
    { recordId: r1, genre: 'Soul' },
    { recordId: r2, genre: 'Rock' },
    { recordId: r3, genre: 'Jazz' },
    { recordId: r4, genre: 'Eletronic' },
    { recordId: r5, genre: 'Hip Hop' },
  ]);
  await db.insert(schema.recordStyles).values([
    { recordId: r1, style: 'AOR' },
    { recordId: r2, style: 'Punk' },
    { recordId: r3, style: 'Bebop' },
    { recordId: r4, style: 'House' },
    { recordId: r5, style: 'Boom Bap' },
  ]);
  await db.insert(schema.trackMoods).values([
    { trackId: t1, mood: 'solar' },
    { trackId: t1, mood: 'festivo' },
    { trackId: t2, mood: 'agressivo' },
    { trackId: t3, mood: 'calmo' },
    { trackId: t4, mood: 'hipnótico' },
    { trackId: t5, mood: 'bruto' },
  ]);
  await db.insert(schema.trackContexts).values([
    { trackId: t1, context: 'pico' },
    { trackId: t2, context: 'fechamento' },
    { trackId: t3, context: 'abertura' },
    { trackId: t4, context: 'pico' },
    { trackId: t5, context: 'meio' },
  ]);

  // Inc 36 — record_formats (tokenizado)
  await db.insert(schema.recordFormats).values([
    { recordId: r1, token: 'Vinyl' },
    { recordId: r1, token: 'LP' },
    { recordId: r2, token: 'Vinyl' },
    { recordId: r2, token: '7"' },
    { recordId: r3, token: 'CD' },
    { recordId: r4, token: 'Vinyl' },
    { recordId: r4, token: 'LP' },
    { recordId: r5, token: 'Vinyl' },
    { recordId: r5, token: '12"' },
  ]);

  // Set
  const [s1Row] = await db
    .insert(schema.sets)
    .values({
      userId: u1,
      name: 'Set teste',
      eventDate: new Date('2026-06-01'),
    })
    .returning();
  const s1 = s1Row.id;

  // Set tracks (s1 ↔ t1, t2, t5)
  await db.insert(schema.setTracks).values([
    { setId: s1, trackId: t1, order: 0 },
    { setId: s1, trackId: t2, order: 1 },
    { setId: s1, trackId: t5, order: 2 },
  ]);

  // user_facets do u1 (denormalização Inc 23)
  await db.insert(schema.userFacets).values({
    userId: u1,
    recordsTotal: 5,
    recordsActive: 3,
    recordsUnrated: 1,
    recordsDiscarded: 1,
    tracksSelectedTotal: 4,
  });
  await db.insert(schema.userFacets).values({
    userId: u2,
    recordsTotal: 0,
    recordsActive: 0,
    recordsUnrated: 0,
    recordsDiscarded: 0,
    tracksSelectedTotal: 0,
  });

  // user_vocab do u1 (Inc 33 — kinds derivados de records/tracks)
  // Cada term ganha ref_count = nº records/tracks usando.
  const vocabRows: Array<typeof schema.userVocab.$inferInsert> = [
    // genres
    { userId: u1, kind: 'genres', term: 'Funk', refCount: 1 },
    { userId: u1, kind: 'genres', term: 'Soul', refCount: 1 },
    { userId: u1, kind: 'genres', term: 'Rock', refCount: 1 },
    { userId: u1, kind: 'genres', term: 'Jazz', refCount: 1 },
    { userId: u1, kind: 'genres', term: 'Eletronic', refCount: 1 },
    { userId: u1, kind: 'genres', term: 'Hip Hop', refCount: 1 },
    // styles
    { userId: u1, kind: 'styles', term: 'AOR', refCount: 1 },
    { userId: u1, kind: 'styles', term: 'Punk', refCount: 1 },
    { userId: u1, kind: 'styles', term: 'Bebop', refCount: 1 },
    { userId: u1, kind: 'styles', term: 'House', refCount: 1 },
    { userId: u1, kind: 'styles', term: 'Boom Bap', refCount: 1 },
    // formats (tokenizado)
    { userId: u1, kind: 'formats', term: 'Vinyl', refCount: 4 },
    { userId: u1, kind: 'formats', term: 'LP', refCount: 2 },
    { userId: u1, kind: 'formats', term: '7"', refCount: 1 },
    { userId: u1, kind: 'formats', term: '12"', refCount: 1 },
    { userId: u1, kind: 'formats', term: 'CD', refCount: 1 },
    // countries
    { userId: u1, kind: 'countries', term: 'BR', refCount: 1 },
    { userId: u1, kind: 'countries', term: 'UK', refCount: 1 },
    { userId: u1, kind: 'countries', term: 'US', refCount: 2 },
    { userId: u1, kind: 'countries', term: 'DE', refCount: 1 },
    // labels
    { userId: u1, kind: 'labels', term: 'Polydor', refCount: 1 },
    { userId: u1, kind: 'labels', term: 'EMI', refCount: 1 },
    { userId: u1, kind: 'labels', term: 'Blue Note', refCount: 1 },
    { userId: u1, kind: 'labels', term: 'Kompakt', refCount: 1 },
    { userId: u1, kind: 'labels', term: 'Def Jam', refCount: 1 },
    // shelves
    { userId: u1, kind: 'shelves', term: 'E1', refCount: 2 },
    { userId: u1, kind: 'shelves', term: 'E2', refCount: 2 },
    { userId: u1, kind: 'shelves', term: 'E3', refCount: 1 },
    // moods (do tracks)
    { userId: u1, kind: 'moods', term: 'solar', refCount: 1 },
    { userId: u1, kind: 'moods', term: 'festivo', refCount: 1 },
    { userId: u1, kind: 'moods', term: 'agressivo', refCount: 1 },
    { userId: u1, kind: 'moods', term: 'calmo', refCount: 1 },
    { userId: u1, kind: 'moods', term: 'hipnótico', refCount: 1 },
    { userId: u1, kind: 'moods', term: 'bruto', refCount: 1 },
    // contexts
    { userId: u1, kind: 'contexts', term: 'pico', refCount: 2 },
    { userId: u1, kind: 'contexts', term: 'fechamento', refCount: 1 },
    { userId: u1, kind: 'contexts', term: 'abertura', refCount: 1 },
    { userId: u1, kind: 'contexts', term: 'meio', refCount: 1 },
  ];
  await db.insert(schema.userVocab).values(vocabRows);

  return { u1, u2, r1, r2, r3, r4, r5, t1, t2, t3, t4, t5, s1 };
}
