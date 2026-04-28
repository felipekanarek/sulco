# Data Model — Inc 10

## Schema delta

**Nenhum.** Reusa exatamente as mesmas colunas que `queryCollection`
já consulta:

- `records.userId` — multi-user isolation (FR-009)
- `records.archived` — sempre `false` (FR-003)
- `records.status` — sempre `'unrated'` (FR-002)
- `records.genres` (json) — filtro `genre[]`
- `records.styles` (json) — filtro `style[]`
- `records.artist`, `records.title`, `records.label` — filtro `q` (LIKE fuzzy)
- `tracks.is_bomb` — filtro `bomba` (any/only/none)

## Índices

Reusa o existente `records_user_status_idx` (composto `user_id, status`)
— já cobre o WHERE base do sorteio. Nada novo.

## Entidade derivada (interna)

`buildCollectionFilters(q)` é o helper extraído. Recebe:

```ts
type CollectionFilters = Pick<
  CollectionQuery,
  'text' | 'genres' | 'styles' | 'bomba'
>;
```

Devolve:

```ts
SQL[]  // array de drizzle-orm SQL conditions, prontas pra spread em and(...)
```

Sem state, sem persistência. Função pura sobre `q`.

## Side-effects das mutations

**Nenhum.** `pickRandomUnratedRecord` é read-only. Não toca nenhum
campo (Princípio I respeitado).
