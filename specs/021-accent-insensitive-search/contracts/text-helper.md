# Contract — Text helpers + query integrations (Inc 18)

**Feature**: 021-accent-insensitive-search
**File novo**: [src/lib/text.ts](../../../src/lib/text.ts)
**Files alterados**:
[src/lib/queries/collection.ts](../../../src/lib/queries/collection.ts),
[src/lib/queries/montar.ts](../../../src/lib/queries/montar.ts),
[src/lib/actions.ts](../../../src/lib/actions.ts) (`pickRandomUnratedRecord`)

---

## Helper: `normalizeText`

```typescript
/**
 * Normaliza texto para comparação accent-insensitive +
 * case-insensitive. Usado em buscas textuais (Inc 18 / 021).
 *
 * - lowercase: case-insensitive (já era o pattern existente)
 * - NFD: decompõe `é` em `e + ́` (combining acute)
 * - strip combining marks: remove `\p{M}` Unicode property
 *   (cobre marks de qualquer script — pt-BR, francês, vietnamita…)
 *
 * Pure function. Sem side-effects. Determinístico.
 */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
```

## Helper: `matchesNormalizedText`

```typescript
/**
 * Retorna true se algum dos `haystacks` (após normalize) contém
 * o `query` (após normalize). null/undefined em haystacks são
 * tratados como string vazia (no-match).
 *
 * Empty/whitespace query retorna `true` — caller deve filtrar
 * antes se quiser ignorar query vazia.
 */
export function matchesNormalizedText(
  haystacks: ReadonlyArray<string | null | undefined>,
  query: string,
): boolean {
  const needle = normalizeText(query).trim();
  if (needle.length === 0) return true;
  for (const h of haystacks) {
    if (normalizeText(h).includes(needle)) return true;
  }
  return false;
}
```

---

## Integração 1 — `buildCollectionFilters`

[src/lib/queries/collection.ts:55-100](../../../src/lib/queries/collection.ts)

### Mudança

Adicionar parâmetro opcional `omitText?: boolean` (default `false`):

```typescript
export function buildCollectionFilters(q: {
  text: string;
  genres: string[];
  styles: string[];
  bomba: BombaFilter;
  omitText?: boolean;
}): SQL[] {
  const conds: SQL[] = [];

  if (!q.omitText && q.text.length > 0) {
    const pattern = `%${q.text.toLowerCase()}%`;
    conds.push(
      sql`(lower(${records.artist}) LIKE ${pattern} OR lower(${records.title}) LIKE ${pattern} OR lower(COALESCE(${records.label},'')) LIKE ${pattern})`,
    );
  }

  // ... resto inalterado (genres, styles, bomba) ...
  return conds;
}
```

### Compatibilidade

Callers existentes (`pickRandomUnratedRecord`) continuam
funcionando sem mudança no contrato — `omitText` default `false`
preserva comportamento.

---

## Integração 2 — `queryCollection`

[src/lib/queries/collection.ts:102-...](../../../src/lib/queries/collection.ts)

### Mudança

```typescript
import { matchesNormalizedText } from '@/lib/text';

export async function queryCollection(q: CollectionQuery): Promise<CollectionRow[]> {
  const conds: SQL[] = [eq(records.userId, q.userId), eq(records.archived, false)];

  if (q.status !== 'all') {
    conds.push(eq(records.status, q.status));
  }

  // Inc 18: text filter sai do SQL e vai pra JS post-query
  conds.push(...buildCollectionFilters({ ...q, omitText: true }));

  const rows = await db
    .select({ /* fields ... */ })
    .from(records)
    .where(and(...conds))
    .orderBy(desc(records.importedAt));

  // Inc 18: aplicar text filter normalize-aware aqui, antes da
  // agregação de tracks (economiza JOIN/aggregation pra rows
  // descartadas)
  const textFiltered = q.text.trim().length > 0
    ? rows.filter((r) =>
        matchesNormalizedText([r.artist, r.title, r.label], q.text),
      )
    : rows;

  if (textFiltered.length === 0) return [];

  // ... resto inalterado, mas usar `textFiltered` em vez de `rows`
  const recordIds = textFiltered.map((r) => r.id);
  // (queries de aggregation de tracks continuam iguais, só com
  //  IDs já filtrados)

  return textFiltered.map((r) => { /* mesma lógica anterior */ });
}
```

---

## Integração 3 — `queryCandidates`

[src/lib/queries/montar.ts:57-176](../../../src/lib/queries/montar.ts)

### Mudança

```typescript
import { matchesNormalizedText } from '@/lib/text';

// Dentro de queryCandidates:

// REMOVER bloco SQL de text filter (linhas ~106-111):
// if (filters.text && filters.text.trim().length > 0) {
//   const pattern = `%${filters.text.toLowerCase().trim()}%`;
//   conds.push(sql`(...)`);
// }

// REMOVER `.limit(opts.limit ?? 300)` do SQL builder.
// Limit agora aplica em JS após text filter (Decisão 6).

const rows = await db.select({...}).from(tracks).innerJoin(records, ...).where(and(...conds)).orderBy(...orderBy);
//                                ^ sem .limit aqui

// Inc 18: text filter normalize-aware
const textFiltered = filters.text && filters.text.trim().length > 0
  ? rows.filter((r) =>
      matchesNormalizedText(
        [r.title, r.artist, r.recordTitle, r.fineGenre],
        filters.text!,
      ),
    )
  : rows;

// Inc 18: limit aplica após text filter
const limited = textFiltered.slice(0, opts.limit ?? 300);

return limited.map((r) => ({
  ...r,
  moods: (r.moods ?? []) as string[],
  // ... mesmo mapping anterior
}));
```

---

## Integração 4 — `pickRandomUnratedRecord`

[src/lib/actions.ts:853-887](../../../src/lib/actions.ts)

### Mudança

Action atual usa `ORDER BY RANDOM() LIMIT 1` no SQL — não
suporta text filter normalize-aware diretamente. Re-estruturar:

```typescript
import { matchesNormalizedText } from '@/lib/text';

export async function pickRandomUnratedRecord(
  input?: z.input<typeof pickRandomFiltersSchema>,
): Promise<ActionResult<{ recordId: number } | { recordId: null }>> {
  const user = await requireCurrentUser();

  const parsed = pickRandomFiltersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Filtros inválidos.' };
  }

  const conds = [
    eq(records.userId, user.id),
    eq(records.archived, false),
    eq(records.status, 'unrated'),
  ];

  // Inc 18: SQL filtra TUDO exceto text. Random é JS.
  if (parsed.data) {
    conds.push(...buildCollectionFilters({ ...parsed.data, omitText: true }));
  }

  // Carrega IDs + fields textuais relevantes pra post-filter
  const candidates = await db
    .select({
      id: records.id,
      artist: records.artist,
      title: records.title,
      label: records.label,
    })
    .from(records)
    .where(and(...conds));

  if (candidates.length === 0) {
    return { ok: true, data: { recordId: null } };
  }

  // Aplica text filter normalize-aware em JS
  const textTerm = parsed.data?.text?.trim() ?? '';
  const filtered = textTerm.length > 0
    ? candidates.filter((c) =>
        matchesNormalizedText([c.artist, c.title, c.label], textTerm),
      )
    : candidates;

  if (filtered.length === 0) {
    return { ok: true, data: { recordId: null } };
  }

  // Random JS uniformly
  const picked = filtered[Math.floor(Math.random() * filtered.length)];
  return { ok: true, data: { recordId: picked.id } };
}
```

---

## Comportamento esperado (FR alignment)

| FR | Mecanismo |
|----|-----------|
| FR-001 (busca em /) | `queryCollection` post-filter via `matchesNormalizedText` |
| FR-002 (busca em /sets/[id]/montar) | `queryCandidates` post-filter |
| FR-003 (bidirecional) | `normalizeText` aplicado em haystacks E em query |
| FR-004 (case-insensitive) | `toLowerCase()` no `normalizeText` |
| FR-005 (universal Unicode) | `\p{M}` flag `u` cobre todos os blocos |
| FR-006 (filtros tag) | `fineGenre` coberto pelo text filter; tags multi-select continuam exact match (vocabulário canônico — Decisão 8 do research) |
| FR-007 (termo vazio) | `matchesNormalizedText` retorna `true` quando query é vazia; caller só aplica filter quando `q.text.trim().length > 0` |
| FR-008 (multi-user isolation) | `WHERE userId = ?` no SQL preserva — sem mudança |

---

## Não-objetivos

- **NÃO** mudar schema (`records.searchBlob` etc).
- **NÃO** introduzir dependências npm novas (`normalize` é nativo).
- **NÃO** tocar `buildCollectionFilters` callers fora de
  `queryCollection` e `pickRandomUnratedRecord` — `omitText` é
  opcional default `false`.
- **NÃO** mexer em filtros de tag multi-select (gênero, estilo,
  mood, context). Vocabulário canônico continua igualdade exata
  (Decisão 8). DJ digitando texto livre tem `fineGenre` coberto
  pelo text filter geral.
- **NÃO** otimizar pra performance além do necessário —
  abordagem JS-side é deliberadamente simples; schema delta fica
  pra Inc futuro se virar dor.
