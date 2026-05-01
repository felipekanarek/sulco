# Data Model — Inc 24: user_facets

**Feature**: 023-user-facets-denormalization
**Date**: 2026-05-01

---

## Entidade nova: `UserFacets`

Cache materializado de agregações do user. 1 row por user.

### Campos

| Campo | Tipo | Default | Notas |
|-------|------|---------|-------|
| `user_id` | INTEGER | — | PK + FK `users(id)` ON DELETE CASCADE |
| `genres_json` | TEXT | `'[]'` | JSON array de `{value, count}` ordenado por count DESC, depois value ASC |
| `styles_json` | TEXT | `'[]'` | idem |
| `moods_json` | TEXT | `'[]'` | JSON `string[]` ordenado alfabeticamente case-insensitive |
| `contexts_json` | TEXT | `'[]'` | idem |
| `shelves_json` | TEXT | `'[]'` | idem (Inc 21 — alfabético case-insensitive) |
| `records_total` | INTEGER | `0` | COUNT records WHERE userId AND archived=0 |
| `records_active` | INTEGER | `0` | COUNT records WHERE userId AND archived=0 AND status='active' |
| `records_unrated` | INTEGER | `0` | COUNT records WHERE userId AND archived=0 AND status='unrated' |
| `records_discarded` | INTEGER | `0` | COUNT records WHERE userId AND archived=0 AND status='discarded' |
| `tracks_selected_total` | INTEGER | `0` | COUNT tracks JOIN records WHERE userId AND archived=0 AND selected=1 |
| `updated_at` | INTEGER (timestamp) | `unixepoch()` | atualizado a cada UPSERT |

### Validation rules

- `user_id` MUST referenciar um user existente (FK).
- Todos os campos `*_json` devem ser JSON válido. Tipos preservados:
  - `genres_json` / `styles_json`: `[{value: string, count: number}]`
  - `moods_json` / `contexts_json` / `shelves_json`: `string[]`
- Contadores nunca null nem negativos. Defaults `0`.
- `records_active + records_unrated + records_discarded === records_total`
  (invariante; recompute garante).

### State transitions

Não há "estado" — cada UPSERT regenera todos os campos a partir das
fontes (records + tracks). Idempotência garantida.

### Relationships

- **users.id** ← `userFacets.userId` (1:1, FK CASCADE).
- **records** (lido pelo recompute, não FK direto).
- **tracks** (lido pelo recompute, não FK direto).

### Schema Drizzle (proposto)

```typescript
export const userFacets = sqliteTable('user_facets', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  genresJson: text('genres_json').notNull().default('[]'),
  stylesJson: text('styles_json').notNull().default('[]'),
  moodsJson: text('moods_json').notNull().default('[]'),
  contextsJson: text('contexts_json').notNull().default('[]'),
  shelvesJson: text('shelves_json').notNull().default('[]'),
  recordsTotal: integer('records_total').notNull().default(0),
  recordsActive: integer('records_active').notNull().default(0),
  recordsUnrated: integer('records_unrated').notNull().default(0),
  recordsDiscarded: integer('records_discarded').notNull().default(0),
  tracksSelectedTotal: integer('tracks_selected_total').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

---

## Tipos TypeScript (lado consumidor)

```typescript
export type UserFacets = {
  userId: number;
  genres: { value: string; count: number }[];
  styles: { value: string; count: number }[];
  moods: string[];
  contexts: string[];
  shelves: string[];
  recordsTotal: number;
  recordsActive: number;
  recordsUnrated: number;
  recordsDiscarded: number;
  tracksSelectedTotal: number;
  updatedAt: Date;
};
```

`getUserFacets` faz a desserialização JSON dos campos `_json`
antes de retornar.

---

## Defaults pro caso de row ausente (FR-005)

```typescript
const EMPTY_FACETS: UserFacets = {
  userId: 0, // será sobrescrito ou tratado pelo caller
  genres: [],
  styles: [],
  moods: [],
  contexts: [],
  shelves: [],
  recordsTotal: 0,
  recordsActive: 0,
  recordsUnrated: 0,
  recordsDiscarded: 0,
  tracksSelectedTotal: 0,
  updatedAt: new Date(0),
};
```

---

## Sem mudanças em entidades existentes

`records`, `tracks`, `users`, `setTracks`, `playlists` etc.
**inalterados**. Esta feature é puramente aditiva.
