import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, syncRuns } from '@/db/schema';

type ClerkUserData = {
  id: string;
  email_addresses?: { email_address: string; id: string }[];
  primary_email_address_id?: string | null;
  deleted?: boolean;
};

type ClerkEvent = {
  type: string;
  data: ClerkUserData;
};

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
      case 'user.created':
      case 'user.updated': {
        const { id, email_addresses, primary_email_address_id } = evt.data;
        const email =
          email_addresses?.find((e) => e.id === primary_email_address_id)?.email_address ??
          email_addresses?.[0]?.email_address ??
          '';
        if (evt.type === 'user.created') {
          await db
            .insert(users)
            .values({ clerkUserId: id, email })
            .onConflictDoNothing({ target: users.clerkUserId });
        } else {
          await db
            .update(users)
            .set({ email, updatedAt: new Date() })
            .where(eq(users.clerkUserId, id));
        }
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
            .where(eq(syncRuns.userId, userId));
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
