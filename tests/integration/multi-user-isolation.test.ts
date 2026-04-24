import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  users,
  records,
  tracks,
  sets,
  setTracks,
  syncRuns,
} from '@/db/schema';
import { createTestDb } from '../helpers/test-db';

/**
 * US1 / FR-006..007 — isolamento entre users (002-multi-conta).
 *
 * Regressão: nenhuma query scoped deve retornar dados de outros users,
 * mesmo quando IDs são forçados ou cascade operações acontecem.
 */
describe('multi-user isolation', () => {
  async function seed() {
    const { db, client } = await createTestDb();
    const [alice] = await db
      .insert(users)
      .values({
        clerkUserId: 'u_alice',
        email: 'alice@ex.com',
        allowlisted: true,
      })
      .returning({ id: users.id });
    const [bob] = await db
      .insert(users)
      .values({
        clerkUserId: 'u_bob',
        email: 'bob@ex.com',
        allowlisted: true,
      })
      .returning({ id: users.id });

    const [aliceRec] = await db
      .insert(records)
      .values({
        userId: alice.id,
        discogsId: 100,
        artist: 'Alice Band',
        title: 'Alice LP',
        status: 'active',
      })
      .returning({ id: records.id });
    const [bobRec] = await db
      .insert(records)
      .values({
        userId: bob.id,
        discogsId: 200,
        artist: 'Bob Trio',
        title: 'Bob LP',
        status: 'unrated',
      })
      .returning({ id: records.id });

    const [aliceTrk] = await db
      .insert(tracks)
      .values({ recordId: aliceRec.id, position: 'A1', title: 'A track' })
      .returning({ id: tracks.id });
    const [bobTrk] = await db
      .insert(tracks)
      .values({ recordId: bobRec.id, position: 'A1', title: 'B track' })
      .returning({ id: tracks.id });

    const [aliceSet] = await db
      .insert(sets)
      .values({ userId: alice.id, name: 'Alice set' })
      .returning({ id: sets.id });
    const [bobSet] = await db
      .insert(sets)
      .values({ userId: bob.id, name: 'Bob set' })
      .returning({ id: sets.id });

    await db.insert(setTracks).values([
      { setId: aliceSet.id, trackId: aliceTrk.id, order: 0 },
      { setId: bobSet.id, trackId: bobTrk.id, order: 0 },
    ]);

    await db.insert(syncRuns).values([
      { userId: alice.id, kind: 'initial_import', outcome: 'ok' },
      { userId: bob.id, kind: 'initial_import', outcome: 'ok' },
    ]);

    return { db, client, alice, bob, aliceRec, bobRec, aliceTrk, bobTrk };
  }

  it('records scoped: WHERE user_id=A não retorna linhas de B', async () => {
    const { db, alice, bob } = await seed();
    const alicesRecords = await db
      .select()
      .from(records)
      .where(eq(records.userId, alice.id));
    expect(alicesRecords).toHaveLength(1);
    expect(alicesRecords[0].artist).toBe('Alice Band');
    expect(alicesRecords[0].userId).toBe(alice.id);
    expect(alicesRecords[0].userId).not.toBe(bob.id);
  });

  it('sets scoped: user_id isola', async () => {
    const { db, alice } = await seed();
    const alicesSets = await db
      .select()
      .from(sets)
      .where(eq(sets.userId, alice.id));
    expect(alicesSets).toHaveLength(1);
    expect(alicesSets[0].name).toBe('Alice set');
  });

  it('sync_runs scoped: user_id isola', async () => {
    const { db, bob } = await seed();
    const bobsRuns = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.userId, bob.id));
    expect(bobsRuns).toHaveLength(1);
  });

  it('tracks do user A não aparecem ao filtrar records por user B', async () => {
    const { db, bob } = await seed();
    // Query com JOIN implícito: tracks acessíveis via records do Bob
    const tracksOfBob = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        userId: records.userId,
      })
      .from(tracks)
      .innerJoin(records, eq(tracks.recordId, records.id))
      .where(eq(records.userId, bob.id));
    expect(tracksOfBob).toHaveLength(1);
    expect(tracksOfBob[0].title).toBe('B track');
    expect(tracksOfBob[0].userId).toBe(bob.id);
  });

  it('ao apagar Alice, records/tracks/sets/sync_runs dela somem via cascade; Bob intacto', async () => {
    const { db, alice, bob } = await seed();
    await db.delete(users).where(eq(users.id, alice.id));

    const remaining = await db.select().from(records);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(bob.id);

    const remainingSets = await db.select().from(sets);
    expect(remainingSets).toHaveLength(1);
    expect(remainingSets[0].userId).toBe(bob.id);

    const remainingRuns = await db.select().from(syncRuns);
    expect(remainingRuns).toHaveLength(1);
    expect(remainingRuns[0].userId).toBe(bob.id);

    // Tracks do Alice também somem (via cascade records)
    const remainingTracks = await db.select().from(tracks);
    expect(remainingTracks).toHaveLength(1);
  });

  it('tentar buscar record do A via id em query sem scope retorna record, mas scope filtra', async () => {
    const { db, aliceRec, bob } = await seed();
    // Sem scope: query direta pelo ID traz
    const byIdOnly = await db
      .select()
      .from(records)
      .where(eq(records.id, aliceRec.id));
    expect(byIdOnly).toHaveLength(1);

    // Com scope do Bob: não traz
    const byIdScoped = await db
      .select()
      .from(records)
      .where(eq(records.userId, bob.id));
    expect(byIdScoped.find((r) => r.id === aliceRec.id)).toBeUndefined();
  });
});
