# UI Contract — `<ShelfPicker>` (Inc 21)

**Feature**: 020-shelf-picker-autoadd
**Component**: [src/components/shelf-picker.tsx](../../../src/components/shelf-picker.tsx) — NOVO
**Consumed by**: [`<RecordControls>`](../../../src/components/record-controls.tsx) em `/disco/[id]`

---

## Props

```typescript
type ShelfPickerProps = {
  recordId: number;
  current: string | null;        // valor atual do shelfLocation
  userShelves: string[];          // lista server-side ordenada alfabeticamente
  className?: string;             // override de layout pelo container pai
};
```

## Server-side helper (novo)

[src/lib/queries/collection.ts](../../../src/lib/queries/collection.ts):

```typescript
export async function listUserShelves(userId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ shelf: records.shelfLocation })
    .from(records)
    .where(and(
      eq(records.userId, userId),
      isNotNull(records.shelfLocation),
    ))
    .orderBy(sql`lower(${records.shelfLocation})`);

  return rows
    .map((r) => r.shelf)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}
```

Importações: usa `selectDistinct` do Drizzle, `isNotNull` (já em
uso no projeto), `sql` template pra ordenação case-insensitive.

## Estado interno

```typescript
const [open, setOpen] = useState(false);
const [query, setQuery] = useState('');
const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined);
//                                  ^ undefined = "use props.current"; null = "limpou"; string = "novo valor"
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);
const [activeIdx, setActiveIdx] = useState<number>(-1);  // navegação por teclado

const display: string | null = optimistic !== undefined ? optimistic : current;
```

`useEffect([current])`: reset `optimistic = undefined` quando o
RSC re-renderiza com novo prop (revalidação síncrona com server).

`useEffect([error])`: auto-dismiss em 5s (mesma UX do Inc 19).

## Computed list (desktop + mobile compartilham)

```typescript
const trimmedQuery = query.trim();
const lowerQuery = trimmedQuery.toLowerCase();

const filtered = useMemo(() => {
  if (!lowerQuery) return userShelves;
  return userShelves.filter((s) => s.toLowerCase().includes(lowerQuery));
}, [userShelves, lowerQuery]);

const exactMatch = filtered.some((s) => s === trimmedQuery);
//                                       ^ case-sensitive match (FR-005)

const showAddItem = trimmedQuery.length > 0 && !exactMatch;
const isEmpty = userShelves.length === 0 && trimmedQuery.length === 0;
```

## Lista exibida (sempre nesta ordem)

1. **"— Sem prateleira —"** (sempre presente como primeiro item).
2. **Filtered shelves** (alfabéticas, ordem do prop).
3. **"+ Adicionar '\<termo\>' como nova prateleira"** (último,
   apenas se `showAddItem`).

Quando `isEmpty`: lista mostra apenas o "— Sem prateleira —" + texto
auxiliar "Você ainda não tem prateleiras. Digite o nome da primeira."

## Action de seleção

```typescript
async function selectShelf(value: string | null) {
  setError(null);
  setOptimistic(value);
  setOpen(false);
  setQuery('');
  startTransition(async () => {
    try {
      const res = await updateRecordAuthorFields({
        recordId,
        shelfLocation: value,
      });
      if (!res.ok) {
        setOptimistic(undefined);
        setError(res.error || 'Falha ao salvar prateleira.');
      }
    } catch (err) {
      setOptimistic(undefined);
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    }
  });
}
```

Handlers de UI:
- Clicar prateleira existente: `selectShelf(shelf)`.
- Clicar "+ Adicionar 'X'": `selectShelf(trimmedQuery)`.
- Clicar "— Sem prateleira —": `selectShelf(null)`.

---

## Markup base — Trigger button

```jsx
<button
  type="button"
  onClick={() => setOpen(true)}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-controls="shelf-picker-listbox"
  className="w-full font-mono text-sm bg-transparent border-0 border-b border-line pb-1 outline-none focus:border-accent text-left flex items-center justify-between min-h-[44px] md:min-h-[36px]"
>
  <span className={display ? 'text-ink' : 'text-ink-mute'}>
    {display ?? 'ex: E3-P2'}
  </span>
  <span className="font-mono text-[10px] text-ink-mute" aria-hidden>
    ▾
  </span>
</button>
```

## Markup base — Lista (compartilhada desktop + mobile)

```jsx
<div className="flex flex-col">
  <div className="px-3 pt-3 pb-2 border-b border-line">
    <input
      type="search"
      role="combobox"
      aria-controls="shelf-picker-listbox"
      aria-activedescendant={activeIdx >= 0 ? `shelf-opt-${activeIdx}` : undefined}
      placeholder="Buscar ou digitar nova…"
      value={query}
      onChange={(e) => setQuery(e.target.value.slice(0, 50))}
      onKeyDown={handleKeyDown}
      autoFocus
      maxLength={50}
      className="w-full font-mono text-sm bg-transparent border-b border-line pb-1 outline-none focus:border-accent"
    />
  </div>

  <ul
    id="shelf-picker-listbox"
    role="listbox"
    className="flex-1 overflow-y-auto max-h-[60vh] md:max-h-[300px]"
  >
    {/* "— Sem prateleira —" sempre primeiro */}
    <li
      id="shelf-opt-clear"
      role="option"
      aria-selected={display === null}
      onClick={() => selectShelf(null)}
      className="px-3 py-2 min-h-[44px] md:min-h-[36px] flex items-center font-mono text-[12px] text-ink-mute hover:bg-paper-raised cursor-pointer"
    >
      — Sem prateleira —
    </li>

    {filtered.map((shelf, idx) => (
      <li
        key={shelf}
        id={`shelf-opt-${idx}`}
        role="option"
        aria-selected={display === shelf}
        onClick={() => selectShelf(shelf)}
        className={`px-3 py-2 min-h-[44px] md:min-h-[36px] flex items-center font-mono text-[13px] hover:bg-paper-raised cursor-pointer ${
          activeIdx === idx ? 'bg-paper-raised' : ''
        } ${display === shelf ? 'text-accent' : 'text-ink'}`}
      >
        {shelf}
      </li>
    ))}

    {showAddItem ? (
      <li
        id="shelf-opt-add"
        role="option"
        aria-selected={false}
        onClick={() => selectShelf(trimmedQuery)}
        className="px-3 py-2 min-h-[44px] md:min-h-[36px] flex items-center font-mono text-[12px] text-ink-soft hover:bg-paper-raised cursor-pointer border-t border-line-soft"
      >
        + Adicionar &lsquo;{trimmedQuery}&rsquo; como nova prateleira
      </li>
    ) : null}

    {isEmpty ? (
      <li className="px-3 py-3 font-serif italic text-[12px] text-ink-mute">
        Você ainda não tem prateleiras. Digite o nome da primeira.
      </li>
    ) : null}
  </ul>

  {error ? (
    <p role="alert" className="px-3 py-2 font-mono text-[11px] text-warn border-t border-line">
      {error}
    </p>
  ) : null}
</div>
```

## Wrapper desktop vs mobile (responsive)

```jsx
{/* Desktop popover (md+) */}
<div className="hidden md:block relative">
  <TriggerButton ... />
  {open ? (
    <div
      className="absolute left-0 right-0 top-full mt-1 z-30 bg-paper border border-line shadow-md max-w-[400px]"
      onBlur={(e) => {
        // close if focus leaves the popover
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <ListPanel ... />
    </div>
  ) : null}
</div>

{/* Mobile bottom sheet (<md) */}
<div className="md:hidden">
  <TriggerButton ... />
  <MobileDrawer
    open={open}
    onClose={() => setOpen(false)}
    side="bottom"
    ariaLabel="Selecionar prateleira"
  >
    <ListPanel ... />
  </MobileDrawer>
</div>
```

(Em prática: extrair `<TriggerButton>`, `<ListPanel>` como
funções/sub-componentes internos pra evitar duplicação.)

## Keyboard navigation handler

```typescript
function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  // total options: 1 (clear) + filtered.length + (showAddItem ? 1 : 0)
  const total = 1 + filtered.length + (showAddItem ? 1 : 0);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActiveIdx((i) => (i + 1) % total);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActiveIdx((i) => (i <= 0 ? total - 1 : i - 1));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIdx === -1 && showAddItem) {
      // Enter sem nav explícita: cria a opção "+ Adicionar"
      selectShelf(trimmedQuery);
    } else if (activeIdx === 0) {
      selectShelf(null);
    } else if (activeIdx > 0 && activeIdx <= filtered.length) {
      selectShelf(filtered[activeIdx - 1]);
    } else if (activeIdx === total - 1 && showAddItem) {
      selectShelf(trimmedQuery);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    setOpen(false);
  }
}
```

## Reusa Server Action existente (sem mudança)

[src/lib/actions.ts:737](../../../src/lib/actions.ts) —
`updateRecordAuthorFields(input)` aceita
`{ recordId, shelfLocation: string | null | undefined }`. Retorna
`Promise<ActionResult>`. Já valida Zod (`max(50).nullable()`),
filtra `WHERE userId`, e chama `revalidatePath` em
`/disco/${recordId}`, `/curadoria`, `/`.

## Não-objetivos (explicitamente fora do escopo)

- **NÃO** modificar `updateRecordAuthorFields` nem outras Server
  Actions.
- **NÃO** introduzir nova Server Action para "criar prateleira"
  (criar é apenas um `shelfLocation` novo num record — não há
  entidade separada de Prateleira).
- **NÃO** normalizar capitalização automaticamente (Decisão 1
  do research).
- **NÃO** persistir uso recente / contagem (Decisão 2 — sem
  LRU).
- **NÃO** virtualizar lista (Decisão 9 — `max-h` + scroll
  cobre o caso típico de ~30 prateleiras).
- **NÃO** introduzir tela admin separada de "gerenciar
  prateleiras" (criar via picker basta; deletar viria via
  futuro Inc 6 multi-select de bulk-clear).
