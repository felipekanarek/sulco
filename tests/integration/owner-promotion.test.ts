import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/db/schema';
import { qualifiesAsOwner } from '@/lib/allowlist';
import { createTestDb } from '../helpers/test-db';

/**
 * US1 / FR-012 — promoção de owner (002-multi-conta).
 *
 * Valida a função `qualifiesAsOwner` em todos os seus ramos de decisão
 * + simula a lógica do webhook que consome o resultado.
 */
describe('owner promotion', () => {
  it('email bate OWNER_EMAIL + verified + nenhum owner → promove', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'owner@ex.com',
      verified: true,
      ownerEmail: 'owner@ex.com',
    });
    expect(ok).toBe(true);

    // Simula webhook: cria user com isOwner=true + allowlisted=true
    await db.insert(users).values({
      clerkUserId: 'user_owner',
      email: 'owner@ex.com',
      isOwner: ok,
      allowlisted: ok,
    });
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_owner'));
    expect(u.isOwner).toBe(true);
    expect(u.allowlisted).toBe(true);
  });

  it('segundo user com mesmo email NÃO é promovido (owner já existe)', async () => {
    const { db } = await createTestDb();
    // Cria o owner primeiro
    await db.insert(users).values({
      clerkUserId: 'user_first',
      email: 'owner@ex.com',
      isOwner: true,
      allowlisted: true,
    });

    // Tentativa de promover segundo user
    const ok = await qualifiesAsOwner(db, {
      email: 'owner@ex.com',
      verified: true,
      ownerEmail: 'owner@ex.com',
    });
    expect(ok).toBe(false);
  });

  it('email não-verified não promove mesmo batendo com OWNER_EMAIL', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'owner@ex.com',
      verified: false,
      ownerEmail: 'owner@ex.com',
    });
    expect(ok).toBe(false);
  });

  it('email diferente de OWNER_EMAIL não promove', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'outro@ex.com',
      verified: true,
      ownerEmail: 'owner@ex.com',
    });
    expect(ok).toBe(false);
  });

  it('OWNER_EMAIL undefined/vazio nunca promove', async () => {
    const { db } = await createTestDb();
    expect(
      await qualifiesAsOwner(db, {
        email: 'x@ex.com',
        verified: true,
        ownerEmail: undefined,
      }),
    ).toBe(false);
  });

  it('comparação case-insensitive funciona', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'Owner@Ex.COM',
      verified: true,
      ownerEmail: 'owner@ex.com',
    });
    expect(ok).toBe(true);
  });

  it('único owner — tentar promover pela segunda vez é no-op (idempotência)', async () => {
    const { db } = await createTestDb();
    // Primeiro signup
    let ok = await qualifiesAsOwner(db, {
      email: 'boss@ex.com',
      verified: true,
      ownerEmail: 'boss@ex.com',
    });
    expect(ok).toBe(true);
    await db.insert(users).values({
      clerkUserId: 'u1',
      email: 'boss@ex.com',
      isOwner: true,
      allowlisted: true,
    });

    // Fake: um novo clerk user com mesmo email (não deveria acontecer na real,
    // mas testa o lock)
    ok = await qualifiesAsOwner(db, {
      email: 'boss@ex.com',
      verified: true,
      ownerEmail: 'boss@ex.com',
    });
    expect(ok).toBe(false);

    // Garante que apenas um owner existe após tentativa
    const owners = await db
      .select()
      .from(users)
      .where(eq(users.isOwner, true));
    expect(owners.length).toBe(1);
  });
});
