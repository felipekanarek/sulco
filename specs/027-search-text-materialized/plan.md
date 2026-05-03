# Implementation Plan: Search text materializado em records

**Branch**: `027-search-text-materialized` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-search-text-materialized/spec.md`

## Summary

Adicionar coluna `records.search_text TEXT NOT NULL DEFAULT ''` (versão pre-normalizada de `artist + ' ' + title + ' ' + (label ?? '')` via `normalizeText` do Inc 18) + index `records(user_id, search_text)`. Hooks em `applyDiscogsUpdate` (sync) e `runInitialImport` (import) computam ao escrever. Refator em `buildCollectionFilters` (collection.ts) substitui pós-filtro JS por `LIKE` SQL contra `search_text`. Backfill 1× via script para records existentes. Migration prod via Turso shell antes do deploy de código.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql dialect), libsql client
**Storage**: Turso (libsql) prod; SQLite local dev. Schema em [src/db/schema.ts](../../src/db/schema.ts) — **delta de 1 coluna + 1 index em `records`**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via instrumentação `[DB]` em logs Vercel
**Target Platform**: Vercel Hobby (Lambda nodejs24.x), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: Load `/?q=...` consome ≤50 rows lidas (vs ~2588 hoje); tempo resposta ≤500ms (vs ~2s)
**Constraints**: zero gasto Vercel Hobby; ordem de deploy crítica (migration→backfill→código senão busca retorna 0); reversível por revert + DROP COLUMN
**Scale/Scope**: ~5 arquivos modificados, ~3 arquivos novos (script backfill, contract); refator localizado

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ `search_text` é zona SYS derivada de campos Discogs (artist/title/label) que já são SYS. DJ nunca edita `artist`/`title`/`label` (sync é único writer desde Inc 001). `search_text` segue mesma regra — apenas sync escreve. Campos AUTHOR (status, shelfLocation, notes, selected, bpm, etc.) intactos.
- **II — Server-First por Padrão**: ✅ SQL volta a fazer todo trabalho de filtro. Pós-filtro JS é REMOVIDO. Sem novos client components.
- **III — Schema é a Fonte da Verdade**: ✅ schema delta explícito em [src/db/schema.ts](../../src/db/schema.ts) (1 coluna + 1 index). Migration prod via Turso shell (padrão Inc 010/012/013/022/023/024).
- **IV — Preservar (Soft-Delete)**: ✅ feature é aditiva (nova coluna + index). Código antigo (`omitText` flag + `matchesNormalizedText` JS path) é REMOVIDO após validação — git history preserva (revert possível via `git revert` + `ALTER TABLE DROP COLUMN`).
- **V — Mobile-Native por Padrão**: ✅ buscas mais rápidas em rede 3G — paginação SQL retorna 50 rows em vez de transferir 2588 pra Lambda.

**Resultado**: passa em todos os princípios. Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/027-search-text-materialized/
├── plan.md                       # Este arquivo
├── research.md                   # Phase 0 — decisões + alternativas
├── data-model.md                 # Phase 1 — delta de records.search_text
├── quickstart.md                 # Phase 1 — validação manual
├── contracts/
│   └── search-text-helper.md     # Phase 1 — contrato de computeSearchText + hooks
└── checklists/
    └── requirements.md           # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── db/
│   └── schema.ts                 # MOD: adicionar `searchText: text('search_text').notNull().default('')` em records + index
├── lib/
│   ├── text.ts                   # MOD (opcional): adicionar helper `computeRecordSearchText(artist, title, label)` que combina campos + chama normalizeText. Mantém normalizeText existente.
│   ├── discogs/
│   │   ├── apply-update.ts       # MOD: ao montar payload de UPDATE/INSERT em records, computar search_text
│   │   └── import.ts             # MOD: ao inserir record durante runInitialImport, computar search_text
│   ├── queries/
│   │   └── collection.ts         # MOD: refator buildCollectionFilters — text path passa a usar LIKE SQL contra records.search_text. Remover flag omitText. Em queryCollection, remover matchesNormalizedText JS post-filter e a lógica de paginação JS condicional.
│   └── actions.ts                # MOD: pickRandomUnratedRecord (Inc 11) usa buildCollectionFilters refatorado — beneficia automaticamente. Re-estruturar pra remover JS post-filter (já que SQL retorna conjunto correto).

scripts/
└── _backfill-search-text.mjs     # NOVO: script de backfill (mesmo padrão Inc 24/27/28)
```

**Helpers já existentes** (sem mudança):

- `normalizeText(s)` — [src/lib/text.ts](../../src/lib/text.ts) (Inc 18). `lowercase + NFD + replace(/\p{M}/gu, '')`. Determinístico.

**Migration prod (sequência crítica)**:

1. Aplicar SQL via `turso db shell sulco-prod`:
   ```sql
   ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
   CREATE INDEX records_user_search_text_idx ON records(user_id, search_text);
   ```
2. Aplicar mesmo SQL em sqlite local (dev) via `sqlite3 sulco.db`.
3. Rodar backfill em prod (`scripts/_backfill-search-text.mjs` com env de prod). Popula 100% dos records.
4. Rodar backfill em dev (sem env, usa file:./sulco.db).
5. **Só então** mergear branch e push pra deploy. Antes desse passo, código novo não deve ir pra prod (LIKE SQL casaria contra '' e busca retornaria 0).

**Frente Tracks (out of scope)**:

`queryCandidates` em `montar.ts` tem text filter próprio (Inc 18) que faz scan de tracks com JS post-filter. Esta feature **NÃO** ataca tracks — fica para Inc futuro se mostrar gargalo. Justificativa: spec foca em records (gargalo confirmado em logs `/`). Tracks scan tem LIMIT 1000 pré-filtro (Inc 23), mitigando.

**Structure Decision**: single-app Next.js App Router. Mudanças localizadas em `src/db/`, `src/lib/discogs/`, `src/lib/queries/`. Sem reorganização.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:

1. **Ordem de deploy crítica**: migration + backfill ANTES do código novo. Se código novo for pra prod sem backfill, busca retorna 0 (LIKE casa contra ''). Mitigação: documentar em quickstart + tasks.md prescreve ordem explícita.

2. **Records criados após migration mas antes do backfill**: improvável (sync é raro), mas se acontecer ficam com `search_text=''`. Backfill é idempotente — segundo run captura.

3. **Mudança de `normalizeText` no futuro**: se algoritmo de normalização for alterado, todos os `search_text` ficam desatualizados. Mitigação: cron noturno de drift correction pode re-popular `search_text` periodicamente (futuro, fora desta feature).

4. **LIKE com `%termo%` não usa o index pelo lado esquerdo**: O index `records(user_id, search_text)` ajuda na cláusula `WHERE user_id = ?` (filtro por usuário, primeira parte da chave) mas full scan dentro do user pra LIKE com prefix wildcard. Aceito — escala atual (~2588 records/user) torna scan trivial. Inc futuro pode adicionar FTS5 se virar gargalo a 10k+.

5. **Concurrent writes em sync que tocam mesmo record**: improvável em uso solo. ON CONFLICT do INSERT em apply-update.ts já lida.
