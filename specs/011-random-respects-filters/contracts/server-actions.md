# Server Actions — Contratos

## `pickRandomUnratedRecord` (refatorada)

### Antes (Inc 006, em prod)

```ts
export async function pickRandomUnratedRecord(): Promise<
  ActionResult<{ recordId: number } | { recordId: null }>
>;
```

### Depois (Inc 010)

```ts
export async function pickRandomUnratedRecord(
  filters?: {
    text?: string;
    genres?: string[];
    styles?: string[];
    bomba?: 'any' | 'only' | 'none';
  },
): Promise<ActionResult<{ recordId: number } | { recordId: null }>>;
```

### Validação

Schema Zod interno:
```ts
const filtersSchema = z
  .object({
    text: z.string().trim().default(''),
    genres: z.array(z.string()).default([]),
    styles: z.array(z.string()).default([]),
    bomba: z.enum(['any', 'only', 'none']).default('any'),
  })
  .optional();
```

Inputs inválidos → `{ ok: false, error: 'Filtros inválidos.' }`.

### Comportamento

1. `requireCurrentUser()` — auth/allowlist.
2. Parse `filters` via Zod (default `undefined` = sem filtros).
3. `conds: SQL[] = [eq(records.userId, user.id), eq(records.archived, false), eq(records.status, 'unrated')]`.
4. Se `filters` não-vazio: spread `buildCollectionFilters(filters)` em `conds`.
5. Query: `SELECT id FROM records WHERE ${and(...conds)} ORDER BY RANDOM() LIMIT 1`.
6. 0 resultados → `{ ok: true, data: { recordId: null } }`. ≥1 → `{ ok: true, data: { recordId: <id> } }`.

### Compat

- Chamada sem argumento (`pickRandomUnratedRecord()`) → comportamento
  idêntico ao Inc 006 (FR-007).
- Caller atual (`<RandomCurationButton>`) sem mudança no contrato de
  retorno — apenas passa filtros opcionalmente.

## `<RandomCurationButton>` (refatorada)

### Props

```ts
type Props = {
  className?: string;
  label?: string;
  // Inc 010 — passar filtros pra serem respeitados no sorteio
  filters?: {
    text?: string;
    genres?: string[];
    styles?: string[];
    bomba?: 'any' | 'only' | 'none';
  };
};
```

### Comportamento

- Se `filters` undefined ou todos vazios/default: chama
  `pickRandomUnratedRecord()` sem arg.
- Se `filters` tem pelo menos 1 ativo: chama
  `pickRandomUnratedRecord(filters)`.
- Empty state cliente:
  - Se `recordId === null` E `hadFilters === true`: "Nenhum disco
    unrated com esses filtros."
  - Se `recordId === null` E `hadFilters === false`: "Não há discos
    pra triar — todos já foram avaliados." (preservado).

### Helper `hasActiveFilters(filters)`

```ts
const hasActiveFilters = !!(
  (filters?.text && filters.text.trim().length > 0) ||
  (filters?.genres && filters.genres.length > 0) ||
  (filters?.styles && filters.styles.length > 0) ||
  (filters?.bomba && filters.bomba !== 'any')
);
```

## `<page>` (`src/app/page.tsx`)

Sem mudança estrutural. Adiciona prop ao `<RandomCurationButton>`:

```tsx
<RandomCurationButton filters={{ text, genres, styles, bomba }} />
```

`status` da URL é intencionalmente NÃO passado (FR-002).
