import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

export type CurrentUser = {
  id: number;
  clerkUserId: string;
  email: string;
  discogsUsername: string | null;
  discogsTokenEncrypted: string | null;
  discogsCredentialStatus: 'valid' | 'invalid';
  needsOnboarding: boolean;
};

/**
 * Resolve o usuário autenticado atual.
 *
 * Contratos:
 * - Retorna `null` apenas se NÃO há sessão Clerk.
 * - Se há sessão mas a linha local em `users` ainda não existe (race com webhook),
 *   cria a linha com email vazio e a retorna. O webhook `user.updated` atualiza
 *   o email posteriormente. NUNCA retorna `null` quando há userId válido.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  // Tenta achar
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (existing.length > 0) {
    return toCurrentUser(existing[0]);
  }

  // Não existe — provisiona agora para não travar o fluxo.
  // Email pode vir em branco se `currentUser()` falhar; webhook atualiza depois.
  let email = '';
  try {
    const cu = await currentUser();
    email = cu?.emailAddresses?.[0]?.emailAddress ?? '';
  } catch (err) {
    console.warn('[auth] currentUser() falhou, seguindo sem email:', err);
  }

  try {
    await db.insert(users).values({ clerkUserId, email });
  } catch (err) {
    // Se houve conflito (outro request criou ao mesmo tempo), ignoramos e releremos
    console.warn('[auth] insert users conflito ou erro:', err);
  }

  const created = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (created.length === 0) {
    // Estado impossível se a tabela estiver OK; log loud e retorna null para evitar loop.
    console.error('[auth] users row missing após insert para clerkUserId', clerkUserId);
    return null;
  }

  return toCurrentUser(created[0]);
}

function toCurrentUser(u: typeof users.$inferSelect): CurrentUser {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    discogsUsername: u.discogsUsername,
    discogsTokenEncrypted: u.discogsTokenEncrypted,
    discogsCredentialStatus: u.discogsCredentialStatus,
    needsOnboarding: !u.discogsUsername || !u.discogsTokenEncrypted,
  };
}

/** Versão "ou lança" — usar em rotas que já passam pelo middleware protegido. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user;
}
