# Contract — `applyPivotDelta` helper

**Phase**: 1
**Tipo**: contrato de função interna (não API HTTP)
**Localização**: [src/lib/pivot-helpers.ts](../../src/lib/pivot-helpers.ts) (NOVO)

## Contexto

Inc 35 introduz 4 tabelas pivot. Os 4 hooks (record_genres no INSERT path do sync, record_styles idem, track_moods em updateTrackCuration, track_contexts idem) precisam da mesma lógica: filtrar empty/whitespace + DELETE removidos + INSERT adicionados (com onConflictDoNothing).

Helper privado evita duplicação.

## Assinatura

```ts
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

type PivotTable = typeof recordGenres | typeof recordStyles | typeof trackMoods | typeof trackContexts;
type FkColumn = 'recordId' | 'trackId';
type ValueColumn = 'genre' | 'style' | 'mood' | 'context';

export async function applyPivotDelta(
  table: PivotTable,
  fkColumn: FkColumn,
  valueColumn: ValueColumn,
  fkId: number,
  added: string[],
  removed: string[],
): Promise<void>;
```

## Comportamento

1. Filtra `added`/`removed` removendo entries vazias/whitespace.
2. Se ambos estão vazios pós-filtro, retorna no-op (zero queries).
3. Se `removed` não-vazio: `DELETE FROM <table> WHERE <fkColumn> = ? AND <valueColumn> IN (<removed>)`.
4. Se `added` não-vazio: `INSERT INTO <table> (<fkColumn>, <valueColumn>) VALUES (...) ON CONFLICT DO NOTHING`.

`onConflictDoNothing` é defensivo — cobre race entre 2 paths tentando inserir mesmo (fk, value).

Idempotente: re-execução com mesmos args produz mesmo estado final.

## Custo

- DELETE: 1 query, custo proporcional a `removed.length` (lookup PK por entry — O(log N) cada).
- INSERT: 1 query batched.
- Total: 2 queries por chamada (ou 1 se um lado é vazio).

## Callers obrigatórios

### A. `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts)

**Path INSERT** (record novo, `created=true`):
```ts
await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, release.genres, []);
await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, release.styles, []);
```

**Path UPDATE** (record existente):
```ts
const oldGenres = (existing[0].oldGenres ?? []) as string[];
const oldStyles = (existing[0].oldStyles ?? []) as string[];

const gDiff = diffVocabArrays(oldGenres, release.genres);
const sDiff = diffVocabArrays(oldStyles, release.styles);

await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, gDiff.added, gDiff.removed);
await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, sDiff.added, sDiff.removed);
```

**Reaparição** (`wasArchived=true→false`):
```ts
// Estado completo é re-incrementado. Pivot pode ter entries velhas (Inc 35 não toca em archive) — onConflictDoNothing cobre.
await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, release.genres, []);
await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, release.styles, []);
```

### B. `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts)

**Após UPDATE bem-sucedido em tracks**:
```ts
if (moodsChanged) {
  const { added, removed } = diffVocabArrays(prev.moods ?? [], payload.moods ?? []);
  await applyVocabDelta(user.id, 'moods', added, removed);  // Inc 33 (vocab)
  await applyPivotDelta(trackMoods, 'trackId', 'mood', trackId, added, removed);  // Inc 35 (pivot)
}
if (contextsChanged) {
  const { added, removed } = diffVocabArrays(prev.contexts ?? [], payload.contexts ?? []);
  await applyVocabDelta(user.id, 'contexts', added, removed);
  await applyPivotDelta(trackContexts, 'trackId', 'context', trackId, added, removed);
}
```

## Tipo TS — implementação preview

```ts
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { recordGenres, recordStyles, trackMoods, trackContexts } from '@/db/schema';

type PivotTable = typeof recordGenres | typeof recordStyles | typeof trackMoods | typeof trackContexts;

export async function applyPivotDelta(
  table: PivotTable,
  fkColumn: 'recordId' | 'trackId',
  valueColumn: 'genre' | 'style' | 'mood' | 'context',
  fkId: number,
  added: string[],
  removed: string[],
): Promise<void> {
  const cleanAdded = added.filter((t) => typeof t === 'string' && t.trim().length > 0);
  const cleanRemoved = removed.filter((t) => typeof t === 'string' && t.trim().length > 0);

  if (cleanAdded.length === 0 && cleanRemoved.length === 0) return;

  // DELETE removidos
  if (cleanRemoved.length > 0) {
    // @ts-expect-error - dynamic column access via FK + value names
    await db.delete(table).where(
      and(eq(table[fkColumn], fkId), inArray(table[valueColumn], cleanRemoved)),
    );
  }

  // INSERT added
  if (cleanAdded.length > 0) {
    const values = cleanAdded.map((v) => ({ [fkColumn]: fkId, [valueColumn]: v }));
    // @ts-expect-error - dynamic column access
    await db.insert(table).values(values).onConflictDoNothing();
  }
}
```

**Nota TS**: helper genérico discriminando 4 tabelas + 2 FK + 4 value columns leva a tipos complexos. Aceitável usar `@ts-expect-error` em 2 pontos do helper privado — alternativa seria 4 funções específicas (mais código mas type-safe). Decisão: helper com `@ts-expect-error` localizado e callers type-safe (passam table+columns corretos).

**Alternativa type-safe**: 4 funções específicas (`applyRecordGenresDelta`, `applyRecordStylesDelta`, `applyTrackMoodsDelta`, `applyTrackContextsDelta`). Mais código mas zero `@ts-expect-error`. Decisão na implementação: avaliar overhead.

## Como testar

Validação manual via [quickstart.md](../quickstart.md):
- Cenário 4: filtro de gênero retorna ~30 records consumindo ≤100 rows lidas.
- Cenário 5: filtro de mood em /montar consome ≤100 rows.
- Cenário 7: edição de mood adiciona DELETE+INSERT em pivot.
- Cenário 8: sync incremental atualiza pivot automaticamente.
