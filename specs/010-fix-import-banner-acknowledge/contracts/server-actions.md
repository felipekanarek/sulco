# Server Actions — Contratos

Todas vivem em `src/lib/actions.ts` (Princípio II).

## `getImportProgress` (atualizada)

### Antes

```ts
export type ImportProgress = {
  running: boolean;
  x: number;
  y: number;
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial' | 'idle';
  errorMessage: string | null;
};

export async function getImportProgress(): Promise<ImportProgress>;
```

### Depois

```ts
export type ImportProgress = {
  running: boolean;
  x: number;
  y: number;
  outcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial' | 'idle';
  errorMessage: string | null;
  runStartedAt: Date | null;   // novo
  lastAck: Date | null;        // novo
};

export async function getImportProgress(): Promise<ImportProgress>;
```

### Mudanças internas

1. `select` da query `latest` passa a incluir `startedAt: syncRuns.startedAt`.
2. Lê `users.importAcknowledgedAt` (já tem `requireCurrentUser` que devolve
   o user; adicionar `importAcknowledgedAt` na seleção do user em
   `requireCurrentUser` OU fazer 1 select extra; ver decisão de
   implementação em [research.md](../research.md) — preferir reaproveitar
   `requireCurrentUser`).
3. `runStartedAt`: `latest[0]?.startedAt ?? null`.
4. `lastAck`: `user.importAcknowledgedAt ?? null`.

### Compat semântica

- Caller único hoje: `<ImportProgressCard initial={progress} />` em
  [src/app/page.tsx](../../../src/app/page.tsx) e o polling client.
  Componente é refatorado para consumir os 2 campos novos.
- O global `<ImportPoller>` ([src/components/import-poller.tsx](../../../src/components/import-poller.tsx))
  ignora retorno — não afetado.
- Comportamento de `outcome`/`running`/`x`/`y`/`errorMessage` não muda.

## `acknowledgeImportProgress` (nova)

### Assinatura

```ts
export async function acknowledgeImportProgress(): Promise<ActionResult>;
```

### Comportamento

```ts
'use server';

export async function acknowledgeImportProgress(): Promise<ActionResult> {
  const user = await requireCurrentUser();

  await db
    .update(users)
    .set({ importAcknowledgedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath('/');
  return { ok: true };
}
```

### Input

Vazio (no payload). User vem do session via `requireCurrentUser` —
isolamento multi-user garantido (FR-008).

### Output

`ActionResult` (tipo já existente no projeto: `{ ok: true } | { ok: false, error: string }`).

### Validation

Sem Zod necessário (zero input). `requireCurrentUser` cobre auth/allowlist.

### Side-effects

- Escreve em `users.import_acknowledged_at` apenas no row do user corrente.
- `revalidatePath('/')` força re-render do RSC `/`. O componente client
  recebe novo `initial.lastAck >= runStartedAt` → não renderiza nada.

### Erros possíveis

- User não autenticado / não-allowlisted: redirect via `requireCurrentUser`
  (Server Action retorna sem ack — comportamento padrão do helper).
- DB error: bubble up — Server Action lança, client mostra erro genérico
  (caller usa `useTransition` + try/catch leve).

### Idempotência

- Chamar 2x atualiza timestamp ao `now()` mais recente. Sem efeito visível
  (banner já estava oculto após o 1º). Sem race relevante.

## Componente `<ImportProgressCard>`

### Prop interface

Igual à atual: `{ initial: ImportProgress }`. O tipo `ImportProgress` que
ganhou os 2 campos cobre o novo contrato.

### Lógica de render (pseudo)

```tsx
// 1. Caso zero-state preservado
if (state.outcome === 'idle' && state.x === 0) return null;

// 2. Caso terminal já reconhecido → não renderiza
const isTerminal = !state.running;
const isAcked =
  state.lastAck !== null &&
  state.runStartedAt !== null &&
  state.lastAck >= state.runStartedAt;
if (isTerminal && isAcked) return null;

// 3. Renderiza com (running) ou sem (terminal não-ack) botão fechar
const showCloseButton = !state.running;
return <Card>...{showCloseButton && <CloseButton onClick={handleAck} />}</Card>;
```

### Handler `handleAck`

```tsx
const [pending, startTransition] = useTransition();

function handleAck() {
  startTransition(async () => {
    const res = await acknowledgeImportProgress();
    if (res.ok) router.refresh();
  });
}
```

`pending` desabilita o botão durante a chamada (UX: evita double-click).
