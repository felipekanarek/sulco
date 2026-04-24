import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { users, invites } from '@/db/schema';
import { isEmailInvited, qualifiesAsOwner } from '@/lib/allowlist';
import { createTestDb } from '../helpers/test-db';

/**
 * US1 / FR-001..005 — allowlist interna (002-multi-conta).
 *
 * Testa o comportamento das funções puras `isEmailInvited` +
 * `qualifiesAsOwner`, e a lógica de sync entre `invites` e
 * `users.allowlisted` que o webhook e as Server Actions implementam.
 */
describe('allowlist flow', () => {
  it('isEmailInvited retorna false para email ausente', async () => {
    const { db } = await createTestDb();
    expect(await isEmailInvited(db, '')).toBe(false);
    expect(await isEmailInvited(db, 'nao-existe@exemplo.com')).toBe(false);
  });

  it('isEmailInvited retorna true quando email está em invites (case-insensitive)', async () => {
    const { db } = await createTestDb();
    await db.insert(invites).values({ email: 'amigo@exemplo.com' });
    expect(await isEmailInvited(db, 'amigo@exemplo.com')).toBe(true);
    expect(await isEmailInvited(db, 'AMIGO@Exemplo.COM')).toBe(true);
  });

  it('user criado com email em invites fica allowlisted=true (simula webhook)', async () => {
    const { db } = await createTestDb();
    await db.insert(invites).values({ email: 'invited@ex.com' });

    // Simula a lógica do webhook user.created
    const invited = await isEmailInvited(db, 'invited@ex.com');
    await db.insert(users).values({
      clerkUserId: 'user_a',
      email: 'invited@ex.com',
      allowlisted: invited,
    });

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_a'));
    expect(u.allowlisted).toBe(true);
  });

  it('user criado sem invite fica allowlisted=false', async () => {
    const { db } = await createTestDb();

    const invited = await isEmailInvited(db, 'estranho@ex.com');
    await db.insert(users).values({
      clerkUserId: 'user_b',
      email: 'estranho@ex.com',
      allowlisted: invited,
    });

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_b'));
    expect(u.allowlisted).toBe(false);
  });

  it('addInvite promove user existente retroativamente (simula Server Action)', async () => {
    const { db } = await createTestDb();
    // user já existia antes do convite
    await db.insert(users).values({
      clerkUserId: 'user_c',
      email: 'ainda-nao@ex.com',
      allowlisted: false,
    });

    // Simula addInvite: INSERT invites + UPDATE users SET allowlisted=true
    await db
      .insert(invites)
      .values({ email: 'ainda-nao@ex.com' })
      .onConflictDoNothing({ target: invites.email });
    await db
      .update(users)
      .set({ allowlisted: true })
      .where(sql`LOWER(${users.email}) = 'ainda-nao@ex.com'`);

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_c'));
    expect(u.allowlisted).toBe(true);
  });

  it('removeInvite desaloca user (mas NÃO desaloca owner)', async () => {
    const { db } = await createTestDb();
    await db.insert(invites).values({ email: 'dj@ex.com' });
    await db.insert(users).values([
      {
        clerkUserId: 'user_dj',
        email: 'dj@ex.com',
        allowlisted: true,
      },
      {
        clerkUserId: 'user_owner',
        email: 'owner@ex.com',
        isOwner: true,
        allowlisted: true,
      },
    ]);

    // Simula removeInvite com email do DJ comum
    await db.delete(invites).where(sql`LOWER(${invites.email}) = 'dj@ex.com'`);
    await db
      .update(users)
      .set({ allowlisted: false })
      .where(
        and(
          sql`LOWER(${users.email}) = 'dj@ex.com'`,
          eq(users.isOwner, false),
        ),
      );

    const [dj] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_dj'));
    expect(dj.allowlisted).toBe(false);

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_owner'));
    // Owner sempre allowlisted (invariante I4)
    expect(owner.allowlisted).toBe(true);

    // Tentativa paralela: removeInvite também funcionaria no owner se o
    // owner estivesse na lista? A lógica filtra is_owner=false, então owner
    // passa ileso. Garantimos com um segundo cenário:
    await db.insert(invites).values({ email: 'owner@ex.com' });
    await db.delete(invites).where(sql`LOWER(${invites.email}) = 'owner@ex.com'`);
    await db
      .update(users)
      .set({ allowlisted: false })
      .where(
        and(
          sql`LOWER(${users.email}) = 'owner@ex.com'`,
          eq(users.isOwner, false),
        ),
      );
    const [ownerAfter] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, 'user_owner'));
    expect(ownerAfter.allowlisted).toBe(true);
  });

  it('invites.email é UNIQUE — não permite duplicata', async () => {
    const { db, client } = await createTestDb();
    await db.insert(invites).values({ email: 'dup@ex.com' });
    await expect(
      client.execute(`INSERT INTO invites (email) VALUES ('dup@ex.com')`),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('qualifiesAsOwner bate quando email verified + igual OWNER_EMAIL + nenhum owner', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'boss@ex.com',
      verified: true,
      ownerEmail: 'boss@ex.com',
    });
    expect(ok).toBe(true);
  });

  it('qualifiesAsOwner rejeita email não-verified mesmo batendo com OWNER_EMAIL', async () => {
    const { db } = await createTestDb();
    const ok = await qualifiesAsOwner(db, {
      email: 'boss@ex.com',
      verified: false,
      ownerEmail: 'boss@ex.com',
    });
    expect(ok).toBe(false);
  });
});
