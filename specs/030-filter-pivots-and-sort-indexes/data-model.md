# Data Model — Inc 35 Pivot tables + sort indexes

**Phase**: 1
**Status**: schema delta de 4 tabelas + 6 indexes (4 pivots + 2 sort).

## Entidades novas

### 1. `record_genres` — pivot de gêneros do disco

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| record_id | INTEGER | NOT NULL, FK records(id) ON DELETE CASCADE | Disco a quem o gênero pertence |
| genre | TEXT | NOT NULL | Valor do gênero (case-sensitive) |

**PK**: `(record_id, genre)` — unicidade.

### 2. `record_styles` — pivot de estilos do disco

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| record_id | INTEGER | NOT NULL, FK records(id) ON DELETE CASCADE | Disco |
| style | TEXT | NOT NULL | Valor do estilo |

**PK**: `(record_id, style)`.

### 3. `track_moods` — pivot de moods da faixa

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| track_id | INTEGER | NOT NULL, FK tracks(id) ON DELETE CASCADE | Faixa |
| mood | TEXT | NOT NULL | Valor do mood |

**PK**: `(track_id, mood)`.

### 4. `track_contexts` — pivot de contextos da faixa

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| track_id | INTEGER | NOT NULL, FK tracks(id) ON DELETE CASCADE | Faixa |
| context | TEXT | NOT NULL | Valor do contexto |

**PK**: `(track_id, context)`.

## Indexes

### 4 indexes reversos pra filtros multi-select

- `record_genres_genre_idx` ON `record_genres(genre, record_id)` — cobre `WHERE genre IN ?` retornando record_ids.
- `record_styles_style_idx` ON `record_styles(style, record_id)`.
- `track_moods_mood_idx` ON `track_moods(mood, track_id)`.
- `track_contexts_context_idx` ON `track_contexts(context, track_id)`.

### 2 indexes auxiliares pra ORDER BY

- `records_user_archived_imported_idx` ON `records(user_id, archived, imported_at DESC)` — elimina TEMP B-TREE em listagem da home.
- `records_user_archived_archivedat_idx` ON `records(user_id, archived, archived_at DESC)` — elimina TEMP B-TREE em listagem de archived em /status.

## Migration SQL

```sql
-- Pivots
CREATE TABLE record_genres (
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  PRIMARY KEY (record_id, genre)
);
CREATE INDEX record_genres_genre_idx ON record_genres(genre, record_id);

CREATE TABLE record_styles (
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  style TEXT NOT NULL,
  PRIMARY KEY (record_id, style)
);
CREATE INDEX record_styles_style_idx ON record_styles(style, record_id);

CREATE TABLE track_moods (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  PRIMARY KEY (track_id, mood)
);
CREATE INDEX track_moods_mood_idx ON track_moods(mood, track_id);

CREATE TABLE track_contexts (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  context TEXT NOT NULL,
  PRIMARY KEY (track_id, context)
);
CREATE INDEX track_contexts_context_idx ON track_contexts(context, track_id);

-- Sort indexes
CREATE INDEX records_user_archived_imported_idx ON records(user_id, archived, imported_at DESC);
CREATE INDEX records_user_archived_archivedat_idx ON records(user_id, archived, archived_at DESC);
```

10 statements DDL. Aplicar em ordem:
1. Local sqlite (dev).
2. Prod Turso shell.

## Drizzle TS schema delta

Em [src/db/schema.ts](../../src/db/schema.ts), adicionar:

```ts
// 4 pivot tables
export const recordGenres = sqliteTable(
  'record_genres',
  {
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    genre: text('genre').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordId, t.genre] }),
    genreIdx: index('record_genres_genre_idx').on(t.genre, t.recordId),
  }),
);

export const recordStyles = sqliteTable(
  'record_styles',
  {
    recordId: integer('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    style: text('style').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recordId, t.style] }),
    styleIdx: index('record_styles_style_idx').on(t.style, t.recordId),
  }),
);

export const trackMoods = sqliteTable(
  'track_moods',
  {
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    mood: text('mood').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.mood] }),
    moodIdx: index('track_moods_mood_idx').on(t.mood, t.trackId),
  }),
);

export const trackContexts = sqliteTable(
  'track_contexts',
  {
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    context: text('context').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.context] }),
    contextIdx: index('track_contexts_context_idx').on(t.context, t.trackId),
  }),
);
```

E nas tabelas existentes `records`, adicionar 2 indexes auxiliares aos `(t) => ({...})`:
```ts
recordsUserArchivedImportedIdx: index('records_user_archived_imported_idx').on(
  t.userId,
  t.archived,
  desc(t.importedAt),
),
recordsUserArchivedArchivedatIdx: index('records_user_archived_archivedat_idx').on(
  t.userId,
  t.archived,
  desc(t.archivedAt),
),
```

(Importar `desc` de drizzle-orm.)

## Hooks de write

| Operação | Local | Comportamento |
|---|---|---|
| Insert record (sync) | `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) — INSERT path quando `created=true` | Bulk INSERT N entries em `record_genres` + `record_styles` |
| Update record (sync) | `applyDiscogsUpdate` UPDATE path | SELECT oldGenres/oldStyles → diff → DELETE removidos + INSERT adicionados |
| Reaparição | `applyDiscogsUpdate` UPDATE path quando `wasArchived=true` | Re-INSERT com onConflictDoNothing (estado atual) |
| Edit moods/contexts (DJ) | `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts) | Antes do UPDATE, carrega oldMoods/oldContexts (Inc 33 path); depois aplica diff em pivot |
| Archive record | `archiveRecord` em [src/lib/discogs/archive.ts](../../src/lib/discogs/archive.ts) | **NÃO toca pivot** — filtros base têm WHERE archived=0 |
| Delete record (raríssimo) | qualquer caminho | Cascade FK limpa pivot automaticamente |

## Helper `applyPivotDelta`

Em [src/lib/pivot-helpers.ts](../../src/lib/pivot-helpers.ts) (NOVO):

Ver [contracts/pivot-helpers.md](./contracts/pivot-helpers.md).

## Refator de queries

### `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts)

**Antes**:
```ts
if (q.genres.length > 0) {
  conds.push(
    sql`EXISTS (SELECT 1 FROM json_each(${records.genres}) WHERE value IN ${q.genres})`,
  );
}
if (q.styles.length > 0) {
  conds.push(
    sql`EXISTS (SELECT 1 FROM json_each(${records.styles}) WHERE value IN ${q.styles})`,
  );
}
```

**Depois**:
```ts
if (q.genres.length > 0) {
  conds.push(
    sql`${records.id} IN (SELECT record_id FROM record_genres WHERE genre IN ${q.genres})`,
  );
}
if (q.styles.length > 0) {
  conds.push(
    sql`${records.id} IN (SELECT record_id FROM record_styles WHERE style IN ${q.styles})`,
  );
}
```

### `queryCandidates` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts)

Mesmo padrão para filtros de moods/contexts:

**Antes** (esboço):
```ts
EXISTS (SELECT 1 FROM json_each(tracks.moods) WHERE value IN ?)
```

**Depois**:
```ts
tracks.id IN (SELECT track_id FROM track_moods WHERE mood IN ?)
```

## Backfill

Script `scripts/_backfill-pivot-tables.mjs` (mesmo padrão Inc 33/34):

```js
// 1. Para cada record (todos): DELETE pivot record_genres/record_styles WHERE record_id=? + INSERT N entries.
// 2. Para cada track (todos): DELETE pivot track_moods/track_contexts WHERE track_id=? + INSERT N entries.
// Custo: ~80-100k INSERTs total. ~3-5min em prod.
```

Ver pseudo-code em tasks.md (T-XX).

## Reversão

Se necessário:

```sql
DROP INDEX records_user_archived_archivedat_idx;
DROP INDEX records_user_archived_imported_idx;
DROP TABLE track_contexts;
DROP TABLE track_moods;
DROP TABLE record_styles;
DROP TABLE record_genres;
```

+ `git revert` do commit. Custo: ~5min. Filtros voltam a usar `EXISTS json_each` (~10-15k rows lidas por load — baseline pré-Inc 35).

## Notas

- Pivots existem desde a migration mas vazios até backfill.
- Código novo só funciona pós-backfill — daí ordem crítica em [tasks.md](./tasks.md).
- Multi-user safe via FK cascade (record/track → user).
- ~80-100k entries em prod. Storage: ~3-5MB. Trivial.
- Inc 33 (`user_vocab`) intacto — pivots não duplicam: Inc 33 conta termos pra pickers, Inc 35 mapeia entity↔term pra filtros. Funções complementares.
