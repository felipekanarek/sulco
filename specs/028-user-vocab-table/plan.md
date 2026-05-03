# Implementation Plan: Tabela `user_vocab` dedicada

**Branch**: `028-user-vocab-table` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-user-vocab-table/spec.md`

## Summary

Substituir as 5 colunas JSON em `user_facets` (`genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson`) por nova tabela `user_vocab` com counters incrementais por termo. PK composta `(user_id, kind, term)` + index `(user_id, kind)`. 2 helpers novos em `src/lib/queries/user-vocab.ts`: `listVocab(userId, kind)` (cached, retorna `{term, count}[]`) e `applyVocabDelta(userId, kind, added, removed)` (UPSERT increment + UPDATE decrement com clamp + DELETE de zerados). Hooks em 4 writes: `updateTrackCuration` (moods/contexts), `updateRecordAuthorFields` (shelf), `applyDiscogsUpdate` (genres/styles), e archive/restore em `archiveRecord`. Migrar 5 callers (`listUserGenres`, `listUserStyles`, `listUserShelves`, `listSelectedVocab`, `listUserVocabulary`) para o novo helper. `recomputeFacets` ganha lógica de re-popular `user_vocab` do zero (drift correction via cron diário). Backfill 1× via `scripts/_backfill-user-vocab.mjs`. Drop das colunas JSON antigas fica para Inc 34 separado.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql dialect), libsql client, React 19 (`cache()`)
**Storage**: Turso (libsql) prod; SQLite local dev. Schema em [src/db/schema.ts](../../src/db/schema.ts) — **delta de 1 tabela nova + 1 index**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via instrumentação `[DB]` em logs Vercel
**Target Platform**: Vercel Hobby (Lambda nodejs24.x), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: Edição moods/contexts ≤10 rows lidos (vs ~10k); edição shelf ≤10 rows (vs ~2.5k); archive de record ≤30 rows (vs ~60k); listagem chips ≤200ms percebidos
**Constraints**: zero gasto Vercel Hobby; ordem de deploy crítica (migration→backfill→código senão pickers ficam vazios); reversível por revert + DROP TABLE
**Scale/Scope**: ~7 arquivos modificados, ~2 arquivos novos (helper + script backfill); refator localizado

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ `user_vocab` é zona SYS materializada (derivada de campos primários). Edições do DJ continuam escrevendo APENAS em `tracks.moods`/`contexts`, `records.shelfLocation`, etc. — `user_vocab` é só reflexo. Sync (`applyDiscogsUpdate`) toca apenas genres/styles (DISCOGS); moods/contexts/shelf permanecem AUTHOR e não são tocados por sync. Nenhum campo AUTHOR muda de zona ou semântica.
- **II — Server-First por Padrão**: ✅ `listVocab` é server-only RSC cached via `react.cache`. `applyVocabDelta` chamado de Server Actions existentes (`updateTrackCuration`, `updateRecordAuthorFields`, `archiveRecord`, `applyDiscogsUpdate`). Sem novos client components. Sem novas API routes.
- **III — Schema é a Fonte da Verdade**: ✅ schema delta explícito em [src/db/schema.ts](../../src/db/schema.ts) (1 tabela + 1 index). Migration prod via Turso shell (padrão Inc 010/012/013/022/023/024/032). Drizzle query builder pra todas as operações. SQL raw apenas no `ON CONFLICT DO UPDATE` (justificado inline — drizzle não tem helper compacto pra UPSERT incremental).
- **IV — Preservar (Soft-Delete)**: ✅ feature é aditiva (nova tabela). Colunas JSON antigas em `user_facets` permanecem temporariamente como fallback até Inc 34 dropar. `recomputeFacets` continua exportado como fallback de drift correction. Git history preserva caminho de revert (revert + DROP TABLE).
- **V — Mobile-Native por Padrão**: ✅ feature é puramente backend (refator de queries). Sem novos componentes UI. Pickers de moods/contexts/shelves existentes continuam funcionando inalterados na UI (mobile + desktop). Quickstart inclui cenário mobile (validar picker em /sets/[id]/montar em viewport ≤640px após deploy).

**Resultado**: passa em todos os princípios. Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/028-user-vocab-table/
├── plan.md                       # Este arquivo
├── research.md                   # Phase 0 — decisões + alternativas
├── data-model.md                 # Phase 1 — delta de user_vocab
├── quickstart.md                 # Phase 1 — validação manual
├── contracts/
│   └── user-vocab-helpers.md     # Phase 1 — contratos de listVocab + applyVocabDelta
└── checklists/
    └── requirements.md           # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── db/
│   └── schema.ts                       # MOD: adicionar tabela `userVocab` + index `userVocabUserKindIdx`
├── lib/
│   ├── queries/
│   │   ├── user-vocab.ts               # NOVO: helpers `listVocab(userId, kind)` cached + `applyVocabDelta(userId, kind, added, removed)`
│   │   ├── user-facets.ts              # MOD: `recomputeFacets` ganha sub-step de re-popular user_vocab; `recomputeVocabularyOnly`/`recomputeShelvesOnly`/`aggregateFacet`/`aggregateVocabulary` REMOVIDOS (callers migram pra applyVocabDelta direto)
│   │   ├── collection.ts               # MOD: `listUserGenres`/`listUserStyles`/`listUserShelves` passam a chamar `listVocab(userId, kind)` em vez de ler `user_facets.*Json`. Assinaturas externas preservadas.
│   │   └── montar.ts                   # MOD: `listSelectedVocab(userId, kind)` passa a chamar `listVocab`. Semântica fica oficialmente: termos com ref_count>0 (em uso real).
│   ├── actions.ts                      # MOD: `updateTrackCuration` substitui `recomputeVocabularyOnly` por `applyVocabDelta` para moods+contexts; `updateRecordAuthorFields` substitui `recomputeShelvesOnly` por `applyVocabDelta` para shelves; `archiveRecord` (decrement) e `restoreArchivedRecord` (re-increment) ganham hook bulk; `listUserVocabulary` chama `listVocab`
│   └── discogs/
│       └── apply-update.ts             # MOD: ao detectar diff em genres/styles entre old e new, chamar `applyVocabDelta` para o record. INSERTs de records novos: increment de genres/styles. Reaparição (archived→não-archived): re-increment.

scripts/
└── _backfill-user-vocab.mjs            # NOVO: script de backfill (mesmo padrão Inc 24/27/32)
```

**Helpers já existentes** (sem mudança):

- `setEquals` (utility usado em diff de moods/contexts) — pode reusar
- `cacheUser` em [src/lib/cache.ts](../../src/lib/cache.ts) — `listVocab` provavelmente NÃO usa (preferir `react.cache` request-scoped, já que vocab muda pouco e cache key inclui userId+kind — checar no research)

**Migration prod (sequência crítica)**:

1. Aplicar SQL via `turso db shell sulco-prod`:
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
2. Aplicar mesmo SQL em sqlite local (dev) via `sqlite3 sulco.db`.
3. Rodar backfill em prod (`scripts/_backfill-user-vocab.mjs` com env de prod). Popula 100% dos termos.
4. Rodar backfill em dev (sem env, usa file:./sulco.db).
5. **Só então** mergear branch e push pra deploy. Antes desse passo, código novo não deve ir pra prod (pickers ficariam vazios — `listVocab` retornaria 0 rows pra todos os kinds).

**Frente Inc 34 (out of scope)**:

Drop das colunas JSON antigas em `user_facets` fica fora desse Inc — vira **Inc 34** separado (cleanup ~30min, depois de Inc 33 validado em prod). Reduz risco do Inc 33 (rollback fácil enquanto colunas JSON existirem como fallback potencial).

**Structure Decision**: single-app Next.js App Router. Mudanças localizadas em `src/db/`, `src/lib/queries/`, `src/lib/actions.ts`, `src/lib/discogs/`. Sem reorganização de pastas.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:

1. **Ordem de deploy crítica**: migration + backfill ANTES do código novo. Se código novo for pra prod sem backfill, `listVocab` retorna 0 rows e pickers de moods/contexts/genres/styles/shelves ficam vazios em todas as telas. Mitigação: documentar em quickstart + tasks.md prescreve ordem explícita + gate verificável (`SELECT COUNT(*) FROM user_vocab WHERE user_id=?`).

2. **Diff incorreto em hooks**: caller compute `added`/`removed` errado (ex: passa o array novo inteiro como `added` sem fazer diff). Resultado: ref_count drifta. Mitigação: helper interno `diffVocabArrays(old, new)` em `src/lib/queries/user-vocab.ts` para padronizar — todos os callers usam o mesmo algoritmo. Drift residual capturado pelo cron noturno.

3. **Race em writes concorrentes no mesmo termo**: dois Server Actions disparam `applyVocabDelta` ao mesmo tempo. UPSERT do SQLite/libsql é atômico (`ON CONFLICT(user_id, kind, term) DO UPDATE SET ref_count = ref_count + 1`). Sem race em counters.

4. **`applyDiscogsUpdate` precisa carregar `genres`/`styles` antigos pra diff**: query extra antes do UPDATE. Custo: 1 SELECT (~1 row), trivial. Já existe pattern Inc 27 (`applyRecordStatusDelta` carrega status antigo).

5. **Archive bulk com 50+ tracks**: pode resultar em 50+ DECREMENTs em moods/contexts. Aceitável (ainda é constante por track, não por coleção). Cron noturno corrige drift se algum decrement falhar silenciosamente.

6. **Edição via SQL direto (debug, scripts ad-hoc)**: bypass dos hooks → drift. Mitigação: cron noturno corrige em ≤24h. Documentado em quickstart.

7. **Concurrent backfill com edição em prod**: durante backfill, edição do DJ pode rodar em paralelo. Backfill faz `DELETE WHERE user_id=? + INSERT * N`. Se edição pega o intervalo entre delete e insert, vê vocab vazio temporariamente. Mitigação: rodar backfill em janela de baixo uso (manual, fora do pico) + transação se possível.
