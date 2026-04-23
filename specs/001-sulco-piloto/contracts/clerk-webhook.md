# Contract — Clerk Webhook

Endpoint recebe eventos da Clerk (via Svix) para manter o espelho local de
`users` em sincronia. Implementado em `src/app/api/webhooks/clerk/route.ts`.

---

## Invocação

`POST /api/webhooks/clerk`

**Headers** (adicionados pelo Svix):
- `svix-id`
- `svix-timestamp`
- `svix-signature`

**Body**: JSON com `type` (ex: `user.created`, `user.updated`,
`user.deleted`) e `data` (payload do recurso).

---

## Verificação de assinatura

```ts
import { Webhook } from 'svix';

const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
try {
  const evt = wh.verify(rawBody, {
    'svix-id': headers.get('svix-id')!,
    'svix-timestamp': headers.get('svix-timestamp')!,
    'svix-signature': headers.get('svix-signature')!,
  }) as WebhookEvent;
} catch {
  return new Response('bad signature', { status: 400 });
}
```

Falha de assinatura → `400`. Nunca processa o evento.

---

## Eventos tratados

### `user.created`

Provisiona linha em `users`:

```sql
INSERT INTO users(clerkUserId, email)
VALUES(?, ?)
ON CONFLICT(clerkUserId) DO NOTHING;
```

`discogsUsername` e `discogsTokenEncrypted` ficam `NULL` — o middleware Next.js
redireciona para `/onboarding`.

Resposta: `200`.

---

### `user.updated`

Atualiza `email` se mudou:

```sql
UPDATE users SET email=?, updatedAt=now() WHERE clerkUserId=?;
```

Resposta: `200`.

---

### `user.deleted`

Hard-delete imediato (FR-042/FR-043):

1. Resolve `userId` local via `clerkUserId`.
2. Aborta syncs em andamento: `UPDATE syncRuns SET outcome='erro',
   errorMessage='Conta deletada', finishedAt=now() WHERE userId=?
   AND finishedAt IS NULL`.
3. `DELETE FROM users WHERE id=?` — cascade em records, tracks, sets,
   setTracks, syncRuns.

Resposta: `200`.

---

### Eventos desconhecidos

Retorna `200` com corpo `{ ignored: <type> }`. NÃO loga como erro (evita
ruído) — Clerk envia vários eventos não relevantes ao Sulco.

---

## Idempotência

- `user.created`: `ON CONFLICT DO NOTHING` → idempotente.
- `user.updated`: `UPDATE` é idempotente por natureza.
- `user.deleted`: se a linha já não existe, é no-op; retorna `200`.

---

## Observabilidade

Cada invocação loga:

```json
{
  "event": "clerk.webhook",
  "type": "user.created",
  "clerkUserId": "user_abc",
  "durationMs": 12,
  "status": 200
}
```

Em caso de falha na cascade delete, loga com `status: 500` e devolve
`500`. A Clerk reenviará o webhook em backoff.

---

## Configuração

- Endpoint registrado no dashboard da Clerk → Webhooks → Add endpoint →
  URL `https://sulco.app/api/webhooks/clerk`.
- Eventos habilitados: `user.created`, `user.updated`, `user.deleted`.
- Segredo guardado em `CLERK_WEBHOOK_SECRET` (Vercel env).
