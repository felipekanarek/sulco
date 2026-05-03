# Contract — `listVocab` + `applyVocabDelta` + `diffVocabArrays`

**Phase**: 1
**Tipo**: contrato de funções internas (não API HTTP)
**Localização**: [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts) (NOVO)

## Contexto

Inc 33 introduz tabela `user_vocab` materializada por `(user_id, kind, term)` com `ref_count`. Este contrato define os 3 helpers expostos por `src/lib/queries/user-vocab.ts` e o pattern de chamada nos callers.

---

## 1. `listVocab(userId, kind)` — leitura cacheada

**Assinatura**:
```ts
export type VocabKind = 'genres' | 'styles' | 'moods' | 'contexts' | 'shelves';
export type VocabEntry = { term: string; count: number };

export const listVocab: (userId: number, kind: VocabKind) => Promise<VocabEntry[]>;
```

**Comportamento**:
- Cached via `react.cache(fn)` (Decisão 6 do research). Dedup automático por `(userId, kind)` no mesmo request RSC.
- SQL: `SELECT term, ref_count AS count FROM user_vocab WHERE user_id = ? AND kind = ? ORDER BY ref_count DESC, lower(term) ASC`.
- Retorna apenas termos com `ref_count > 0` (entries com 0 são deletadas, então o filtro é implícito).
- Custo: 1 SELECT contra `user_vocab_user_kind_idx`. ~15-30 rows típicos.

**Exemplo**:
```ts
const moods = await listVocab(userId, 'moods');
// → [{ term: "solar", count: 12 }, { term: "noir", count: 8 }, ...]
```

**Estabilidade**:
- Assinatura é estável durante a vida da feature.
- Mudanças no `VocabKind` enum requerem migration (CHECK constraint do banco).

---

## 2. `applyVocabDelta(userId, kind, added, removed)` — escrita incremental

**Assinatura**:
```ts
export async function applyVocabDelta(
  userId: number,
  kind: VocabKind,
  added: string[],
  removed: string[],
): Promise<void>;
```

**Comportamento**:
- Filtra termos vazios/whitespace de `added` e `removed` (defensivo).
- Para cada `term` em `added` (ordem não importa):
  ```sql
  INSERT INTO user_vocab (user_id, kind, term, ref_count, updated_at)
  VALUES (?, ?, ?, 1, unixepoch())
  ON CONFLICT(user_id, kind, term)
  DO UPDATE SET ref_count = ref_count + 1, updated_at = unixepoch()
  ```
- Para cada `term` em `removed` (ordem não importa):
  ```sql
  UPDATE user_vocab
  SET ref_count = MAX(0, ref_count - 1), updated_at = unixepoch()
  WHERE user_id = ? AND kind = ? AND term = ?
  ```
- Após todos os UPDATEs, 1 cleanup de zerados:
  ```sql
  DELETE FROM user_vocab WHERE user_id = ? AND kind = ? AND ref_count = 0
  ```
- Idempotente em estrutura (Decisão 4): drift residual é capturado pelo cron noturno.
- Sem return value — fire-and-forget. Erros propagam via reject (caller decide se quer try/catch).

**Custo**:
- N adds + M removes + 1 cleanup = `(N + M + 1)` writes. Tipicamente N ≤ 5, M ≤ 5, total ≤ 11 escritas.

**Exemplo**:
```ts
// DJ trocou "agitado" por "solar" em moods
await applyVocabDelta(userId, 'moods', ['solar'], ['agitado']);

// DJ adicionou shelf novo
await applyVocabDelta(userId, 'shelves', ['E2-P3'], []);

// DJ limpou shelf (set null)
await applyVocabDelta(userId, 'shelves', [], ['E2-P3']);
```

**Estabilidade**:
- Assinatura estável.
- Helper interno `diffVocabArrays` exposto para callers padronizarem diff.

---

## 3. `diffVocabArrays(oldArr, newArr)` — utility puro

**Assinatura**:
```ts
export function diffVocabArrays(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[] };
```

**Comportamento**:
- Pure function. Sem side-effects. Determinístico.
- O(N+M) via Sets.
- Retorna deltas: `added` = termos em new mas não em old; `removed` = termos em old mas não em new.
- Termos duplicados em uma das listas (não deve acontecer mas defensivo) são tratados como Set (cada termo aparece 1× no resultado).

**Implementação** (preview):
```ts
export function diffVocabArrays(oldArr: string[], newArr: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((t) => !oldSet.has(t)),
    removed: oldArr.filter((t) => !newSet.has(t)),
  };
}
```

**Uso típico**:
```ts
const { added, removed } = diffVocabArrays(oldMoods, newMoods);
await applyVocabDelta(userId, 'moods', added, removed);
```

---

## Callsites obrigatórios

### A. `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts)

Quando user edita moods/contexts numa track:

```ts
import { applyVocabDelta, diffVocabArrays } from '@/lib/queries/user-vocab';

// Carregar moods/contexts atuais antes do UPDATE
const before = await db.select({ moods: tracks.moods, contexts: tracks.contexts })
  .from(tracks).where(eq(tracks.id, trackId)).limit(1);

const oldMoods = (before[0]?.moods ?? []) as string[];
const oldContexts = (before[0]?.contexts ?? []) as string[];

// ... UPDATE tracks SET moods=?, contexts=? ...

// Aplicar delta no vocab (substitui chamada a recomputeVocabularyOnly)
const moodsDiff = diffVocabArrays(oldMoods, newMoods);
const contextsDiff = diffVocabArrays(oldContexts, newContexts);
await applyVocabDelta(userId, 'moods', moodsDiff.added, moodsDiff.removed);
await applyVocabDelta(userId, 'contexts', contextsDiff.added, contextsDiff.removed);
```

**Substitui**: chamada a `recomputeVocabularyOnly(userId)` (Inc 27) que escaneava ~10k tracks.

### B. `updateRecordAuthorFields` em [src/lib/actions.ts](../../src/lib/actions.ts)

Quando user edita shelfLocation:

```ts
const before = await db.select({ shelf: records.shelfLocation })
  .from(records).where(eq(records.id, recordId)).limit(1);

const oldShelf = before[0]?.shelf ?? null;
const newShelf = parsed.data.shelfLocation ?? null;

// ... UPDATE records SET shelf_location=? ...

if (oldShelf !== newShelf) {
  const added = newShelf ? [newShelf] : [];
  const removed = oldShelf ? [oldShelf] : [];
  await applyVocabDelta(userId, 'shelves', added, removed);
}
```

**Substitui**: chamada a `recomputeShelvesOnly(userId)` (Inc 27) que escaneava ~2.5k records.

### C. `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts)

Para record EXISTENTE (UPDATE path):

```ts
import { applyVocabDelta, diffVocabArrays } from '@/lib/queries/user-vocab';

// Carregar genres/styles antigos antes do UPDATE
const before = await db.select({ genres: records.genres, styles: records.styles })
  .from(records).where(eq(records.id, recordId)).limit(1);

const oldGenres = (before[0]?.genres ?? []) as string[];
const oldStyles = (before[0]?.styles ?? []) as string[];

// ... UPDATE records SET genres=?, styles=?, ... ...

const genresDiff = diffVocabArrays(oldGenres, release.genres);
const stylesDiff = diffVocabArrays(oldStyles, release.styles);
await applyVocabDelta(userId, 'genres', genresDiff.added, genresDiff.removed);
await applyVocabDelta(userId, 'styles', stylesDiff.added, stylesDiff.removed);
```

Para record NOVO (INSERT path):

```ts
// ... INSERT INTO records (..., genres, styles, ...) ...

await applyVocabDelta(userId, 'genres', release.genres, []);
await applyVocabDelta(userId, 'styles', release.styles, []);
```

**Reaparição** (record archived → não-archived): trata como diff de `[]` (vazio) para o array atual = re-incrementa tudo.

### D. `archiveRecord` em [src/lib/actions.ts](../../src/lib/actions.ts) (ou caminho equivalente)

Bulk decrement quando record vai pra archived=true:

```ts
// 1. Carregar genres/styles + shelf do record + moods/contexts de TODAS as tracks
const recordRow = await db.select({ genres: records.genres, styles: records.styles, shelf: records.shelfLocation })
  .from(records).where(eq(records.id, recordId)).limit(1);

const trackRows = await db.select({ moods: tracks.moods, contexts: tracks.contexts })
  .from(tracks).where(eq(tracks.recordId, recordId));

// 2. ... UPDATE records SET archived=true, archived_at=now ...

// 3. Decrement bulk
const r = recordRow[0];
if (r) {
  const genres = (r.genres ?? []) as string[];
  const styles = (r.styles ?? []) as string[];
  await applyVocabDelta(userId, 'genres', [], genres);
  await applyVocabDelta(userId, 'styles', [], styles);
  if (r.shelf) await applyVocabDelta(userId, 'shelves', [], [r.shelf]);
}
const allMoods = trackRows.flatMap((t) => (t.moods ?? []) as string[]);
const allContexts = trackRows.flatMap((t) => (t.contexts ?? []) as string[]);
await applyVocabDelta(userId, 'moods', [], allMoods);
await applyVocabDelta(userId, 'contexts', [], allContexts);
```

**Restore (reaparição)**: inverso — `added=...` em vez de `removed=...`.

---

## Migração de callers (leitura)

### `listUserGenres`/`listUserStyles`/`listUserShelves` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts)

Antes (Inc 24):
```ts
export async function listUserGenres(userId: number): Promise<FacetCount[]> {
  const f = await getUserFacets(userId);
  return f.genres;  // já era {value, count}[]
}
```

Pós-Inc 33:
```ts
import { listVocab } from '@/lib/queries/user-vocab';

export async function listUserGenres(userId: number): Promise<FacetCount[]> {
  const entries = await listVocab(userId, 'genres');
  return entries.map((e) => ({ value: e.term, count: e.count }));
}
// idem para listUserStyles ('styles') e listUserShelves ('shelves' — converte VocabEntry[] → string[] já que listUserShelves retorna string[])
```

`listUserShelves` ajusta retorno (já era `string[]`):
```ts
export async function listUserShelves(userId: number): Promise<string[]> {
  const entries = await listVocab(userId, 'shelves');
  return entries.map((e) => e.term);
}
```

### `listSelectedVocab` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts)

Pós-Inc 33:
```ts
import { listVocab } from '@/lib/queries/user-vocab';

export async function listSelectedVocab(userId: number, kind: 'moods' | 'contexts'): Promise<string[]> {
  const entries = await listVocab(userId, kind);
  return entries.map((e) => e.term);
}
```

### `listUserVocabulary` em [src/lib/actions.ts](../../src/lib/actions.ts)

Função existente para chip pickers — passa a chamar `listVocab` com mapping de retorno apropriado.

---

## Refator `recomputeFacets` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts)

`recomputeFacets(userId)` ganha sub-step:

```ts
export async function recomputeFacets(userId: number): Promise<void> {
  // ... lógica existente que recompute user_facets ...

  // NOVO: re-popular user_vocab do zero para este user
  await db.transaction(async (tx) => {
    await tx.delete(userVocab).where(eq(userVocab.userId, userId));

    // Mesma lógica do backfill (genres/styles via records, moods/contexts via tracks, shelves via DISTINCT)
    // ... (ver scripts/_backfill-user-vocab.mjs por referência)
  });
}
```

`recomputeVocabularyOnly`, `recomputeShelvesOnly`, `aggregateFacet`, `aggregateVocabulary` viram REDUNDANTES — deletados.

---

## Validação

Pós-deploy, verificar via SQL:

```sql
-- Confirmar tabela populada
SELECT COUNT(*) FROM user_vocab;

-- Confirmar nenhum termo órfão (ref_count=0)
SELECT COUNT(*) FROM user_vocab WHERE ref_count = 0;
-- esperado: 0

-- Confirmar paridade com user_facets antiga (até Inc 34 dropar)
SELECT
  (SELECT COUNT(DISTINCT term) FROM user_vocab WHERE user_id = ? AND kind = 'moods') AS new_count,
  (SELECT json_array_length(moods_json) FROM user_facets WHERE user_id = ?) AS old_count;
-- esperado: new_count == old_count
```

## Como testar

Validação manual via [quickstart.md](./quickstart.md):
- Cenário 1: edição de moods em /disco/[id] consome ≤10 rows.
- Cenário 2: edição de shelf consome ≤10 rows.
- Cenário 3: archive consome ≤30 rows com decrement bulk.
- Cenário 4: pickers em /sets/[id]/montar mostram termos em uso.
- Cenário 5: cron diário re-popula vocab + corrige drift.
- Cenário 6: paridade visual pré vs pós-deploy.
