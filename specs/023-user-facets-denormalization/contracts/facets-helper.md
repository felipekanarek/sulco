# Contract — facets helper + integrations (Inc 24)

**Feature**: 023-user-facets-denormalization
**File novo**: [src/lib/queries/user-facets.ts](../../../src/lib/queries/user-facets.ts)
**Files alterados**: [src/lib/queries/collection.ts](../../../src/lib/queries/collection.ts), [src/lib/actions.ts](../../../src/lib/actions.ts), [src/lib/discogs/sync.ts](../../../src/lib/discogs/sync.ts), [src/lib/discogs/import.ts](../../../src/lib/discogs/import.ts), [src/db/schema.ts](../../../src/db/schema.ts)

---

## `src/lib/queries/user-facets.ts` (novo)

### Type

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

### `getUserFacets(userId): Promise<UserFacets>`

Lê 1 row do `user_facets`. Se ausente, retorna defaults
(listas vazias, contadores 0).

```typescript
export async function getUserFacets(userId: number): Promise<UserFacets> {
  const [row] = await db
    .select()
    .from(userFacets)
    .where(eq(userFacets.userId, userId))
    .limit(1);

  if (!row) {
    return {
      userId,
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
  }

  return {
    userId: row.userId,
    genres: parseJsonArray<{ value: string; count: number }>(row.genresJson, []),
    styles: parseJsonArray<{ value: string; count: number }>(row.stylesJson, []),
    moods: parseJsonArray<string>(row.moodsJson, []),
    contexts: parseJsonArray<string>(row.contextsJson, []),
    shelves: parseJsonArray<string>(row.shelvesJson, []),
    recordsTotal: row.recordsTotal,
    recordsActive: row.recordsActive,
    recordsUnrated: row.recordsUnrated,
    recordsDiscarded: row.recordsDiscarded,
    tracksSelectedTotal: row.tracksSelectedTotal,
    updatedAt: row.updatedAt,
  };
}

function parseJsonArray<T>(s: string | null | undefined, fallback: T[]): T[] {
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}
```

### `recomputeFacets(userId): Promise<void>`

Executa as queries pesadas que existiam antes (genres scan, styles
scan, moods scan, contexts scan, shelves distinct, counts) e faz
UPSERT na row do user. **Síncrono** (Clarification Q1).

```typescript
export async function recomputeFacets(userId: number): Promise<void> {
  // 1. Aggregate genres + styles (json_each em records)
  const genres = await aggregateFacet(userId, records.genres);
  const styles = await aggregateFacet(userId, records.styles);

  // 2. Aggregate moods + contexts (json_each em tracks JOIN records)
  const moods = await aggregateVocabulary(userId, tracks.moods);
  const contexts = await aggregateVocabulary(userId, tracks.contexts);

  // 3. Distinct shelves (Inc 21 — apenas archived=false)
  const shelves = await aggregateShelves(userId);

  // 4. Counts records por status
  const counts = await aggregateCounts(userId);

  // 5. tracks_selected_total
  const tracksSelectedTotal = await aggregateTracksSelected(userId);

  // 6. UPSERT na row
  await db
    .insert(userFacets)
    .values({
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
    })
    .onConflictDoUpdate({
      target: userFacets.userId,
      set: {
        genresJson: sql`excluded.genres_json`,
        stylesJson: sql`excluded.styles_json`,
        moodsJson: sql`excluded.moods_json`,
        contextsJson: sql`excluded.contexts_json`,
        shelvesJson: sql`excluded.shelves_json`,
        recordsTotal: sql`excluded.records_total`,
        recordsActive: sql`excluded.records_active`,
        recordsUnrated: sql`excluded.records_unrated`,
        recordsDiscarded: sql`excluded.records_discarded`,
        tracksSelectedTotal: sql`excluded.tracks_selected_total`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
```

Helpers internos `aggregateFacet`, `aggregateVocabulary`,
`aggregateShelves`, `aggregateCounts`, `aggregateTracksSelected`
encapsulam as queries SQL atuais (movidas pra cá de `collection.ts`
e `actions.ts`).

---

## Integração 1 — `listUserGenres/Styles` (collection.ts)

```typescript
// Antes: countFacet → SQL scan json_each. Custo ~12k reads.
// Depois:
export async function listUserGenres(userId: number): Promise<FacetCount[]> {
  const facets = await getUserFacets(userId);
  return facets.genres;
}

export async function listUserStyles(userId: number): Promise<FacetCount[]> {
  const facets = await getUserFacets(userId);
  return facets.styles;
}
```

Assinatura externa idêntica (FR-010). Callers não mudam.

---

## Integração 2 — `collectionCounts` (collection.ts)

```typescript
export async function collectionCounts(userId: number): Promise<CollectionCounts> {
  const facets = await getUserFacets(userId);
  return {
    total: facets.recordsTotal,
    ativos: facets.recordsActive,
    naoAvaliados: facets.recordsUnrated,
    descartados: facets.recordsDiscarded,
  };
}
```

---

## Integração 3 — `countSelectedTracks` (collection.ts)

```typescript
export async function countSelectedTracks(userId: number): Promise<number> {
  const facets = await getUserFacets(userId);
  return facets.tracksSelectedTotal;
}
```

---

## Integração 4 — `listUserShelves` (collection.ts)

```typescript
export async function listUserShelves(userId: number): Promise<string[]> {
  const facets = await getUserFacets(userId);
  return facets.shelves;
}
```

---

## Integração 5 — `listUserVocabulary` (actions.ts)

```typescript
export async function listUserVocabulary(
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  const user = await requireCurrentUser();
  const facets = await getUserFacets(user.id);
  // Combina vocabulário do user com seeds default — mantém pattern atual.
  const userTerms = facets[kind].map((term) => ({ term, count: 1 }));
  const seeds = kind === 'moods' ? DEFAULT_MOOD_SEEDS : DEFAULT_CONTEXT_SEEDS;
  return buildSuggestionList(userTerms, seeds);
}
```

(Note: Inc 24 simplifica — termos vêm já ordenados de
`recomputeFacets`. `count` deixa de ser preservado pra moods/
contexts já que UI não usa. Se virar necessidade futura,
expandir schema.)

---

## Integração 6 — `getImportProgress` (actions.ts)

```typescript
async function getImportProgressReadRaw(userId: number): Promise<ImportProgress> {
  const latest = await db.select(...).from(syncRuns)...;

  // Antes: SELECT count(*) FROM records WHERE userId. ~2.5k reads.
  // Depois:
  const facets = await getUserFacets(userId);
  const recordCount = facets.recordsTotal;

  // resto idêntico
}
```

---

## Integração 7 — Server Actions de write chamam `recomputeFacets` (síncrono)

Pattern padrão, em ADIÇÃO ao `revalidatePath` existente:

```typescript
// Exemplo updateRecordStatus:
await db.update(records).set({ status: ... });
await recomputeFacets(user.id);   // ← NOVO. Síncrono (Q1).
revalidatePath('/');
revalidatePath('/curadoria');
revalidatePath(`/disco/${recordId}`);
return { ok: true };
```

**Lista de actions cobertas** (Decisão 7 do research):

| Server Action | Arquivo | Por quê |
|---|---|---|
| `updateRecordStatus` | actions.ts | counts active/unrated/discarded |
| `updateRecordAuthorFields` | actions.ts | shelves (se shelfLocation muda) |
| `updateTrackCuration` | actions.ts | tracks_selected + moods/contexts |
| `acknowledgeArchivedRecord` | actions.ts | archived afeta totals |
| `acknowledgeAllArchived` | actions.ts | idem |
| `runIncrementalSync` | discogs/sync.ts | adiciona/remove records+tracks |
| `runInitialImport` | discogs/import.ts | idem |

**Não cobertas** (não afetam facets, NÃO chamam recompute):
`enrichRecordOnDemand`, `analyzeTrackWithAI`, `updateTrackAiAnalysis`,
`acknowledgeImportProgress`, set actions, AI config, conta actions.

### Tratamento de erro

```typescript
try {
  await recomputeFacets(user.id);
} catch (err) {
  console.error('[recomputeFacets] erro pós-write:', err);
  // FR-008: write principal já ocorreu, retornamos ok mesmo
  // assim. Próximo write tenta de novo.
}
```

---

## Integração 8 — Schema delta

[src/db/schema.ts](../../../src/db/schema.ts):

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

## Migration SQL (aplicar em PROD via Turso shell ANTES do deploy)

```sql
CREATE TABLE IF NOT EXISTS user_facets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  genres_json TEXT NOT NULL DEFAULT '[]',
  styles_json TEXT NOT NULL DEFAULT '[]',
  moods_json TEXT NOT NULL DEFAULT '[]',
  contexts_json TEXT NOT NULL DEFAULT '[]',
  shelves_json TEXT NOT NULL DEFAULT '[]',
  records_total INTEGER NOT NULL DEFAULT 0,
  records_active INTEGER NOT NULL DEFAULT 0,
  records_unrated INTEGER NOT NULL DEFAULT 0,
  records_discarded INTEGER NOT NULL DEFAULT 0,
  tracks_selected_total INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Idempotente; sem downtime.

---

## Backfill — `scripts/_backfill-user-facets.mjs`

```javascript
#!/usr/bin/env node
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { recomputeFacets } from '../src/lib/queries/user-facets.ts';
// (ou implementação inline se imports TS forem complicados)

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;
if (!url) throw new Error('DATABASE_URL required');

const client = createClient({ url, authToken });
const db = drizzle(client);

const allUsers = await db.execute('SELECT id FROM users');
console.log(`Backfilling user_facets para ${allUsers.rows.length} users...`);

for (const row of allUsers.rows) {
  const userId = Number(row.id);
  await recomputeFacets(userId);
  console.log(`✓ user ${userId}`);
}

console.log('Backfill completo.');
```

(Detalhes de import TS podem exigir compilação; implementação real
fica no plano de tasks.)

---

## Não-objetivos

- **NÃO** mexer em entidades `records`, `tracks`, `users`,
  `setTracks` etc.
- **NÃO** alterar UI (zero impacto observável).
- **NÃO** introduzir delta-update incremental — recompute completo
  cabe na escala atual.
- **NÃO** introduzir cron de fallback automático — débito
  documentado pra Inc futuro se observar drift na prática.
- **NÃO** mexer em `loadStatusSnapshot` ou outras queries que não
  consomem facets.
