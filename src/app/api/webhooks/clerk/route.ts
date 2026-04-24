import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users, syncRuns, invites } from '@/db/schema';
import { OWNER_EMAIL } from '@/lib/auth';

type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification?: { status?: string } | null;
};

type ClerkUserData = {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  deleted?: boolean;
};

type ClerkEvent = {
  type: string;
  data: ClerkUserData;
};

function extractPrimaryEmail(data: ClerkUserData): {
  email: string;
  verified: boolean;
} {
  const primary =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses?.[0];
  return {
    email: primary?.email_address ?? '',
    verified: primary?.verification?.status === 'verified',
  };
}

/**
 * Checa se o email está na allowlist interna (002-multi-conta).
 * Case-insensitive.
 */
async function isEmailInvited(email: string): Promise<boolean> {
  if (!email) return false;
  const rows = await db
    .select({ id: invites.id })
    .from(invites)
    .where(sql`LOWER(${invites.email}) = LOWER(${email})`)
    .limit(1);
  return rows.length > 0;
}

/**
 * Decide se este user qualifica pra promoção a owner (FR-012).
 * Condições: email verified + bate com OWNER_EMAIL + ainda ninguém é owner.
 */
async function qualifiesAsOwner(email: string, verified: boolean): Promise<boolean> {
  if (!verified || !email || !OWNER_EMAIL) return false;
  if (email.toLowerCase() !== OWNER_EMAIL) return false;
  const existingOwner = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isOwner, true))
    .limit(1);
  return existingOwner.length === 0;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET não configurado');
    return new NextResponse('server misconfigured', { status: 500 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('missing svix headers', { status: 400 });
  }

  const rawBody = await req.text();

  let evt: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.error('clerk webhook: assinatura inválida', err);
    return new NextResponse('bad signature', { status: 400 });
  }

  try {
    switch (evt.type) {
      case 'user.created': {
        const clerkUserId = evt.data.id;
        const { email, verified } = extractPrimaryEmail(evt.data);

        const [invited, isOwner] = await Promise.all([
          isEmailInvited(email),
          qualifiesAsOwner(email, verified),
        ]);

        // Owner sempre allowlisted; demais dependem de invites.
        const allowlisted = isOwner || invited;

        await db
          .insert(users)
          .values({
            clerkUserId,
            email,
            isOwner,
            allowlisted,
          })
          .onConflictDoNothing({ target: users.clerkUserId });
        break;
      }

      case 'user.updated': {
        const clerkUserId = evt.data.id;
        const { email, verified } = extractPrimaryEmail(evt.data);

        // Re-avalia allowlisted (email pode ter mudado) e promove owner
        // se acabou de verificar.
        const [invited, isOwnerCandidate] = await Promise.all([
          isEmailInvited(email),
          qualifiesAsOwner(email, verified),
        ]);

        // Se já é owner, mantém. Caso contrário, só vira owner se qualifica.
        const existing = await db
          .select({ id: users.id, isOwner: users.isOwner })
          .from(users)
          .where(eq(users.clerkUserId, clerkUserId))
          .limit(1);

        const alreadyOwner = existing[0]?.isOwner ?? false;
        const nextIsOwner = alreadyOwner || isOwnerCandidate;
        const nextAllowlisted = nextIsOwner || invited;

        await db
          .update(users)
          .set({
            email,
            isOwner: nextIsOwner,
            allowlisted: nextAllowlisted,
            updatedAt: new Date(),
          })
          .where(eq(users.clerkUserId, clerkUserId));
        break;
      }

      case 'user.deleted': {
        // Hard-delete em cascata via ON DELETE CASCADE nas FKs (FR-042).
        // Aborta syncs em andamento antes (FR-042).
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkUserId, evt.data.id))
          .limit(1);

        if (existing.length > 0) {
          const userId = existing[0].id;
          await db
            .update(syncRuns)
            .set({
              outcome: 'erro',
              errorMessage: 'Conta deletada',
              finishedAt: new Date(),
            })
            .where(and(eq(syncRuns.userId, userId), eq(syncRuns.outcome, 'running')));
          await db.delete(users).where(eq(users.id, userId));
        }
        break;
      }

      default:
        // Eventos não tratados: responder 200 silenciosamente (FR-042 doc)
        return NextResponse.json({ ignored: evt.type }, { status: 200 });
    }
  } catch (err) {
    console.error('clerk webhook: erro ao processar', err);
    return new NextResponse('processing error', { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
