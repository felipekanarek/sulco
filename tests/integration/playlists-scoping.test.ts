import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  users,
  records,
  tracks,
  playlists,
  playlistTracks,
} from '@/db/schema';
import { createTestDb } from '../helpers/test-db';

/**
 * US4 — playlists com user_id (dívida audit 002-multi-conta).
 *
 * Invariantes validadas:
 * - NOT NULL + FK em `playlists.user_id` e `playlist_tracks.user_id`.
 * - ON DELETE CASCADE remove playlists e playlist_tracks quando
 *   o user é deletado.
 * - Isolamento por user_id em queries.
 */
describe('US4 — playlists scoping', () => {
  async function seedTwoUsersWithOneRecordEach() {
    const { db, client } = await createTestDb();

    const [alice] = await db
      .insert(users)
      .values({ clerkUserId: 'user_alice', email: 'alice@example.com' })
      .returning({ id: users.id });
    const [bob] = await db
      .insert(users)
      .values({ clerkUserId: 'user_bob', email: 'bob@example.com' })
      .returning({ id: users.id });

    const [aliceRec] = await db
      .insert(records)
      .values({ userId: alice.id, discogsId: 1, artist: 'A', title: 'Disc A' })
      .returning({ id: records.id });
    const [bobRec] = await db
      .insert(records)
      .values({ userId: bob.id, discogsId: 2, artist: 'B', title: 'Disc B' })
      .returning({ id: records.id });

    const [aliceTrk] = await db
      .insert(tracks)
      .values({ recordId: aliceRec.id, position: 'A1', title: 'Alice track' })
      .returning({ id: tracks.id });
    const [bobTrk] = await db
      .insert(tracks)
      .values({ recordId: bobRec.id, position: 'A1', title: 'Bob track' })
      .returning({ id: tracks.id });

    return { db, client, alice, bob, aliceTrk, bobTrk };
  }

  it('NOT NULL em playlists.user_id impede INSERT sem user_id', async () => {
    const { client } = await createTestDb();
    await expect(
      client.execute(`INSERT INTO playlists (name) VALUES ('sem user')`),
    ).rejects.toThrow(/NOT NULL|NULL constraint/i);
  });

  it('NOT NULL em playlist_tracks.user_id impede INSERT sem user_id', async () => {
    const { db, client, alice, aliceTrk } = await seedTwoUsersWithOneRecordEach();
    const [pl] = await db
      .insert(playlists)
      .values({ userId: alice.id, name: 'minha' })
      .returning({ id: playlists.id });
    await expect(
      client.execute(
        `INSERT INTO playlist_tracks (playlist_id, track_id, "order") VALUES (${pl.id}, ${aliceTrk.id}, 0)`,
      ),
    ).rejects.toThrow(/NOT NULL|NULL constraint/i);
  });

  it('INSERT com user_id válido sucede', async () => {
    const { db, alice, aliceTrk } = await seedTwoUsersWithOneRecordEach();
    const [pl] = await db
      .insert(playlists)
      .values({ userId: alice.id, name: 'alice list' })
      .returning({ id: playlists.id });
    await db.insert(playlistTracks).values({
      playlistId: pl.id,
      trackId: aliceTrk.id,
      userId: alice.id,
      order: 0,
    });
    const rows = await db.select().from(playlistTracks);
    expect(rows.length).toBe(1);
  });

  it('DELETE em cascata de user remove playlists e playlist_tracks', async () => {
    const { db, alice, aliceTrk } = await seedTwoUsersWithOneRecordEach();
    const [pl] = await db
      .insert(playlists)
      .values({ userId: alice.id, name: 'alice list' })
      .returning({ id: playlists.id });
    await db.insert(playlistTracks).values({
      playlistId: pl.id,
      trackId: aliceTrk.id,
      userId: alice.id,
      order: 0,
    });

    // baseline
    expect((await db.select().from(playlists)).length).toBe(1);
    expect((await db.select().from(playlistTracks)).length).toBe(1);

    // apaga Alice
    await db.delete(users).where(eq(users.id, alice.id));

    // cascade limpou tudo que era dela
    expect((await db.select().from(playlists)).length).toBe(0);
    expect((await db.select().from(playlistTracks)).length).toBe(0);
  });

  it('query scoped WHERE user_id = A nunca retorna linhas do user B', async () => {
    const { db, alice, bob, aliceTrk, bobTrk } = await seedTwoUsersWithOneRecordEach();
    const [aPl] = await db
      .insert(playlists)
      .values({ userId: alice.id, name: 'alice list' })
      .returning({ id: playlists.id });
    const [bPl] = await db
      .insert(playlists)
      .values({ userId: bob.id, name: 'bob list' })
      .returning({ id: playlists.id });
    await db.insert(playlistTracks).values([
      { playlistId: aPl.id, trackId: aliceTrk.id, userId: alice.id, order: 0 },
      { playlistId: bPl.id, trackId: bobTrk.id, userId: bob.id, order: 0 },
    ]);

    const alicesPlaylists = await db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, alice.id));
    expect(alicesPlaylists.length).toBe(1);
    expect(alicesPlaylists[0].name).toBe('alice list');

    const alicesTracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.userId, alice.id));
    expect(alicesTracks.length).toBe(1);
    expect(alicesTracks[0].trackId).toBe(aliceTrk.id);
  });

  it('deletar user A não afeta playlists do user B', async () => {
    const { db, alice, bob, aliceTrk, bobTrk } = await seedTwoUsersWithOneRecordEach();
    await db.insert(playlists).values({ userId: alice.id, name: 'alice' });
    const [bPl] = await db
      .insert(playlists)
      .values({ userId: bob.id, name: 'bob' })
      .returning({ id: playlists.id });
    await db.insert(playlistTracks).values({
      playlistId: bPl.id,
      trackId: bobTrk.id,
      userId: bob.id,
      order: 0,
    });

    await db.delete(users).where(eq(users.id, alice.id));

    const remaining = await db.select().from(playlists);
    expect(remaining.length).toBe(1);
    expect(remaining[0].userId).toBe(bob.id);
    const remainingTracks = await db.select().from(playlistTracks);
    expect(remainingTracks.length).toBe(1);
    expect(remainingTracks[0].userId).toBe(bob.id);
    // evita warning de variável aliceTrk não usada no cenário feliz
    void aliceTrk;
  });
});
