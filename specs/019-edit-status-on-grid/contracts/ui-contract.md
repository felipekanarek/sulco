# UI Contract — `<RecordStatusActions>` (Inc 19)

**Feature**: 019-edit-status-on-grid
**Component**: [src/components/record-status-actions.tsx](../../../src/components/record-status-actions.tsx) — NOVO
**Consumed by**: [`<RecordRow>`](../../../src/components/record-card.tsx) e [`<RecordGridCard>`](../../../src/components/record-grid-card.tsx)

---

## Props

```typescript
type RecordStatus = 'unrated' | 'active' | 'discarded';

type RecordStatusActionsProps = {
  recordId: number;
  status: RecordStatus;
  recordLabel: string;     // ex: "Caetano Veloso — Transa" — usado em aria-label
  className?: string;       // permite layout absorvido pelo container pai
};
```

## Output condicional dos botões

Conforme `displayStatus` (= `optimistic ?? props.status`):

| status | Botões visíveis | Ordem |
|--------|------------------|-------|
| `unrated` | `Ativar`, `Descartar` | esquerda → direita |
| `active` | `Descartar` | único |
| `discarded` | `Reativar` | único |

Cada botão dispara `updateRecordStatus({ recordId, status: <target> })`:
- `Ativar` → `status: 'active'`
- `Descartar` → `status: 'discarded'`
- `Reativar` → `status: 'active'`

## Optimistic state shape

```typescript
const [optimistic, setOptimistic] = useState<RecordStatus | null>(null);
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);

const displayStatus = optimistic ?? props.status;
```

## Handler genérico

```typescript
function applyStatus(target: RecordStatus) {
  if (isPending) return;
  setError(null);
  setOptimistic(target);  // UI muda <100ms (SC-002)
  startTransition(async () => {
    try {
      const res = await updateRecordStatus({ recordId, status: target });
      if (!res.ok) {
        setOptimistic(null);                      // rollback visual
        setError('Falha ao atualizar — tente novamente.');
        return;
      }
      // sucesso: deixa optimistic até RSC revalidar (~1s) e props atualizarem
    } catch (err) {
      setOptimistic(null);
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    }
  });
}
```

## Auto-dismiss do erro

```typescript
useEffect(() => {
  if (!error) return;
  const t = setTimeout(() => setError(null), 5000);
  return () => clearTimeout(t);
}, [error]);
```

Limpeza explícita ao disparar nova ação: `setError(null)` no
início de `applyStatus()` (acima).

---

## Markup base

```jsx
<div className={`flex flex-row gap-2 ${className ?? ''}`}>
  {displayStatus === 'unrated' ? (
    <>
      <button
        type="button"
        onClick={() => applyStatus('active')}
        disabled={isPending}
        aria-label={`Ativar disco ${recordLabel}`}
        className={btnClass}
      >
        {isPending && optimistic === 'active' ? 'Salvando…' : 'Ativar'}
      </button>
      <button
        type="button"
        onClick={() => applyStatus('discarded')}
        disabled={isPending}
        aria-label={`Descartar disco ${recordLabel}`}
        className={btnClass}
      >
        {isPending && optimistic === 'discarded' ? 'Salvando…' : 'Descartar'}
      </button>
    </>
  ) : displayStatus === 'active' ? (
    <button
      type="button"
      onClick={() => applyStatus('discarded')}
      disabled={isPending}
      aria-label={`Descartar disco ${recordLabel}`}
      className={btnClass}
    >
      {isPending ? 'Salvando…' : 'Descartar'}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => applyStatus('active')}
      disabled={isPending}
      aria-label={`Reativar disco ${recordLabel}`}
      className={btnClass}
    >
      {isPending ? 'Salvando…' : 'Reativar'}
    </button>
  )}
  {error ? (
    <p
      role="alert"
      className="font-mono text-[11px] text-warn ml-2 self-center"
    >
      {error}
    </p>
  ) : null}
</div>
```

Onde `btnClass`:

```text
font-mono text-[10px] uppercase tracking-[0.12em]
px-3 py-2 min-h-[44px] md:min-h-[32px]
border border-line hover:border-ink text-ink-soft hover:text-ink
rounded-sm
disabled:opacity-50 disabled:cursor-not-allowed
transition-colors
whitespace-nowrap
```

---

## Integração nos containers pai

### `<RecordRow>` (view list)

Renderizar dentro do bloco que hoje contém `<StatusBadge>` +
"Curadoria →" link, abaixo dos dois:

```diff
  <div className="flex flex-row items-center justify-between gap-2 md:flex-col md:items-end md:justify-start mt-1 md:mt-0">
    <StatusBadge status={record.status} />
    <Link href={`/disco/${record.id}`} ...>Curadoria →</Link>
+   <RecordStatusActions
+     recordId={record.id}
+     status={record.status}
+     recordLabel={`${record.artist} — ${record.title}`}
+     className="mt-2 md:mt-3"
+   />
  </div>
```

### `<RecordGridCard>` (view grid)

Renderizar dentro do `<div className="pt-3 flex flex-col gap-0.5">`,
após o último `<p className="label-tech text-ink-mute mt-1 ...">`:

```diff
    <p className="label-tech text-ink-mute mt-1 ...">...</p>
+   <RecordStatusActions
+     recordId={record.id}
+     status={record.status}
+     recordLabel={`${record.artist} — ${record.title}`}
+     className="mt-2"
+   />
  </div>
</article>
```

---

## Reusa Server Action existente (sem mudança)

[src/lib/actions.ts:568](../../../src/lib/actions.ts) —
`updateRecordStatus(input)` retorna `Promise<ActionResult>` (=
`{ ok: true } | { ok: false, error }`). Já valida Zod, já filtra
`WHERE userId`, já chama `revalidatePath('/')` +
`revalidatePath('/curadoria')` + `revalidatePath('/disco/${id}')`.

---

## Não-objetivos (explicitamente fora do escopo)

- **NÃO** modificar a Server Action `updateRecordStatus`.
- **NÃO** modificar `<StatusBadge>` interno (continua puramente
  decorativo dentro de `<RecordRow>`).
- **NÃO** renderizar pra discos `archived=true` — fluxo separado
  em `/status` (Inc 11/017). O contract assume que o componente
  só é montado pra discos não-arquivados (página `/` filtra
  isso na query).
- **NÃO** introduzir toast global. Erro é inline no card.
- **NÃO** introduzir botão de fechar manual no erro. Auto-dismiss
  cobre (Clarification Q2).
- **NÃO** adicionar confirmação de diálogo (Princípio IV: status
  reversível).
