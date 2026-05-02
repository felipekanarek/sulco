import 'server-only';
import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { users } from '@/db/schema';

/**
 * Email do owner do piloto (FR-012, 002-multi-conta). Lido de env.
 * Em produção deve estar presente; o webhook Clerk usa esse valor
 * para promover o primeiro user cujo email verified bata com ele.
 * Em dev é opcional — sem ele, `/admin` fica inacessível até alguém
 * ser manualmente marcado `is_owner=true` no Turso.
 */
export const OWNER_EMAIL: string | undefined =
  process.env.OWNER_EMAIL?.trim().toLowerCase() || undefined;

if (!OWNER_EMAIL && process.env.NODE_ENV === 'production') {
  // Log loud em prod sem derrubar o processo — falha só quando alguém
  // tentar usar recursos admin.
  console.warn('[auth] OWNER_EMAIL não configurado em produção. Painel /admin ficará inacessível até alguém ter is_owner=true no DB.');
}

export type CurrentUser = {
  id: number;
  clerkUserId: string;
  email: string;
  discogsUsername: string | null;
  discogsTokenEncrypted: string | null;
  discogsCredentialStatus: 'valid' | 'invalid';
  needsOnboarding: boolean;
  isOwner: boolean;
  allowlisted: boolean;
  // Inc 26: incluído no objeto cached pra evitar SELECT extra em
  // getImportProgressLight (caminho condicional do home).
  importAcknowledgedAt: Date | null;
  // Inc 27: aiProvider/aiModel cached pra eliminar SELECT extra de
  // getUserAIConfigStatus em /disco/[id] (era 1 query/render).
  // aiApiKeyEncrypted INTENCIONALMENTE FORA — princípio de menor
  // exposição: chave criptografada lida apenas em funções que de fato
  // chamam o provider IA (enrichTrackComment, analyzeTrackWithAI, etc.).
  aiProvider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'qwen' | null;
  aiModel: string | null;
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
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
});

function toCurrentUser(u: typeof users.$inferSelect): CurrentUser {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    discogsUsername: u.discogsUsername,
    discogsTokenEncrypted: u.discogsTokenEncrypted,
    discogsCredentialStatus: u.discogsCredentialStatus,
    needsOnboarding: !u.discogsUsername || !u.discogsTokenEncrypted,
    isOwner: u.isOwner,
    allowlisted: u.allowlisted,
    importAcknowledgedAt: u.importAcknowledgedAt,
    aiProvider: u.aiProvider,
    aiModel: u.aiModel,
  };
}

/**
 * Versão "ou lança" — usar em rotas que já passam pelo middleware protegido.
 *
 * 002-multi-conta: também enforce allowlisted. Se user não está allowlisted,
 * redireciona para `/convite-fechado`. Quem não deve ser interceptado
 * (ex: a página `/convite-fechado` em si) não chama este helper.
 */
export const requireCurrentUser = cache(async (): Promise<CurrentUser> => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  if (!user.allowlisted) {
    redirect('/convite-fechado');
  }
  return user;
});

/**
 * Guard de rota admin (FR-011, 002-multi-conta). Chama `notFound()` —
 * que renderiza o 404 padrão do Next — se o user atual não for owner.
 * Usar no topo de pages em `/admin/*`.
 */
export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (!user.isOwner) {
    notFound();
  }
  return user;
}

/** Predicate variant sem throw, útil pra condicionar UI em outras telas. */
export async function isCurrentUserOwner(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.isOwner ?? false;
}
