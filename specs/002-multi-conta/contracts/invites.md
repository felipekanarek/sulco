# Contract: Allowlist interna (invites) + redirect de não-allowlisted

Pivot 2026-04-23: Clerk Allowlist é feature Pro. O Sulco implementa a
allowlist **internamente** via tabela `invites` + coluna
`users.allowlisted` + middleware-level redirect.

## 1. Fluxo de signup (completo)

1. Visitante acessa `/sign-in`, clica em "Sign up", digita email e senha.
2. Clerk cria a conta normalmente (signup é ABERTO na Clerk).
3. Clerk dispara webhook `user.created` para `/api/webhooks/clerk`.
4. Webhook executa:
   - INSERT em `users` (clerk_user_id, email)
   - SELECT em `invites` WHERE `LOWER(email) = LOWER(?)`
   - Se match → `UPDATE users SET allowlisted=true WHERE id=?`
   - Sempre avalia promoção a owner (FR-012) independentemente de
     `allowlisted` — owner nunca depende de estar em `invites`.
5. User termina fluxo Clerk (verify email, etc.).
6. User acessa `/` do Sulco. Middleware:
   - SELECT `users.allowlisted` WHERE clerk_user_id = ?
   - Se `false` E rota ≠ (`/convite-fechado`, `/sign-in`, `/sign-up`,
     `/api/webhooks/clerk`, assets públicos) → redirect para
     `/convite-fechado`.
   - Se `true` → prossegue para a rota requisitada.

## 2. Server Actions de gestão

Arquivo: `src/lib/actions.ts` (co-localizadas com as demais actions).

### addInvite(email: string)

```typescript
const schema = z.object({ email: z.string().email().toLowerCase().trim() });

export async function addInvite(input: { email: string }): Promise<ActionResult> {
  const currentUser = await requireOwner();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email inválido.' };

  await db
    .insert(invites)
    .values({ email: parsed.data.email, addedByUserId: currentUser.id })
    .onConflictDoNothing({ target: invites.email });

  // Promove users já existentes com esse email
  await db
    .update(users)
    .set({ allowlisted: true, updatedAt: new Date() })
    .where(sql`LOWER(${users.email}) = ${parsed.data.email}`);

  revalidatePath('/admin/convites');
  return { ok: true };
}
```

**Contract**:

- Idempotente: adicionar email já existente não erra; `onConflictDoNothing`.
- Side effect: promove users existentes com o email — importante se
  alguém já criou conta Clerk antes de você convidar.
- Apenas owner pode chamar — `requireOwner()` guard.

### removeInvite(email: string)

```typescript
export async function removeInvite(input: { email: string }): Promise<ActionResult> {
  const currentUser = await requireOwner();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email inválido.' };

  await db.delete(invites).where(eq(invites.email, parsed.data.email));

  // Desaloca users com esse email, exceto owner
  await db
    .update(users)
    .set({ allowlisted: false, updatedAt: new Date() })
    .where(
      and(
        sql`LOWER(${users.email}) = ${parsed.data.email}`,
        eq(users.isOwner, false),
      ),
    );

  revalidatePath('/admin/convites');
  return { ok: true };
}
```

**Contract**:

- Remove convite do banco.
- Desaloca user existente imediatamente (próxima request do user vai
  cair no middleware → `/convite-fechado`).
- Owner NUNCA é desalocado mesmo que seu email esteja na lista de
  invites e ele remova.

## 3. Rota `/admin/convites`

Server Component com Server Actions inline via form action.

```tsx
export const dynamic = 'force-dynamic';

export default async function InvitesPage() {
  await requireOwner();
  const list = await db
    .select({ id: invites.id, email: invites.email, createdAt: invites.createdAt })
    .from(invites)
    .orderBy(asc(invites.createdAt));

  return (
    <main>
      <h1>Convites ativos ({list.length})</h1>

      <form action={addInviteAction}>
        <input name="email" type="email" placeholder="amigo@exemplo.com" required />
        <button>Adicionar</button>
      </form>

      <ul>
        {list.map(i => (
          <li key={i.id}>
            {i.email}
            <form action={removeInviteAction}>
              <input type="hidden" name="email" value={i.email} />
              <button>Remover</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

**Contract**:

- Sem JS. Forms nativos com Server Actions.
- Qualquer não-owner acessando → 404.

## 4. Middleware — check de allowlisted

O middleware existente (`src/middleware.ts`) já autentica via Clerk.
Precisa ganhar etapa extra:

```typescript
// Pseudocódigo — implementação real usa matchers Clerk
export default clerkMiddleware(async (auth, req) => {
  const { userId } = auth();

  // rotas públicas pulam check
  const path = req.nextUrl.pathname;
  if (PUBLIC_ROUTES.includes(path) || path.startsWith('/api/webhooks')) {
    return;
  }

  if (!userId) {
    return auth().redirectToSignIn();
  }

  // NOVO: check allowlisted
  const [row] = await db
    .select({ allowlisted: users.allowlisted })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  const allowed = row?.allowlisted ?? false;
  if (!allowed && path !== '/convite-fechado') {
    return NextResponse.redirect(new URL('/convite-fechado', req.url));
  }
});
```

**Performance**: 1 SELECT indexado (`users.clerk_user_id` já é UNIQUE)
por request. Em Vercel + Turso aws-us-east-1 daria ~30-50ms extra por
request — aceitável no piloto.

**Cacheable?**: por enquanto não — quer sempre refletir o estado
atual. Se latência virar problema, cacheia em cookie JWT assinado na
sessão Clerk ou via Redis.

## 5. Webhook Clerk — contrato revisado

Arquivo: `src/app/api/webhooks/clerk/route.ts`.

### Evento `user.created`

```typescript
case 'user.created': {
  const { id, email_addresses, primary_email_address_id } = evt.data;
  const primary = email_addresses?.find(e => e.id === primary_email_address_id)
                ?? email_addresses?.[0];
  const email = primary?.email_address ?? '';
  const isVerified = primary?.verification?.status === 'verified';

  // Check allowlist
  const hasInvite = email
    ? await db
        .select({ id: invites.id })
        .from(invites)
        .where(sql`LOWER(${invites.email}) = LOWER(${email})`)
        .limit(1)
        .then(rows => rows.length > 0)
    : false;

  // Check owner eligibility
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  const ownerAlreadyExists = await db
    .select({ id: users.id }).from(users).where(eq(users.isOwner, true)).limit(1)
    .then(rows => rows.length > 0);
  const qualifiesAsOwner =
    isVerified && email.toLowerCase() === ownerEmail && !ownerAlreadyExists;

  await db
    .insert(users)
    .values({
      clerkUserId: id,
      email,
      isOwner: qualifiesAsOwner,
      allowlisted: qualifiesAsOwner || hasInvite,
    })
    .onConflictDoNothing({ target: users.clerkUserId });

  break;
}
```

### Evento `user.updated`

Reavalia `allowlisted` se o email mudou, promove owner se finalmente
verificou. Semelhante acima, com `UPDATE` em vez de `INSERT`.

### Evento `user.deleted`

Sem mudança — cascade via FK já trata todas as tabelas scoped, e
`invites` é independente.
