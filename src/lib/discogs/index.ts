import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

export * from './client';

/**
 * Marca a credencial Discogs do usuário como inválida (FR-044).
 * Chamado por jobs de sync quando recebem HTTP 401.
 */
export async function markCredentialInvalid(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ discogsCredentialStatus: 'invalid', updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Reverte o status para `valid` após uma chamada de teste bem-sucedida (FR-046).
 */
export async function markCredentialValid(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ discogsCredentialStatus: 'valid', updatedAt: new Date() })
    .where(eq(users.id, userId));
}
