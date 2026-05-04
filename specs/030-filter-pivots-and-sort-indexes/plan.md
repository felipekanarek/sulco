# Implementation Plan: Filtros multi-select via index + sort indexado

**Branch**: `030-filter-pivots-and-sort-indexes` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-filter-pivots-and-sort-indexes/spec.md`

## Summary

Substitui `EXISTS (SELECT 1 FROM json_each(records.genres) WHERE value IN ?)` (que escaneia ~10-15k rows por query no otimizador Turso) por `id IN (SELECT record_id FROM record_genres WHERE genre IN ?)` contra index direto. Quatro tabelas pivot novas (`record_genres`, `record_styles`, `track_moods`, `track_contexts`) com PK composta + index reverso `(value, record_id)`. Hooks em `applyDiscogsUpdate` (genres/styles via diff) + `updateTrackCuration` (moods/contexts via diff). Refator localizado em `buildCollectionFilters` (collection.ts) e `queryCandidates` (montar.ts). Backfill 1× via script. Mais 2 indexes auxiliares pra eliminar TEMP B-TREE sort: `records(user_id, archived, imported_at DESC)` e `records(user_id, archived, archived_at DESC)`. Inc 33 (`user_vocab` para pickers) intacto.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql dialect), libsql client
**Storage**: Turso (libsql) prod; SQLite local dev. Schema em [src/db/schema.ts](../../src/db/schema.ts) — **delta de 4 tabelas + 6 indexes**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via dashboard Turso (rows lidas) + EXPLAIN QUERY PLAN
**Target Platform**: Vercel Hobby (Lambda nodejs24.x), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: Filtros multi-select consomem ≤ 100 rows lidas (vs ~10-15k); listagem default sem TEMP B-TREE; edição de moods ≤ 300ms
**Constraints**: zero gasto Vercel Hobby; ordem de deploy crítica (migration→backfill→código); reversível por revert + DROP TABLE × 4 + DROP INDEX × 2
**Scale/Scope**: ~6 arquivos modificados (schema + 2 queries + 2 hooks + 1 archive); 1 arquivo novo (script backfill); refator localizado

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ pivot tables são zona SYS materializada (derivadas).
  - `record_genres`/`record_styles` derivam de `records.genres`/`records.styles` que são DISCOGS columns — sync é único writer (já era).
  - `track_moods`/`track_contexts` derivam de `tracks.moods`/`tracks.contexts` que são AUTHOR — DJ continua escrevendo NA COLUNA PRIMÁRIA via `updateTrackCuration`. Pivot é só reflexo materializado pra otimizar leitura. Sync NUNCA toca pivots de track (e nem deve — confirma Princípio I).
  - DJ não escreve nos pivots diretamente. Edição via UI continua passando pelas Server Actions existentes.
- **II — Server-First por Padrão**: ✅ refator de queries em RSC + Server Actions. SQL faz todo trabalho de filtragem. Sem novos client components. Sem novas API routes.
- **III — Schema é a Fonte da Verdade**: ✅ schema delta explícito em [src/db/schema.ts](../../src/db/schema.ts) (4 tabelas + 6 indexes). Migration prod via Turso shell (padrão Inc 010/012/013/022/023/024/032/033). Drizzle query builder pra todas as operações; SQL raw apenas em `IN (subquery)` (justificável: melhor expressividade que helper drizzle).
- **IV — Preservar (Soft-Delete)**: ✅ feature aditiva (4 tabelas + 6 indexes novos). Colunas `records.genres`/`styles` e `tracks.moods`/`contexts` permanecem (display + fonte autoritativa pra backfill/recompute). Reversível por revert + DROP TABLE × 4 + DROP INDEX × 2. Nada destrutivo.
- **V — Mobile-Native por Padrão**: ✅ refator backend puro. Filtros ainda mais rápidos em rede 3G — Turso responde em ~50ms (vs ~500ms no caso composto). Sem mudança UI mobile.

**Resultado**: passa em todos os 5 princípios.

## Project Structure

### Documentation (this feature)

```text
specs/030-filter-pivots-and-sort-indexes/
├── plan.md                       # Este arquivo
├── research.md                   # Phase 0 — decisões + alternativas
├── data-model.md                 # Phase 1 — delta de schema (4 tabelas + 6 indexes)
├── quickstart.md                 # Phase 1 — validação manual
├── contracts/
│   └── pivot-helpers.md          # Phase 1 — contratos de helpers de delta
└── checklists/
    └── requirements.md           # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── db/
│   └── schema.ts                       # MOD: adicionar 4 tabelas (recordGenres, recordStyles, trackMoods, trackContexts) + 2 indexes ordenação (records_user_archived_imported_idx, records_user_archived_archivedat_idx). Index reverso de cada pivot já vem na própria tabela.
├── lib/
│   ├── queries/
│   │   ├── collection.ts               # MOD: buildCollectionFilters substitui `EXISTS json_each` por `IN (SELECT ... WHERE value IN ?)` para genres + styles.
│   │   └── montar.ts                   # MOD: queryCandidates substitui `EXISTS json_each` por `IN (SELECT ... WHERE mood/context IN ?)` para moods + contexts.
│   ├── pivot-helpers.ts                # NOVO: helper privado `applyPivotDelta(table, fkColumn, valueColumn, fkId, added, removed)` reutilizável pelos 4 hooks.
│   ├── actions.ts                      # MOD: updateTrackCuration ganha 2 chamadas adicionais a applyPivotDelta (track_moods + track_contexts) ALÉM do applyVocabDelta do Inc 33.
│   └── discogs/
│       └── apply-update.ts             # MOD: hook em INSERT path (insert N entries em record_genres + record_styles); UPDATE path (diff genres/styles → DELETE + INSERT no pivot); reaparição (re-INSERT).

scripts/
└── _backfill-pivot-tables.mjs          # NOVO: backfill (mesmo padrão Inc 24/27/32/33).
```

**Helpers já existentes** (sem mudança):

- `diffVocabArrays(old, new)` em [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts) — Inc 33 helper puro reutilizável aqui (mesma semântica de diff).
- `applyVocabDelta` em [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts) — Inc 33 — continua sendo chamado em paralelo (alimenta `user_vocab` pra pickers).

**Migration prod (sequência crítica)**:

1. Aplicar SQL via `turso db shell sulco-prod`:
   ```sql
   -- 4 CREATE TABLE
   CREATE TABLE record_genres (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, genre TEXT NOT NULL, PRIMARY KEY (record_id, genre));
   CREATE TABLE record_styles (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, style TEXT NOT NULL, PRIMARY KEY (record_id, style));
   CREATE TABLE track_moods (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, mood TEXT NOT NULL, PRIMARY KEY (track_id, mood));
   CREATE TABLE track_contexts (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, context TEXT NOT NULL, PRIMARY KEY (track_id, context));
   -- 4 indexes reversos (value primeiro, fk segundo)
   CREATE INDEX record_genres_genre_idx ON record_genres(genre, record_id);
   CREATE INDEX record_styles_style_idx ON record_styles(style, record_id);
   CREATE INDEX track_moods_mood_idx ON track_moods(mood, track_id);
   CREATE INDEX track_contexts_context_idx ON track_contexts(context, track_id);
   -- 2 indexes ordenação
   CREATE INDEX records_user_archived_imported_idx ON records(user_id, archived, imported_at DESC);
   CREATE INDEX records_user_archived_archivedat_idx ON records(user_id, archived, archived_at DESC);
   ```
2. Aplicar mesmo SQL em sqlite local.
3. Rodar backfill em prod (`scripts/_backfill-pivot-tables.mjs` com env de prod).
4. Rodar backfill em dev local.
5. **Só então** mergear branch + push pra deploy.

**Por que essa ordem**: tabelas pivot precisam estar populadas ANTES de `buildCollectionFilters` consultá-las. Se code deploy entrar antes, filtros multi-select retornariam 0 records.

**Indexes de ordenação podem ser aplicados ANTES ou DEPOIS do code deploy** sem quebrar nada — o ORDER BY funciona com ou sem o index (com TEMP B-TREE quando sem). Mas convém aplicar todos juntos pra simplificar o gate.

**Frente FTS5 (out of scope)**:

Inc 36 (FTS5 search text) fica fora desse Inc — arquitetura completamente diferente (virtual table + triggers + sintaxe `MATCH`). Atacar depois se ainda houver gargalo de busca textual.

**Structure Decision**: single-app Next.js App Router. Mudanças localizadas em `src/db/`, `src/lib/queries/`, `src/lib/actions.ts`, `src/lib/discogs/`. Sem reorganização de pastas. Helper novo `src/lib/pivot-helpers.ts` agrega delta logic reutilizável.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:

1. **Ordem de deploy crítica**: migration + backfill ANTES do code deploy. Se code deploy entrar antes, filtros multi-select retornam 0 records. Mitigação: gate verificável em tasks.md (`SELECT COUNT(*) FROM record_genres + ... > 0`).

2. **Path quente afetado: `updateTrackCuration`**: toggle de mood/context é uma das ações mais frequentes. Inc 35 adiciona 2 chamadas extras (track_moods + track_contexts pivot delta) ALÉM das 2 do Inc 33 (user_vocab moods + contexts). Path passa de ~3 ops por toggle pra ~5-7 ops. Aceitável (cada op é 1 row write), mas validação cuidadosa em ambiente local antes do deploy.

3. **Race em writes concorrentes**: 2 Server Actions tocando mesma track simultaneamente. UPSERT atomic do SQLite/libsql + PK composta evitam corruption. Drift residual capturado por cron (já existe — Inc 33 path).

4. **Backfill ~80-100k INSERTs**: viável em loop sequencial (~3-5min). Janela curta de inconsistência (filtros retornam 0 pra disco em backfill no momento) — mitigação: rodar em janela de baixo uso.

5. **`applyDiscogsUpdate` carrega oldGenres/oldStyles**: já carrega no Inc 33 path (path UPDATE existente). Custo extra: ~zero (mesma query SELECT do Inc 33).

6. **Indexes de ORDER BY DESC**: SQLite/libsql moderno suporta. Verificar via EXPLAIN pós-deploy que SEARCH usa o index sem TEMP B-TREE.

7. **Reversão**: revert de código + 4 DROP TABLE + 2 DROP INDEX. Custo: ~5min. Aceitável.
