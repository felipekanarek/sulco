# Data Model — Tabela `user_vocab` dedicada

**Phase**: 1
**Status**: schema delta de 1 tabela nova + 1 index

## Entidade nova

### `user_vocab` — vocabulário materializado por user × kind × term

Tabela dedicada que substitui as 5 colunas JSON em `user_facets`.

| Campo | Tipo | Constraint | Descrição |
|---|---|---|---|
| **user_id** | `INTEGER` | `NOT NULL`, FK → `users.id` `ON DELETE CASCADE` | Usuário a quem o termo pertence. Cascade: ao deletar user, vocab inteiro do user some. |
| **kind** | `TEXT` | `NOT NULL`, `CHECK(kind IN ('genres','styles','moods','contexts','shelves'))` | Discriminator do tipo de vocabulário. 5 kinds fixos. |
| **term** | `TEXT` | `NOT NULL` | A string em si — case-sensitive, space-sensitive, alfabeto livre (Decisão 10). |
| **ref_count** | `INTEGER` | `NOT NULL DEFAULT 0` | Quantas vezes o termo é referenciado no acervo do user (records/tracks não-arquivados). |
| **updated_at** | `INTEGER` | `NOT NULL DEFAULT (unixepoch())` | Timestamp Unix da última modificação. Útil pra debugging/audit. |

### Constraints

- **PRIMARY KEY**: `(user_id, kind, term)` — garante unicidade. Tentar INSERT duplicado com mesma chave dispara `ON CONFLICT`.
- **CHECK** em `kind`: enforce no banco do enum válido.
- **FOREIGN KEY** em `user_id` com cascade delete.

### Indexes

- **PK index** automaticamente criado: `(user_id, kind, term)` — cobre lookup direto por chave (UPSERT, decrement).
- **`user_vocab_user_kind_idx ON (user_id, kind)`** — cobre listagem `WHERE user_id = ? AND kind = ?` (chamada principal de `listVocab`).

### Visibilidade

- Entries com `ref_count = 0` são DELETADAS (sem entries órfãs).
- `listVocab` retorna apenas termos com `ref_count > 0` por construção.

## Migration SQL

```sql
CREATE TABLE user_vocab (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('genres','styles','moods','contexts','shelves')),
  term TEXT NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, kind, term)
);

CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
```

Aplicar em ordem:
1. **Local sqlite** (dev): `sqlite3 sulco.db < migration.sql`
2. **Prod Turso**: `turso db shell sulco-prod` colando o SQL.

## Drizzle TS schema delta

Em [src/db/schema.ts](../../src/db/schema.ts), adicionar:

```ts
export const userVocab = sqliteTable(
  'user_vocab',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['genres', 'styles', 'moods', 'contexts', 'shelves'],
    }).notNull(),
    term: text('term').notNull(),
    refCount: integer('ref_count').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.kind, t.term] }),
    userKindIdx: index('user_vocab_user_kind_idx').on(t.userId, t.kind),
  }),
);

export type UserVocabRow = typeof userVocab.$inferSelect;
export type NewUserVocabRow = typeof userVocab.$inferInsert;
```

Tipos auto-derivados ficam disponíveis após `npm run build`.

## Relações com entidades existentes

### Fontes autoritativas (de onde `ref_count` é derivado)

| Kind | Source | Filtro |
|---|---|---|
| `genres` | `records.genres` (json array) | `WHERE archived = false` |
| `styles` | `records.styles` (json array) | `WHERE archived = false` |
| `moods` | `tracks.moods` (json array) | `WHERE record.archived = false` |
| `contexts` | `tracks.contexts` (json array) | `WHERE record.archived = false` |
| `shelves` | `records.shelfLocation` (text nullable) | `WHERE archived = false AND shelf_location IS NOT NULL` |

### Hooks (writes em fontes que disparam delta em `user_vocab`)

| Operação | Server Action | Kinds tocados | Helper de write |
|---|---|---|---|
| Edit moods/contexts em track | `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts) | `moods`, `contexts` | `applyVocabDelta(userId, 'moods', added, removed)` + idem `'contexts'` |
| Edit shelfLocation em record | `updateRecordAuthorFields` em [src/lib/actions.ts](../../src/lib/actions.ts) | `shelves` | `applyVocabDelta(userId, 'shelves', added, removed)` |
| Sync atualiza genres/styles | `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) | `genres`, `styles` | `applyVocabDelta` (após diff old vs new) |
| Insert record novo (sync) | `applyDiscogsUpdate` (path INSERT) | `genres`, `styles` | `applyVocabDelta(userId, 'genres', allGenres, [])` + idem `'styles'` |
| Archive record | `archiveRecord` em [src/lib/actions.ts](../../src/lib/actions.ts) | `genres`, `styles`, `moods`, `contexts`, `shelves` | bulk decrement de TODAS as referências do disco |
| Restore archived record | `restoreArchivedRecord` (ou `applyDiscogsUpdate` ao detectar reaparição) | mesmos 5 kinds | bulk increment (inverso do archive) |

## Lifecycle de uma entry

```
[criação]  ─►  INSERT (..., ref_count=1)        ◄── primeira referência
                  ▲
                  │ ON CONFLICT
                  │ DO UPDATE SET ref_count += 1
                  │
[uso comum] ─►  UPDATE ref_count += 1            ◄── n-ésima referência
                  ▲
                  │
[remoção]  ─►  UPDATE ref_count = MAX(0, x-1)   ◄── decrement
                  │
                  ▼
[cleanup]  ─►  DELETE WHERE ref_count = 0       ◄── última referência sumiu
```

Cron diário re-popula do zero (DELETE + INSERT em transaction) — corrige drift residual.

## Backfill

Após migration aplicada, rodar `scripts/_backfill-user-vocab.mjs`:

```js
// pseudo-código (real impl em scripts/_backfill-user-vocab.mjs):
for (const userId of allUserIds) {
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM user_vocab WHERE user_id = ?', [userId]);

    // genres + styles do records archived=false
    const records = await tx.execute(
      'SELECT genres, styles FROM records WHERE user_id = ? AND archived = 0',
      [userId],
    );
    const counts = { genres: new Map(), styles: new Map(), moods: new Map(), contexts: new Map(), shelves: new Map() };
    for (const r of records.rows) {
      for (const g of JSON.parse(r.genres ?? '[]')) counts.genres.set(g, (counts.genres.get(g) ?? 0) + 1);
      for (const s of JSON.parse(r.styles ?? '[]')) counts.styles.set(s, (counts.styles.get(s) ?? 0) + 1);
    }

    // shelves
    const shelves = await tx.execute(
      'SELECT shelf_location AS shelf, COUNT(*) AS c FROM records WHERE user_id = ? AND archived = 0 AND shelf_location IS NOT NULL GROUP BY shelf_location',
      [userId],
    );
    for (const r of shelves.rows) counts.shelves.set(String(r.shelf), Number(r.c));

    // moods + contexts via JOIN tracks ↔ records archived=false
    const tracks = await tx.execute(
      'SELECT moods, contexts FROM tracks INNER JOIN records ON records.id = tracks.record_id WHERE records.user_id = ? AND records.archived = 0',
      [userId],
    );
    for (const t of tracks.rows) {
      for (const m of JSON.parse(t.moods ?? '[]')) counts.moods.set(m, (counts.moods.get(m) ?? 0) + 1);
      for (const c of JSON.parse(t.contexts ?? '[]')) counts.contexts.set(c, (counts.contexts.get(c) ?? 0) + 1);
    }

    // Insert all (filter out empty/whitespace terms)
    for (const [kind, map] of Object.entries(counts)) {
      for (const [term, count] of map) {
        if (typeof term !== 'string' || term.trim().length === 0) continue;
        await tx.execute({
          sql: 'INSERT INTO user_vocab (user_id, kind, term, ref_count, updated_at) VALUES (?, ?, ?, ?, unixepoch())',
          args: [userId, kind, term, count],
        });
      }
    }
  });
}
```

Custo: ~3k records + ~10k tracks reads + ~50-100 inserts × N users. ≤5min total em prod.

## Atualização contínua

Hooks em writes atualizam vocab incrementalmente sem scan da coleção.

Ver [contracts/user-vocab-helpers.md](./contracts/user-vocab-helpers.md) para spec dos helpers.

## Reversão

Se necessário reverter (Inc futuro ou rollback):

```sql
DROP INDEX user_vocab_user_kind_idx;
DROP TABLE user_vocab;
```

Código antigo (`recomputeVocabularyOnly`, `recomputeShelvesOnly`, `aggregateFacet`, `aggregateVocabulary`) recuperável via `git revert` do commit do Inc 33.

Colunas JSON em `user_facets` (`*Json`) ainda existem temporariamente como fallback (drop fica para Inc 34) — caminho extra de rollback se algo crítico falhar.

## Notas

- Tabela existe desde a migration mas vazia até backfill. Código novo só funciona pós-backfill — daí ordem crítica em [tasks.md](./tasks.md).
- Drift correction via cron diário (existing em `/api/cron/sync-daily`) — `recomputeFacets` ganha sub-step de re-popular `user_vocab`.
- Multi-user safe por construção (`user_id` em PK).
- ~30 termos × 5 kinds × 5-10 users = ~1500 rows máx num horizonte de anos. Storage trivial.
