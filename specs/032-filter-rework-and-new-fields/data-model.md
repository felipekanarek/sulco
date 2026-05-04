# Data Model — Inc 8 Filter UX rework + 5 novos filtros

**Phase**: 1
**Status**: schema delta MÍNIMO — apenas remoção do CHECK constraint do enum `kind` em `user_vocab` pra permitir 3 valores novos ('formats', 'countries', 'labels'). Reusa todas as colunas em `records`.

## Entities tocadas

### `records` (existing) — colunas usadas pelos filtros novos

| Campo | Tipo | Constraint | Uso pelo filtro |
|---|---|---|---|
| user_id | INTEGER | NOT NULL FK users(id) | filtro base |
| archived | INTEGER (boolean) | NOT NULL DEFAULT false | filtro base (`archived = 0`) |
| status | TEXT enum | NOT NULL | filtro existing (status) |
| **format** | TEXT | nullable | **NOVO**: filtro Formato |
| **country** | TEXT | nullable | **NOVO**: filtro País |
| **label** | TEXT | nullable | **NOVO**: filtro Selo |
| **year** | INTEGER | nullable | **NOVO**: filtro Ano (década) |
| **shelf_location** | TEXT | nullable | **NOVO**: filtro Prateleira |

Todas as 5 colunas já existem no schema (linhas 78-82, 89). Nenhuma alteração necessária.

### `user_vocab` (existing — Inc 33) — ESTENDIDA

Reusada pra listas distinct de:
- `kind = 'genres'` → filtro Gênero (existing).
- `kind = 'styles'` → filtro Estilo (existing).
- `kind = 'shelves'` → filtro Prateleira (NOVO callsite — mesma fonte).
- **`kind = 'formats'` → filtro Formato (NOVO)**.
- **`kind = 'countries'` → filtro País (NOVO)**.
- **`kind = 'labels'` → filtro Selo (NOVO)**.

**Schema delta no CHECK constraint** (Q4=C — remover constraint):
- Hoje: `CHECK(kind IN ('genres','styles','moods','contexts','shelves'))` (5 valores).
- Pós-Inc 8: **CHECK constraint REMOVIDO**. Validação migra pra TS (Drizzle enum + Zod runtime). SQLite não suporta `ALTER ... DROP/ADD CONSTRAINT`, então remoção via recriação:
  ```sql
  -- Migration prod (rota Q4=C — sem CHECK constraint):
  CREATE TABLE user_vocab_new (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    term TEXT NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, kind, term)
  );
  INSERT INTO user_vocab_new SELECT * FROM user_vocab;
  DROP INDEX user_vocab_user_kind_idx;
  DROP TABLE user_vocab;
  ALTER TABLE user_vocab_new RENAME TO user_vocab;
  CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
  ```
- Total: 5 statements DDL. Operação atômica em libsql (transação implícita).
- Drizzle TS schema (`src/db/schema.ts`): `kind` continua `text('kind', { enum: [...] })` mas enum estendido pra 8 valores.

## Migration

**Schema delta**: 5 statements DDL pra recriar `user_vocab` SEM CHECK constraint (preservando dados existentes via INSERT FROM SELECT). Ver bloco SQL acima.

**Backfill**: re-rodar `recomputeFacets` pra cada user pós-migration. `_repopulateVocab` é estendido (Q6) pra agregar 3 novos kinds:
- `formats`: `SELECT format, COUNT(*) FROM records WHERE userId=? AND archived=0 AND format IS NOT NULL AND format != '' GROUP BY format`
- `countries`: análogo pra `country`
- `labels`: análogo pra `label`

Filtro `format != ''` aplicado (Q5=A — strings vazias tratadas como NULL).

## Tipo `CollectionQuery` enxergado

Em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):

```ts
export type CollectionQuery = {
  userId: number;
  status: StatusFilter;
  text: string;
  genres: string[];
  styles: string[];
  bomba: BombaFilter;
  // NOVOS — Inc 8 (032)
  formats: string[];        // multi-select; OR entre valores
  shelves: string[];        // multi-select; OR entre valores
  decades: number[];        // multi-select de início de década (ex: 1970, 1980)
  countries: string[];      // multi-select; OR entre valores
  labels: string[];         // multi-select; OR entre valores
  // Paginação
  page?: number;
  pageSize?: number;
};
```

## Conditions WHERE adicionais em `buildCollectionFilters`

Pseudo-código:

```ts
if (q.formats.length > 0) {
  conds.push(sql`${records.format} IN ${q.formats}`);
}

if (q.shelves.length > 0) {
  conds.push(sql`${records.shelfLocation} IN ${q.shelves}`);
}

if (q.countries.length > 0) {
  conds.push(sql`${records.country} IN ${q.countries}`);
}

if (q.labels.length > 0) {
  conds.push(sql`${records.label} IN ${q.labels}`);
}

if (q.decades.length > 0) {
  // OR entre décadas: (year BETWEEN 1970 AND 1979) OR (year BETWEEN 1980 AND 1989) ...
  const decadeRanges = q.decades.map(
    (start) => sql`(${records.year} BETWEEN ${start} AND ${start + 9})`,
  );
  conds.push(sql`(${sql.join(decadeRanges, sql` OR `)})`);
}
```

Todas as conditions são single-column WHERE. Index `records_user_archived_status_idx` cobre filtro base; após reduzir o range por user+archived+status, scan single-column é trivial pra ~2.6k records.

## Helpers de listagem para pickers

**Genres / Styles / Shelves / Formats / Countries / Labels** — TODOS via `listVocab(userId, kind)` (Inc 33 estendido). Custo: 1 SELECT contra `user_vocab_user_kind_idx` (~5-100 rows por kind, retorna `{term, count}[]`).

Em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts), helpers existing migram/ganham:
- `listUserGenres(userId)`: já usa `listVocab(userId, 'genres')`.
- `listUserStyles(userId)`: já usa `listVocab(userId, 'styles')`.
- `listUserShelves(userId)`: já usa `listVocab(userId, 'shelves')`.
- **`listUserFormats(userId)`** (NOVO): wrapper sobre `listVocab(userId, 'formats')`.
- **`listUserCountries(userId)`** (NOVO): wrapper sobre `listVocab(userId, 'countries')`.
- **`listUserLabels(userId)`** (NOVO): wrapper sobre `listVocab(userId, 'labels')`.

Custo total dos 6 pickers em 1 load: 6 SELECTs cached × ~30 rows index = ~180 rows lidas.

**Ano**: helper específico (sem materialização — 1 query agregada cached).

```ts
// Range de anos da coleção (pra derivar décadas no frontend)
import { cache } from 'react';

export const getYearRange = cache(
  async (userId: number): Promise<{ min: number | null; max: number | null }> => {
    const [row] = await db
      .select({
        min: sql<number>`MIN(${records.year})`,
        max: sql<number>`MAX(${records.year})`,
      })
      .from(records)
      .where(
        and(
          eq(records.userId, userId),
          eq(records.archived, false),
          isNotNull(records.year),
        ),
      );
    return {
      min: row?.min ?? null,
      max: row?.max ?? null,
    };
  },
);
```

Custo: 1 query agregada (~2.6k rows scan no pior caso, 1× por load cached). Para futuro otimizar, `user_facets` pode adicionar coluna `year_min`/`year_max`. Por enquanto OK.

`react.cache()` request-scoped: dedup automático no mesmo render.

## Hooks de write para materializar formats/countries/labels

`applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) é o **ÚNICO writer** dos campos `format`/`country`/`label` (são DISCOGS metadata, sync-only). Hook segue mesmo padrão Inc 33 + Inc 35:

**INSERT path (record novo, `created=true`)**:
```ts
const fmt = (release.format ?? '').trim();
const ctry = (release.country ?? '').trim();
const lbl = (release.label ?? '').trim();
if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [fmt], []);
if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [ctry], []);
if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [lbl], []);
```

Strings vazias (`""`) tratadas como NULL (Q5=A): filtro `.length > 0` pós-trim.

**UPDATE path (record existente)**: SELECT prev format/country/label antes do UPDATE, computar diff. Cada campo single-value:
- Se prev != new e ambos não-vazios: removed=[prev], added=[new].
- Se prev vazio e new não-vazio: added=[new].
- Se prev não-vazio e new vazio: removed=[prev].
- Se ambos iguais: no-op.

```ts
// Pseudo-código:
const prevFmt = (existing[0].oldFormat ?? '').trim();
const newFmt = (release.format ?? '').trim();
if (prevFmt !== newFmt) {
  await applyVocabDelta(
    userId,
    'formats',
    newFmt.length > 0 ? [newFmt] : [],
    prevFmt.length > 0 ? [prevFmt] : [],
  );
}
// idem para country e label
```

Existing `existing[0]` query precisa estender pra carregar `oldFormat`, `oldCountry`, `oldLabel` (Inc 33+35 já estende com `oldGenres`, `oldStyles` — basta adicionar 3).

**Reaparição** (`wasArchived=true→false`): re-incrementa estado completo (paralelo ao Inc 33+35):
```ts
if (wasArchived) {
  // Inc 33 path existing: genres/styles/moods/contexts/shelves
  // Inc 35 path existing: pivot tables
  // Inc 8 NOVO:
  if (newFmt.length > 0) await applyVocabDelta(userId, 'formats', [newFmt], []);
  if (newCtry.length > 0) await applyVocabDelta(userId, 'countries', [newCtry], []);
  if (newLbl.length > 0) await applyVocabDelta(userId, 'labels', [newLbl], []);
}
```

**`archiveRecord`** em [src/lib/discogs/archive.ts](../../src/lib/discogs/archive.ts) — bulk decrement:
```ts
// Inc 33+35 existing: decrement genres/styles/moods/contexts/shelves + pivots
// Inc 8 NOVO:
const fmt = (recordRow.format ?? '').trim();
const ctry = (recordRow.country ?? '').trim();
const lbl = (recordRow.label ?? '').trim();
if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [], [fmt]);
if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [], [ctry]);
if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [], [lbl]);
```

`archiveRecord` precisa estender SELECT inicial pra carregar format/country/label (já carrega genres/styles/shelf via Inc 35).

## Décadas: derivação no frontend

Dado `{ min: 1965, max: 2024 }` retornado por `getYearRange`:

```ts
const minDecade = Math.floor(min / 10) * 10; // 1960
const maxDecade = Math.floor(max / 10) * 10; // 2020
const decades: number[] = [];
for (let d = minDecade; d <= maxDecade; d += 10) decades.push(d);
// decades = [1960, 1970, 1980, 1990, 2000, 2010, 2020]
// Labels visuais: "60s", "70s", ..., "20s" (ano % 100, padded)
```

Picker mostra apenas décadas dentro do range real da coleção. Sem chips fantasma de décadas vazias.

## URL search params (pares novos)

| Param | Repete | Tipo | Exemplo |
|---|---|---|---|
| `format` | sim | string | `?format=LP&format=7"` |
| `shelf` | sim | string | `?shelf=E1-P2&shelf=E2-P1` |
| `decade` | sim | int | `?decade=1970&decade=1980` |
| `country` | sim | string | `?country=Brazil&country=USA` |
| `label` | sim | string | `?label=Polydor&label=Blue%20Note` |

Existing preservados: `status`, `q` (text), `genre`, `style`, `bomba`, `page`.

## `_repopulateVocab` estendido (Q6)

`recomputeFacets(userId)` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts) chama `_repopulateVocab` que hoje agrega 5 kinds (genres/styles/moods/contexts/shelves). Pós-Inc 8, agrega + 3 kinds (formats/countries/labels) via SELECT GROUP BY direto em records:

```ts
// Adicionar dentro de _repopulateVocab:

// Format / Country / Label: 1 query GROUP BY por kind.
const formatCounts = await _aggregateRecordColumnCounts(userId, records.format);
const countryCounts = await _aggregateRecordColumnCounts(userId, records.country);
const labelCounts = await _aggregateRecordColumnCounts(userId, records.label);

for (const [term, count] of formatCounts) {
  if (count <= 0) continue;
  inserts.push(db.insert(userVocab).values({
    userId, kind: 'formats', term, refCount: count,
    updatedAt: sql`(unixepoch())` as unknown as Date,
  }));
}
// idem countries e labels
```

Helper privado novo `_aggregateRecordColumnCounts(userId, column)`:
```ts
async function _aggregateRecordColumnCounts(
  userId: number,
  column: typeof records.format | typeof records.country | typeof records.label,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ value: column, count: sql<number>`COUNT(*)` })
    .from(records)
    .where(and(
      eq(records.userId, userId),
      eq(records.archived, false),
      isNotNull(column),
      ne(column, ''), // Q5=A — strings vazias filtradas
    ))
    .groupBy(column);
  const map = new Map<string, number>();
  for (const r of rows) {
    const term = r.value?.trim();
    if (term && term.length > 0) map.set(term, Number(r.count));
  }
  return map;
}
```

Backfill em prod: rodar `recomputeFacets` pra cada user (idempotente — já é o pattern Inc 33).

## Reversão

`git revert <commit-inc-8>` reverte código. Sem migration pra reverter. UI volta ao layout pré-Inc 8.

## Notas

- Sem schema delta = sem ordem crítica de deploy. Code deploy direto.
- 3 queries DISTINCT extras por load (formats/countries/labels) — cached request-scoped, ~30-100 rows lidas cada. Custo total ~50-300 rows lidas adicionais por load.
- Multi-user safe: todos os helpers filtram por `WHERE userId = ?`.
- `records.format`/`country`/`label` em prod podem ter NULL pra alguns records — comportamento correto, NULLs ficam fora dos filtros.
