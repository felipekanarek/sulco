# Contract — Cache wrappers + index migration (Inc 23)

**Feature**: 022-turso-reads-optimization
**File novo**: [src/lib/cache.ts](../../../src/lib/cache.ts)
**Files alterados**: schema.ts, queries/collection.ts, queries/montar.ts, queries/status.ts, actions.ts (várias funções)

---

## Helper module: `src/lib/cache.ts` (novo)

```typescript
import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';

const DEFAULT_REVALIDATE = 300; // 5min (Clarification Q2 / Decisão 5)

/**
 * Tag canônica por user. Invalidação grossa cobre todas as queries
 * cacheadas do mesmo user (Decisão 3).
 */
function userTag(userId: number): string {
  return `user:${userId}`;
}

/**
 * Serialização determinística de args pra cache key. Garante que
 * mesma combinação de args gera mesma key, com keys de objetos
 * ordenadas alfabeticamente.
 */
function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) return '';
  if (typeof arg === 'object') {
    const keys = Object.keys(arg as Record<string, unknown>).sort();
    return JSON.stringify(arg, keys);
  }
  return String(arg);
}

/**
 * Envolve uma query function (com `userId` como primeiro arg) em
 * `unstable_cache`, aplicando pattern padrão:
 * - cache key: `[name, userId, ...rest]`
 * - tags: `['user:${userId}']`
 * - revalidate: 300s (TTL)
 *
 * Multi-user isolation garantida via tag por user. Invalidação
 * cruzada via `revalidateUserCache`.
 */
export function cacheUser<TArgs extends unknown[], TReturn>(
  fn: (userId: number, ...rest: TArgs) => Promise<TReturn>,
  name: string,
  options?: { revalidate?: number },
): (userId: number, ...rest: TArgs) => Promise<TReturn> {
  return async (userId: number, ...rest: TArgs) => {
    const cached = unstable_cache(
      () => fn(userId, ...rest),
      [name, String(userId), ...rest.map(serializeArg)],
      {
        tags: [userTag(userId)],
        revalidate: options?.revalidate ?? DEFAULT_REVALIDATE,
      },
    );
    return cached();
  };
}

/**
 * Invalida todas as queries cacheadas do user.
 * Chamado pelo final das Server Actions de write críticas.
 */
export function revalidateUserCache(userId: number): void {
  revalidateTag(userTag(userId));
}
```

---

## Integração 1 — `queryCollection` (collection.ts)

```typescript
// Antes:
export async function queryCollection(q: CollectionQuery): Promise<CollectionRow[]> { ... }

// Depois — assinatura mantida, mas wrapper aplicado:
async function queryCollectionRaw(q: CollectionQuery): Promise<CollectionRow[]> {
  // ... corpo atual idêntico, recebe q como parâmetro ...
}

// Adapter pra cacheUser (que espera userId como 1º arg):
export const queryCollection = (q: CollectionQuery): Promise<CollectionRow[]> => {
  const cachedFn = cacheUser(
    (_userId: number, query: CollectionQuery) => queryCollectionRaw(query),
    'queryCollection',
  );
  return cachedFn(q.userId, q);
};
```

**Cache key resultante** (exemplo Felipe usando filtro
`unrated` + busca `joao`): `['queryCollection', '42',
'42', '{"bomba":"any","genres":[],"status":"unrated","styles":[],"text":"joao","userId":42}']`.

Tag: `['user:42']`. TTL: 300s.

---

## Integração 2 — `collectionCounts` (collection.ts)

```typescript
async function collectionCountsRaw(userId: number): Promise<CollectionCounts> {
  // ... corpo atual ...
}

export const collectionCounts = cacheUser(collectionCountsRaw, 'collectionCounts');
```

---

## Integração 3 — `listUserGenres` / `listUserStyles` (collection.ts)

```typescript
async function listUserGenresRaw(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.genres);
}

export const listUserGenres = cacheUser(listUserGenresRaw, 'listUserGenres');

async function listUserStylesRaw(userId: number): Promise<FacetCount[]> {
  return countFacet(userId, records.styles);
}

export const listUserStyles = cacheUser(listUserStylesRaw, 'listUserStyles');
```

---

## Integração 4 — `listUserShelves` (collection.ts)

```typescript
async function listUserShelvesRaw(userId: number): Promise<string[]> {
  // ... corpo atual ...
}

export const listUserShelves = cacheUser(listUserShelvesRaw, 'listUserShelves');
```

---

## Integração 5 — `loadStatusSnapshot` (status.ts)

```typescript
async function loadStatusSnapshotRaw(userId: number): Promise<StatusSnapshot> {
  // ... corpo atual ...
}

export const loadStatusSnapshot = cacheUser(loadStatusSnapshotRaw, 'loadStatusSnapshot');
```

---

## Integração 6 — `getImportProgress` (actions.ts)

`getImportProgress` é exportado de `actions.ts` (não tem
parâmetro userId — usa `requireCurrentUser` internamente).
Refatorar pra extrair lógica e cachear:

```typescript
async function getImportProgressForUserRaw(userId: number): Promise<ImportProgress> {
  // ... corpo atual de getImportProgress, mas recebendo userId como param ...
}

const getImportProgressForUser = cacheUser(
  getImportProgressForUserRaw,
  'getImportProgress',
);

export async function getImportProgress(): Promise<ImportProgress> {
  const user = await requireCurrentUser();
  return getImportProgressForUser(user.id);
}
```

(Mantém assinatura externa intacta — callers não mudam.)

---

## Integração 7 — `listUserVocabulary` (actions.ts)

```typescript
async function listUserVocabularyRaw(
  userId: number,
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  // ... corpo atual, mas recebendo userId como 1º param ...
}

const listUserVocabularyCached = cacheUser(listUserVocabularyRaw, 'listUserVocabulary');

export async function listUserVocabulary(
  kind: 'moods' | 'contexts',
): Promise<string[]> {
  const user = await requireCurrentUser();
  return listUserVocabularyCached(user.id, kind);
}
```

---

## Integração 8 — `queryCandidates` (montar.ts) — NÃO cacheada

`queryCandidates` é executada no `/sets/[id]/montar` que é uma
rota dinâmica com filtros muito variados. Cache fragmentation
seria alta. Decidido NÃO cachear; em vez disso, **re-aplicar
LIMIT 1000 SQL** (Decisão 7).

```typescript
const rows = await db
  .select({ /* ... */ })
  .from(tracks)
  .innerJoin(records, eq(records.id, tracks.recordId))
  .where(and(...conds))
  .orderBy(...orderBy)
  .limit(1000); // ← NOVO (Inc 23): reverte unbounded do Inc 21

// Inc 18 text filter JS continua igual:
const textFiltered = filters.text && filters.text.trim().length > 0
  ? rows.filter((r) => matchesNormalizedText(...))
  : rows;

const limited = textFiltered.slice(0, opts.limit ?? 300);
```

---

## Integração 9 — `pickRandomUnratedRecord` (actions.ts)

Fast path SQL quando text vazio (Decisão 6):

```typescript
export async function pickRandomUnratedRecord(...): Promise<...> {
  const user = await requireCurrentUser();
  const parsed = pickRandomFiltersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Filtros inválidos.' };

  const conds = [
    eq(records.userId, user.id),
    eq(records.archived, false),
    eq(records.status, 'unrated'),
  ];

  const textTerm = parsed.data?.text?.trim() ?? '';
  const hasText = textTerm.length > 0;

  if (parsed.data) {
    conds.push(...buildCollectionFilters({ ...parsed.data, omitText: true }));
  }

  // FAST PATH (Decisão 6): sem text, random direto no SQL — 1 row read
  if (!hasText) {
    const row = await db
      .select({ id: records.id })
      .from(records)
      .where(and(...conds))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    if (row.length === 0) return { ok: true, data: { recordId: null } };
    return { ok: true, data: { recordId: row[0].id } };
  }

  // SLOW PATH (com text): JS post-filter como Inc 18
  const candidates = await db
    .select({ id: records.id, artist: records.artist, title: records.title, label: records.label })
    .from(records)
    .where(and(...conds));

  if (candidates.length === 0) return { ok: true, data: { recordId: null } };

  const filtered = candidates.filter((c) =>
    matchesNormalizedText([c.artist, c.title, c.label], textTerm),
  );
  if (filtered.length === 0) return { ok: true, data: { recordId: null } };

  const picked = filtered[Math.floor(Math.random() * filtered.length)];
  return { ok: true, data: { recordId: picked.id } };
}
```

---

## Integração 10 — Server Actions de write chamam `revalidateUserCache`

No fim das actions críticas, **em adição** aos `revalidatePath`
existentes:

```typescript
// Exemplo updateRecordStatus:
revalidatePath('/');
revalidatePath('/curadoria');
revalidatePath(`/disco/${parsed.data.recordId}`);
revalidateUserCache(user.id); // ← NOVO (Inc 23)
return { ok: true };
```

**Lista de actions que ganham `revalidateUserCache`**:

- `updateRecordStatus`
- `updateRecordAuthorFields`
- `updateTrackCuration`
- `acknowledgeArchivedRecord`
- `acknowledgeAllArchived`
- `acknowledgeImportProgress`
- `analyzeTrackWithAI`
- `updateTrackAiAnalysis`
- `addTrackToSet` / `removeTrackFromSet` / `clearSet` (afetam set tracks; tags refletem em set views — granularidade ampla é OK)
- `runDailyAutoSync` (no fim, após mudanças do Discogs)
- `runInitialImport` (idem; ao terminar)

---

## Integração 11 — Schema delta (índices)

[src/db/schema.ts](../../../src/db/schema.ts):

```typescript
export const records = sqliteTable(
  'records',
  { /* ... */ },
  (t) => ({
    userDiscogsUnique: uniqueIndex('records_user_discogs_unique').on(t.userId, t.discogsId),
    userStatusIdx: index('records_user_status_idx').on(t.userId, t.status),
    userArchivedIdx: index('records_user_archived_idx').on(t.userId, t.archived),
    // NOVO (Inc 23):
    userArchivedStatusIdx: index('records_user_archived_status_idx').on(
      t.userId,
      t.archived,
      t.status,
    ),
  }),
);

export const tracks = sqliteTable(
  'tracks',
  { /* ... */ },
  (t) => ({
    recordPositionUnique: uniqueIndex('tracks_record_position_unique').on(t.recordId, t.position),
    recordSelectedIdx: index('tracks_record_selected_idx').on(t.recordId, t.selected),
    audioFeaturesBacklogIdx: index('tracks_af_backlog_idx').on(
      t.audioFeaturesSource,
      t.audioFeaturesSyncedAt,
    ),
    // NOVO (Inc 23):
    recordIsBombIdx: index('tracks_record_is_bomb_idx').on(t.recordId, t.isBomb),
  }),
);
```

---

## Migration SQL — aplicar em prod via Turso shell

```bash
turso db shell sulco-prod
```

```sql
CREATE INDEX IF NOT EXISTS records_user_archived_status_idx
  ON records(user_id, archived, status);

CREATE INDEX IF NOT EXISTS tracks_record_is_bomb_idx
  ON tracks(record_id, is_bomb);
```

Local dev (sqlite):
```bash
sqlite3 sulco.db < migration.sql
```

---

## Não-objetivos

- **NÃO** introduzir Redis ou cache externo. `unstable_cache` cobre.
- **NÃO** cachear `queryCandidates` — fragmentação alta + LIMIT 1000 já reduz drasticamente.
- **NÃO** mexer em `pickRandomUnratedRecord` além do fast path SQL.
- **NÃO** ajustar Server Actions de leitura (são leituras — não invalidam).
- **NÃO** introduzir migration framework (drizzle-kit migrate). SQL direto via Turso shell mantém pattern do projeto.
- **NÃO** quebrar Inc 18 (busca insensitive a acentos) — JS post-filter Inc 18 permanece em ambos `queryCollection` e `queryCandidates` e `pickRandomUnratedRecord` slow path.
