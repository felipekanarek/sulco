# Data Model — Drop colunas `*Json` em `user_facets`

**Phase**: 1
**Status**: schema delta de 5 colunas removidas. Sem nova entity.

## Entidade afetada

### `user_facets` — enxuga 5 colunas mortas

**Antes (pós-Inc 33, fallback):**

| Campo | Tipo | Constraint | Status |
|---|---|---|---|
| user_id | INTEGER | PRIMARY KEY, FK users(id) ON DELETE CASCADE | preservado |
| genres_json | TEXT | NOT NULL DEFAULT '[]' | **REMOVIDO** |
| styles_json | TEXT | NOT NULL DEFAULT '[]' | **REMOVIDO** |
| moods_json | TEXT | NOT NULL DEFAULT '[]' | **REMOVIDO** |
| contexts_json | TEXT | NOT NULL DEFAULT '[]' | **REMOVIDO** |
| shelves_json | TEXT | NOT NULL DEFAULT '[]' | **REMOVIDO** |
| records_total | INTEGER | NOT NULL DEFAULT 0 | preservado |
| records_active | INTEGER | NOT NULL DEFAULT 0 | preservado |
| records_unrated | INTEGER | NOT NULL DEFAULT 0 | preservado |
| records_discarded | INTEGER | NOT NULL DEFAULT 0 | preservado |
| tracks_selected_total | INTEGER | NOT NULL DEFAULT 0 | preservado |
| updated_at | INTEGER | NOT NULL DEFAULT (unixepoch()) | preservado |

**Depois (Inc 34):**

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| user_id | INTEGER | PRIMARY KEY, FK users(id) ON DELETE CASCADE | Chave do user |
| records_total | INTEGER | NOT NULL DEFAULT 0 | Counter de records não-arquivados |
| records_active | INTEGER | NOT NULL DEFAULT 0 | Counter de records com status=active |
| records_unrated | INTEGER | NOT NULL DEFAULT 0 | Counter de records com status=unrated |
| records_discarded | INTEGER | NOT NULL DEFAULT 0 | Counter de records com status=discarded |
| tracks_selected_total | INTEGER | NOT NULL DEFAULT 0 | Counter de tracks selecionadas |
| updated_at | INTEGER | NOT NULL DEFAULT (unixepoch()) | Timestamp Unix da última modificação |

**De 12 → 7 campos.**

## Migration SQL

```sql
ALTER TABLE user_facets DROP COLUMN genres_json;
ALTER TABLE user_facets DROP COLUMN styles_json;
ALTER TABLE user_facets DROP COLUMN moods_json;
ALTER TABLE user_facets DROP COLUMN contexts_json;
ALTER TABLE user_facets DROP COLUMN shelves_json;
```

Aplicar em ordem:
1. **Code deploy primeiro** (push → Vercel `--prod`).
2. **Local sqlite** (dev): `sqlite3 sulco.db < migration.sql`.
3. **Prod Turso**: `turso db shell sulco-prod` colando o SQL.

## Drizzle TS schema delta

Em [src/db/schema.ts](../../src/db/schema.ts), remover do bloco `userFacets`:

```ts
// REMOVER:
genresJson: text('genres_json').notNull().default('[]'),
stylesJson: text('styles_json').notNull().default('[]'),
moodsJson: text('moods_json').notNull().default('[]'),
contextsJson: text('contexts_json').notNull().default('[]'),
shelvesJson: text('shelves_json').notNull().default('[]'),
```

Resultado final:
```ts
export const userFacets = sqliteTable('user_facets', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Counters
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

Tipos auto-derivados ficam ajustados após `npm run build`.

## Tipo `UserFacets` enxuto

Em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):

```ts
export type UserFacets = {
  userId: number;
  recordsTotal: number;
  recordsActive: number;
  recordsUnrated: number;
  recordsDiscarded: number;
  tracksSelectedTotal: number;
  updatedAt: Date;
};
```

Removido: `genres`, `styles`, `moods`, `contexts`, `shelves` (todos eram derivados via `parseJsonArray` das colunas removidas).

## Helpers privados removidos

Em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):

- `aggregateFacet(userId, column)` — alimentava genres/styles JSON. **DELETAR**.
- `aggregateVocabulary(userId, column)` — alimentava moods/contexts JSON. **DELETAR**.
- `aggregateShelves(userId)` — alimentava shelves JSON. **DELETAR**.

`parseJsonArray<T>` — verificar se há outros callers via grep. Se zero, deletar; se algum, manter.

## Helpers preservados (Inc 33)

- `_repopulateVocab(userId)` — repopula `user_vocab`.
- `_aggregateVocabCounts(userId, column)` — para moods/contexts em `_repopulateVocab`.
- `_aggregateShelfCounts(userId)` — para shelves em `_repopulateVocab`.
- `aggregateCounts(userId)` — para counters de records.
- `aggregateTracksSelected(userId)` — para `tracksSelectedTotal`.

## `recomputeFacets` simplificado

**Antes**:
```ts
const [genres, styles, moods, contexts, shelves, counts, tracksSelectedTotal] =
  await Promise.all([
    aggregateFacet(userId, records.genres),
    aggregateFacet(userId, records.styles),
    aggregateVocabulary(userId, tracks.moods),
    aggregateVocabulary(userId, tracks.contexts),
    aggregateShelves(userId),
    aggregateCounts(userId),
    aggregateTracksSelected(userId),
  ]);

await db.insert(userFacets).values({
  userId,
  genresJson: JSON.stringify(genres),
  stylesJson: JSON.stringify(styles),
  moodsJson: JSON.stringify(moods),
  contextsJson: JSON.stringify(contexts),
  shelvesJson: JSON.stringify(shelves),
  recordsTotal: counts.total,
  recordsActive: counts.active,
  recordsUnrated: counts.unrated,
  recordsDiscarded: counts.discarded,
  tracksSelectedTotal,
  updatedAt: new Date(),
}).onConflictDoUpdate({
  target: userFacets.userId,
  set: { /* 12 campos */ },
});

await _repopulateVocab(userId, genres, styles, moods, contexts, shelves);
```

**Depois**:
```ts
const [counts, tracksSelectedTotal] = await Promise.all([
  aggregateCounts(userId),
  aggregateTracksSelected(userId),
]);

await db.insert(userFacets).values({
  userId,
  recordsTotal: counts.total,
  recordsActive: counts.active,
  recordsUnrated: counts.unrated,
  recordsDiscarded: counts.discarded,
  tracksSelectedTotal,
  updatedAt: new Date(),
}).onConflictDoUpdate({
  target: userFacets.userId,
  set: { /* 6 campos: 4 counters + tracksSelectedTotal + updatedAt */ },
});

await _repopulateVocab(userId);  // self-contained — recompute interno
```

`_repopulateVocab` perde os 5 args (já é self-contained no Inc 33; só assinatura precisa enxugar).

## Reversão

Se necessário:

```sql
ALTER TABLE user_facets ADD COLUMN genres_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_facets ADD COLUMN styles_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_facets ADD COLUMN moods_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_facets ADD COLUMN contexts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_facets ADD COLUMN shelves_json TEXT NOT NULL DEFAULT '[]';
```

+ `git revert` do commit do Inc 34. Próximo `recomputeFacets` (versão antiga) re-popularia as colunas. Custo: ~5min.

## Notas

- Sem backfill — apenas remoção.
- `user_vocab` (Inc 33) é a fonte autoritativa de vocabulário. Colunas JSON eram fallback temporário.
- Reversibilidade trivial via revert + 5 ADD COLUMN.
- Multi-user safe: `user_id` continua PK.
