import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { invites, users } from '@/db/schema';
import * as schema from '@/db/schema';

/**
 * Helpers testáveis de allowlist + owner promotion (002-multi-conta).
 *
 * Ficam fora de Server Actions ou do webhook em si para poderem ser
 * exercitados em tests de integração sem mocks de Clerk/Svix.
 *
 * Recebem `db` explicitamente para permitir swap com in-memory durante
 * testes; em produção, o caller injeta o singleton de `@/db`.
 */

export type DbHandle = LibSQLDatabase<typeof schema>;

/** Case-insensitive lookup em invites. */
export async function isEmailInvited(
  dbHandle: DbHandle,
  email: string,
): Promise<boolean> {
  if (!email) return false;
  const rows = await dbHandle
    .select({ id: invites.id })
    .from(invites)
    .where(sql`LOWER(${invites.email}) = LOWER(${email})`)
    .limit(1);
  return rows.length > 0;
}

/**
 * Decide se este user qualifica pra promoção a owner (FR-012).
 * Condições: email verified + bate (case-insensitive) com OWNER_EMAIL
 * + ainda ninguém é owner.
 */
export async function qualifiesAsOwner(
  dbHandle: DbHandle,
  params: { email: string; verified: boolean; ownerEmail: string | undefined },
): Promise<boolean> {
  const { email, verified, ownerEmail } = params;
  if (!verified || !email || !ownerEmail) return false;
  if (email.toLowerCase() !== ownerEmail.toLowerCase()) return false;
  const existingOwner = await dbHandle
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isOwner, true))
    .limit(1);
  return existingOwner.length === 0;
}
