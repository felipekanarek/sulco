# Contract — Facets Delta Helpers

**Phase**: 1
**Tipo**: contrato de funções internas (não API HTTP)
**Localização**: [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts)

## Contexto

Esta feature substitui a chamada `await recomputeFacets(user.id)` no fim de Server Actions de write por **deltas direcionados**. Os helpers abaixo encapsulam essas operações.

## Helpers novos

### `applyRecordStatusDelta(userId, prev, next)`

Atualiza counters de records por status em `user_facets` quando um disco muda de status. **Não toca outros campos de facets.**

**Assinatura**:
```ts
export async function applyRecordStatusDelta(
  userId: number,
  prev: 'unrated' | 'active' | 'discarded',
  next: 'unrated' | 'active' | 'discarded',
): Promise<void>
```

**Comportamento**:
- Se `prev === next` → no-op (return imediato, 0 reads).
- Caso contrário, executa 1 UPDATE expressão atômica em `user_facets`:
  ```sql
  UPDATE user_facets
  SET records_<prev> = MAX(0, records_<prev> - 1),
      records_<next> = records_<next> + 1,
      updated_at = unixepoch()
  WHERE user_id = ?
  ```
- `MAX(0, ...)` previne valores negativos em caso de drift pré-existente.
- Não toca `records_total` (mudança de status não cria/remove records).

**Custo**: ~3 rows lidas (1 row de `user_facets`).

---

### `applyTrackSelectedDelta(userId, delta)`

Atualiza `tracksSelectedTotal` em `user_facets` quando uma faixa é (de)selecionada.

**Assinatura**:
```ts
export async function applyTrackSelectedDelta(
  userId: number,
  delta: -1 | 1,
): Promise<void>
```

**Comportamento**:
- 1 UPDATE expressão atômica:
  ```sql
  UPDATE user_facets
  SET tracks_selected_total = MAX(0, tracks_selected_total + ?),
      updated_at = unixepoch()
  WHERE user_id = ?
  ```
- `MAX(0, ...)` defensivo.

**Custo**: ~3 rows lidas.

---

### `recomputeShelvesOnly(userId)`

Recomputa **apenas** a lista `shelves_json` em `user_facets`. Usado quando `shelfLocation` de um disco muda.

**Assinatura**:
```ts
export async function recomputeShelvesOnly(userId: number): Promise<void>
```

**Comportamento**:
- 1 SELECT DISTINCT shelf_location WHERE userId AND archived=false AND shelfLocation IS NOT NULL ORDER BY lower(...).
- 1 UPDATE em `user_facets` SET shelves_json = JSON.stringify(result).
- Outros campos de facets intocados.

**Custo**: ~2.5k rows lidas (proporcional a `records` do user) + 1 UPDATE.

**Justificativa**: incremento manual em lista é complexo (precisa contar quantos discos têm aquela shelf — se zero, remover). Recompute idempotente é mais simples e seguro.

---

### `recomputeVocabularyOnly(userId, kind)`

Recomputa **apenas** o vocabulário (moods OU contexts) em `user_facets`. Usado quando moods/contexts de uma track mudam.

**Assinatura**:
```ts
export async function recomputeVocabularyOnly(
  userId: number,
  kind: 'moods' | 'contexts',
): Promise<void>
```

**Comportamento**:
- 1 SELECT JOIN tracks + records + json_each(tracks.<kind>) WHERE userId AND archived=false GROUP BY value ORDER BY count DESC, value localeCompare.
- 1 UPDATE em `user_facets` SET <kind>_json = JSON.stringify(result).
- Outros campos intocados.

**Custo**: ~10k rows lidas (proporcional a `tracks` do user) + 1 UPDATE.

**Justificativa**: idem shelves — incremento manual é complexo. Recompute parcial isolado ao kind afetado é trade-off aceito (raro: DJ adiciona vocab novo poucas vezes por sessão).

---

### `applyDeltaForWrite(userId, scope)` — wrapper opcional

Função de conveniência que recebe um descritor de scope e despacha para os helpers acima. Útil pra Server Actions que sabem o que mudou mas não querem chamar 2-3 helpers.

**Assinatura**:
```ts
type DeltaScope = {
  recordStatus?: { prev: Status, next: Status };
  trackSelected?: { delta: -1 | 1 };
  shelves?: boolean;  // true → recompute shelves
  moods?: boolean;    // true → recompute moods vocabulary
  contexts?: boolean; // true → recompute contexts vocabulary
};

export async function applyDeltaForWrite(
  userId: number,
  scope: DeltaScope,
): Promise<void>
```

**Comportamento**:
- Despacha em paralelo via `Promise.all` para os helpers individuais conforme scope.
- Se scope vazio (`{}`) → no-op (0 reads). Útil pra writes de campos sem impacto em facets que precisam de "delta call site" pelo padrão arquitetural.
- Try/catch defensivo: erros são logados como `[applyDelta] erro pós-write: <err>` e não propagados (write principal já committado).

---

## Uso por Server Action

| Server Action | Delta call |
|---|---|
| `updateRecordStatus(input)` | Carrega `prev` (já feito no UPDATE returning ou query auxiliar). Após UPDATE com sucesso, chama `applyRecordStatusDelta(userId, prev, next)`. |
| `updateTrackCuration(input)` (selected toggle) | Detecta mudança em `selected` (compara antes/depois). Após UPDATE, chama `applyTrackSelectedDelta(userId, delta)`. |
| `updateTrackCuration(input)` (moods/contexts mudaram) | Detecta mudança no payload (chave presente E valor diferente do atual). Após UPDATE, chama `recomputeVocabularyOnly(userId, kind)` para o kind afetado. |
| `updateTrackCuration(input)` (apenas BPM/key/energy/comment/rating/aiAnalysis/fineGenre/references/isBomb) | **Skip total** — nenhuma chamada de delta. |
| `updateRecordAuthorFields(input)` (shelfLocation mudou) | Após UPDATE com `rowsAffected > 0`, chama `recomputeShelvesOnly(userId)`. |
| `updateRecordAuthorFields(input)` (apenas notes) | **Skip total**. |
| `acknowledgeArchivedRecord` / `acknowledgeAllArchived` | **Skip total** — `archived_acknowledged_at` não está em facets. |
| `runIncrementalSync` (sync.ts) | **Continua usando `recomputeFacets` completo** — sync afeta múltiplos records simultaneamente. |
| `runInitialImport` (import.ts) | **Continua usando `recomputeFacets` completo**. |

## Recompute completo continua disponível

`recomputeFacets(userId)` permanece exportado em `user-facets.ts`. Casos de uso:
- Sync incremental (`runIncrementalSync`) e import inicial (`runInitialImport`) — operações em massa.
- Cron diário em `/api/cron/sync-daily` — corrige drift residual.
- Backfill manual via script (caso necessário no futuro).

## Estabilidade do contrato

- Assinaturas dos helpers são consideradas **internas estáveis** durante esta feature.
- Mudanças futuras (ex: adicionar parâmetro de transaction) exigem atualização concomitante deste contrato.
- Helpers não são exportados para client components (todos têm `'server-only'` import via `user-facets.ts`).

## Como testar

Validação manual via [quickstart.md](../quickstart.md):
- Cenário 1: edição que não afeta facets → 0 queries de delta nos logs `[DB]`.
- Cenário 2: toggle status → 1 UPDATE em `user_facets`, 0 SELECTs.
- Cenário 3: toggle selected → 1 UPDATE em `user_facets`.
- Cenário 4: mudança em moods/contexts → 1 SELECT JOIN + 1 UPDATE.
- Cenário 5: mudança em shelfLocation → 1 SELECT DISTINCT + 1 UPDATE.
- Cenário 6: cron diário roda recompute completo (logs mostram 7 queries pesadas, mas só 1×/dia).
