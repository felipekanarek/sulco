# Research — Inc 35 / 030: Filter pivots + sort indexes

**Phase**: 0
**Status**: investigação completa via EXPLAIN QUERY PLAN em prod (sessão 2026-05-03 pós-Inc 34) — decisões pré-acordadas pelo mantenedor.

## Decisão 1 — 4 tabelas pivot separadas vs. 1 unificada

**Decisão**: 4 tabelas separadas (`record_genres`, `record_styles`, `track_moods`, `track_contexts`).

**Rationale**:
- Os 4 índices têm **FKs diferentes** (records.id vs tracks.id). Não dá pra unificar mesmo com `kind` discriminator — o FK precisa apontar pra entidade diferente.
- Manter pares semânticos coerentes: 2 pivots de records (DISCOGS), 2 pivots de tracks (AUTHOR).
- Index reverso `(value, fk)` é mais simples de criar quando schema é dedicado.
- Trade-off vs Inc 33 (`user_vocab` unificado com `kind`): Inc 33 tem 5 kinds + 1 FK só (user_id), faz sentido unificar. Aqui são 2 FKs distintos.

**Alternativas consideradas**:
- **1 tabela unificada com `kind`**: rejeitado — FK heterogêneo.
- **2 tabelas (1 pra records, 1 pra tracks) com `kind`**: viável mas complexa (precisaria CHECK constraint dependendo do FK). Rejeitado por simplicidade.

## Decisão 2 — Index reverso `(value, fk_id)` vs apenas `(fk_id, value)` PK

**Decisão**: PK composta `(fk_id, value)` + index reverso `(value, fk_id)`.

**Rationale**:
- PK `(fk_id, value)` cobre lookups "quais valores esse fk_id tem?" (usado em diff: SELECT old values WHERE record_id = ?).
- Index reverso `(value, fk_id)` cobre lookups "quais fk_ids têm esse value?" (usado em filtros: SELECT record_id WHERE genre IN ?).
- PK + index reverso = 2 estruturas que cobrem ambos os lados. Cobertura completa.

**Alternativas consideradas**:
- **Apenas PK**: rejeitado — query do filtro `WHERE genre IN ?` precisa scan PK até achar matches. Sem index dedicado em `value`, custo é O(N).
- **Apenas index `(value, fk_id)` sem PK composta**: rejeitado — perderia constraint de unicidade `(fk_id, value)`.

## Decisão 3 — `IN (subquery)` vs `JOIN`

**Decisão**: `WHERE records.id IN (SELECT record_id FROM record_genres WHERE genre IN ?)`.

**Rationale**:
- SQLite/libsql otimizam `IN (subquery)` eficientemente — converte pra semi-join.
- Mais legível e matches o padrão Inc 32 (`LIKE search_text`).
- Não duplica records se filtros compostos (gênero + estilo) são aplicados ao mesmo record (resolve via INTERSECT semantics implícito do SQL).

**Alternativas consideradas**:
- **`INNER JOIN record_genres ON ...`**: viável mas requer GROUP BY `records.id` pra deduplicar quando filtros multi-select retornam mesmo record várias vezes. Rejeitado por complexidade.
- **`EXISTS (SELECT 1 FROM record_genres WHERE record_id = records.id AND genre IN ?)`**: também viável, similar a `IN`. Rejeitado por convenção (`IN` é mais comum).

## Decisão 4 — Hooks separados em apply-update.ts (path INSERT vs UPDATE)

**Decisão**: 
- INSERT path: após INSERT bem-sucedido E se `created=true` (Inc 33 pattern), bulk INSERT N entries no pivot.
- UPDATE path: SELECT `oldGenres`/`oldStyles` (já fazia no Inc 33), diff via `diffVocabArrays`, DELETE removidos + INSERT adicionados.
- Reaparição (`wasArchived=true`): re-INSERT estado completo — já que records archived têm pivot intacto (archive não toca pivot), o re-INSERT é idempotente via PK conflict.

**Rationale**:
- INSERT path direto (sem diff) é mais simples — record novo não tem entries velhas pra comparar.
- UPDATE diff evita re-DELETE+INSERT desnecessário quando metadata Discogs não mudou.
- Reaparição: Inc 33 já faz re-INSERT em vocab. Aqui replica padrão.

## Decisão 5 — `archiveRecord` NÃO toca pivot

**Decisão**: archive seta `records.archived=true` mas NÃO deleta entries do pivot.

**Rationale**:
- Filtros base na home têm `WHERE records.archived=0` — IDs de records archived no pivot são "vazados" pra subquery mas o INNER JOIN com records (com filtro archived=0) descarta.
- Se archive deletasse pivot, reaparição (Inc 7) precisaria re-INSERT do estado completo. Deixar pivot intacto + cascade ON DELETE em record garante que physical delete (raríssimo) limpa.
- Trade-off: ~poucos KB extras de pivot pra discos archived. Aceitável.

**Alternativas consideradas**:
- **Archive deleta pivot**: rejeitado — complexidade extra em reaparição.
- **Archive marca pivot com flag**: rejeitado — adiciona coluna desnecessária.

## Decisão 6 — Indexes ORDER BY DESC suportados nativamente

**Decisão**: `CREATE INDEX records_user_archived_imported_idx ON records(user_id, archived, imported_at DESC)`.

**Rationale**:
- SQLite ≥3.0 suporta `DESC` em colunas de index. Cobre `ORDER BY imported_at DESC` sem TEMP B-TREE.
- libsql/Turso suportam.
- Verificável via EXPLAIN — deve mostrar SEARCH usando o index sem `USE TEMP B-TREE FOR ORDER BY`.

**Alternativas consideradas**:
- **Index sem DESC (ASC default)**: SQLite consegue scan ascending and reverse scan, então ORDER BY DESC funcionaria. Mas reverse scan é levemente menos eficiente. Spec preserva DESC explícito pra otimização máxima.

## Decisão 7 — Helper `applyPivotDelta` reutilizável vs hooks inline

**Decisão**: Helper privado `applyPivotDelta(table, fkColumn, valueColumn, fkId, added, removed)` em `src/lib/pivot-helpers.ts`.

**Rationale**:
- 4 callsites (record_genres, record_styles, track_moods, track_contexts) precisam da mesma lógica: filter empty/whitespace + DELETE removidos + INSERT adicionados.
- DRY entre callers.
- Testável manualmente (helper isolado).

**Implementação preview**:
```ts
async function applyPivotDelta(
  table: SQLiteTable,
  fkCol: 'record_id' | 'track_id',
  valueCol: 'genre' | 'style' | 'mood' | 'context',
  fkId: number,
  added: string[],
  removed: string[],
): Promise<void> {
  const cleanAdded = added.filter(t => t.trim().length > 0);
  const cleanRemoved = removed.filter(t => t.trim().length > 0);
  if (cleanAdded.length === 0 && cleanRemoved.length === 0) return;

  // DELETE removidos
  if (cleanRemoved.length > 0) {
    await db.delete(table).where(and(eq(table[fkCol], fkId), inArray(table[valueCol], cleanRemoved)));
  }
  // INSERT added (onConflictDoNothing pra idempotência)
  if (cleanAdded.length > 0) {
    await db.insert(table).values(cleanAdded.map(v => ({ [fkCol]: fkId, [valueCol]: v }))).onConflictDoNothing();
  }
}
```

**Alternativas consideradas**:
- **Hooks inline em cada callsite**: rejeitado por duplicação. 4 callsites × ~20 linhas = ~80 linhas redundantes.
- **Generic Drizzle wrapper**: tentado mentalmente — TypeScript types ficam complexos pelo discriminated FK. Helper privado direto resolve.

## Decisão 8 — UPSERT vs DELETE+INSERT

**Decisão**: DELETE removidos + INSERT adicionados (com `onConflictDoNothing`).

**Rationale**:
- Diff explícito é mais claro do que UPSERT total. DJ adiciona 1 mood + remove 1 mood = 2 ops baratas.
- `onConflictDoNothing` no INSERT cobre race com sync (quando 2 paths tentam inserir mesmo (fk, value)).

## Decisão 9 — Backfill com loop por entidade

**Decisão**: Loop sequencial por record/track. Cada entity: DELETE WHERE fk_id=? + INSERT N entries.

**Rationale**:
- Multi-user safe (cada record/track pertence a 1 user via FK transitivo).
- Idempotente — re-execução produz mesmo resultado.
- ~80-100k INSERTs em ~3-5min é tolerável pra operação one-time.

**Alternativas consideradas**:
- **Single-statement INSERT FROM SELECT** (`INSERT INTO record_genres SELECT id, value FROM records, json_each(records.genres)`): mais rápido mas perde controle de erro per-record. Rejeitado por debug-friendliness.

## Decisão 10 — `updateTrackCuration` ganha 2 chamadas adicionais

**Decisão**: path quente passa de ~3 ops por toggle (Inc 33: 1 SELECT + 1 UPDATE + 1 applyVocabDelta × 2 kinds = 3 ops) pra ~5-7 ops (+ 1 applyPivotDelta × 2 kinds = 5 ops, ou 7 se também há DELETE+INSERT em ambos).

**Rationale**:
- Custo absoluto: ~5-7 ops × ~10ms cada = ~50-70ms total. Sub-segundo. Aceitável.
- Inc 33 já adicionou overhead similar e validou (smoke test em prod).
- Trade-off: cada toggle agora é mais caro pra escrever, mas todos os filtros DEPOIS ficam ~99% mais baratos pra ler. Em uso normal (10× mais reads que writes), ROI é massivamente positivo.

**Alternativas consideradas**:
- **Atualizar pivot lazy via cron**: rejeitado — drift visível imediato (DJ aplica filtro e não vê mood que acabou de adicionar).
- **Atualizar pivot via trigger SQL**: rejeitado — viola Princípio III (lógica deve estar visível em código TS).

## Decisão 11 — Indexes ORDER BY no mesmo Inc

**Decisão**: incluir 2 indexes auxiliares (`records_user_archived_imported_idx` + `records_user_archived_archivedat_idx`) no Inc 35.

**Rationale**:
- Trivial: 2 CREATE INDEX statements adicionais. ~2min trabalho extra.
- Mesmo gargalo categórico (TEMP B-TREE sort em listagens) — coerente com pacote.
- Maior cobertura num único deploy + smoke.

**Alternativas consideradas**:
- **Inc separado pra indexes**: rejeitado — overhead de speckit por 2 statements DDL é desproporcional.

## Decisão 12 — FTS5 fora do escopo

**Decisão**: Busca textual via `LIKE '%termo%'` (Inc 32) **fica como está**. FTS5 vira Inc 36 separado se valer.

**Rationale**:
- FTS5 é arquitetura completamente diferente (virtual table + triggers + sintaxe `MATCH`).
- ROI menor (~2.5k rows poupadas vs 25k+ dos pivots).
- Trabalho mais arriscado (mantém triggers que populam FTS5 ao gravar).
- Felipe pode validar Inc 35 primeiro e decidir se Inc 36 vale.

## Resumo de decisões

| # | Decisão | Trade-off principal |
|---|---|---|
| 1 | 4 tabelas pivot separadas | FK heterogêneos |
| 2 | PK composta + index reverso | Cobertura ambos lados |
| 3 | `IN (subquery)` | Mais legível que JOIN |
| 4 | Hooks INSERT vs UPDATE distintos | Match Inc 33 pattern |
| 5 | Archive não toca pivot | Reaparição simples |
| 6 | Indexes ORDER BY DESC | Elimina TEMP B-TREE |
| 7 | Helper `applyPivotDelta` | DRY entre 4 callsites |
| 8 | DELETE+INSERT vs UPSERT | Diff explícito |
| 9 | Backfill sequential | Multi-user safe + idempotente |
| 10 | Path quente ganha overhead | ROI massivo (10× mais reads) |
| 11 | Indexes ORDER BY junto | 1 deploy só |
| 12 | FTS5 fora | Arquitetura diferente |
