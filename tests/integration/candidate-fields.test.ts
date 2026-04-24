import { describe, expect, it } from 'vitest';
import { users, records, tracks } from '@/db/schema';
import { createTestDb } from '../helpers/test-db';

/**
 * 003-faixas-ricas-montar — valida que o tipo Candidate/query retorna
 * references e recordNotes novos (T001 + T002), e que o isolamento
 * por user_id permanece intacto (regressão do Princípio I).
 *
 * Nota: reproduzimos a lógica do SELECT em SQL bruto porque o
 * `queryCandidates` depende de autenticação Clerk via requireCurrentUser.
 * Aqui testamos o CONTRATO de dados: colunas corretas, join correto,
 * scoping por user_id preservado.
 */
describe('003 — candidate fields expansion', () => {
  async function seedTwoUsers() {
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
        discogsId: 1,
        artist: 'Alice Band',
        title: 'Alice LP',
        status: 'active',
        shelfLocation: 'E1-P2',
        notes: 'Bag dos sets de inverno 2026.\nLembrar da B3.',
      })
      .returning({ id: records.id });
    const [bobRec] = await db
      .insert(records)
      .values({
        userId: bob.id,
        discogsId: 2,
        artist: 'Bob Trio',
        title: 'Bob LP',
        status: 'active',
        shelfLocation: 'C3-P1',
        notes: 'Bob notes — só pra ele.',
      })
      .returning({ id: records.id });

    await db.insert(tracks).values([
      {
        recordId: aliceRec.id,
        position: 'A1',
        title: 'Alice track 1',
        selected: true,
        rating: 3,
        comment: 'fecha pista',
        references: 'lembra Floating Points',
        fineGenre: 'samba soul orquestral',
        moods: ['solar', 'festivo'],
        contexts: ['pico', 'festa diurna'],
      },
      {
        recordId: bobRec.id,
        position: 'A1',
        title: 'Bob track 1',
        selected: true,
        rating: 2,
        comment: 'abertura tranquila',
        references: 'lembra Four Tet',
        fineGenre: 'electronica minimal',
        moods: ['melancólico'],
        contexts: ['aquecimento'],
      },
    ]);

    return { db, client, alice, bob, aliceRec, bobRec };
  }

  it('records expõem notes e shelfLocation via join (expostos pelo query 003)', async () => {
    const { client, alice } = await seedTwoUsers();
    const rows = await client.execute({
      sql: `SELECT t.id, t."references" as track_references, r.notes as record_notes, r.shelf_location
            FROM tracks t
            INNER JOIN records r ON r.id = t.record_id
            WHERE r.user_id = ? AND t.selected = 1`,
      args: [alice.id],
    });
    expect(rows.rows.length).toBe(1);
    const row = rows.rows[0];
    expect(row.track_references).toBe('lembra Floating Points');
    expect(row.record_notes).toContain('inverno');
    expect(row.shelf_location).toBe('E1-P2');
  });

  it('scoping por user_id: query do Bob não retorna dados de Alice', async () => {
    const { client, bob, alice } = await seedTwoUsers();
    const rows = await client.execute({
      sql: `SELECT t.title, t."references" as track_references, r.notes as record_notes
            FROM tracks t
            INNER JOIN records r ON r.id = t.record_id
            WHERE r.user_id = ?`,
      args: [bob.id],
    });
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].title).toBe('Bob track 1');
    expect(rows.rows[0].track_references).toBe('lembra Four Tet');
    expect(rows.rows[0].record_notes).toBe('Bob notes — só pra ele.');
    // Confirma que dados do Alice não vazaram
    expect(
      rows.rows.find((r) => r.title === 'Alice track 1'),
    ).toBeUndefined();
    // Força uso da variável pra ficar explícito o propósito
    expect(alice.id).not.toBe(bob.id);
  });

  it('track.references null não quebra query', async () => {
    const { db, client, alice } = await seedTwoUsers();
    // Adiciona track sem references
    const [rec2] = await db
      .insert(records)
      .values({
        userId: alice.id,
        discogsId: 10,
        artist: 'X',
        title: 'Y',
        status: 'active',
      })
      .returning({ id: records.id });
    await db.insert(tracks).values({
      recordId: rec2.id,
      position: 'A1',
      title: 'Sem ref',
      selected: true,
    });
    const rows = await client.execute({
      sql: `SELECT t.title, t."references" as track_references
            FROM tracks t
            INNER JOIN records r ON r.id = t.record_id
            WHERE r.user_id = ? AND t.title = 'Sem ref'`,
      args: [alice.id],
    });
    expect(rows.rows[0].track_references).toBeNull();
  });
});
