# Implementation Plan: Denormalização user_facets

**Branch**: `023-user-facets-denormalization` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/023-user-facets-denormalization/spec.md`

## Summary

Materializar agregações pesadas de filtros e contadores numa tabela
nova `user_facets` (1 row por user). Reads em rotas autenticadas
viram **1 SELECT** em vez de scans completos. Atualização via helper
`recomputeFacets(userId)` chamado **síncrono** no fim de Server
Actions de write críticas (Clarification Q1).

**Abordagem**:

1. **Schema delta**: tabela `userFacets` em
   [src/db/schema.ts](../../src/db/schema.ts) com colunas JSON
   (genres, styles, moods, contexts, shelves) + contadores
   (records totais por status, tracks selecionadas).
2. **Helper novo** [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
   - `getUserFacets(userId): Promise<UserFacets>` — 1 SELECT da
     row. Defaults seguros se ausente.
   - `recomputeFacets(userId): Promise<void>` — executa as queries
     pesadas atuais e UPSERT na tabela.
3. **Substituir consumidores** em
   [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts)
   e [src/lib/actions.ts](../../src/lib/actions.ts):
   - `listUserGenres/Styles` → derivam de `genresJson/stylesJson`.
   - `listUserVocabulary` → deriva de `moodsJson/contextsJson`.
   - `listUserShelves` → deriva de `shelvesJson`.
   - `collectionCounts` → deriva dos contadores.
   - `countSelectedTracks` → `tracks_selected_total`.
   - `getImportProgress.recordCount` → `records_total`.
   - **Assinaturas externas mantidas** (FR-010): callers não
     mudam.
4. **Server Actions de write** que chamam `recomputeFacets`:
   `updateRecordStatus`, `updateRecordAuthorFields` (quando
   shelfLocation muda), `updateTrackCuration`,
   `acknowledgeArchivedRecord/All`, `archiveRecord` (interno
   sync), `runIncrementalSync`, `runInitialImport`. Síncrono
   (await) — write retorna após recompute (Q1).
5. **Migration + backfill**: schema delta aplicado via Turso
   shell (`CREATE TABLE IF NOT EXISTS`). Script
   `scripts/_backfill-user-facets.mjs` chama `recomputeFacets`
   pra cada user existente. Aplicar **antes** do deploy do
   código (FR-009) — caso contrário queries retornam defaults
   (zerados) momentaneamente.

UI inalterada — feature backend pura.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM (queries + UPSERT), `next/server` `after()` (não usado; Q1 é síncrono)
**Storage**: SQLite via libsql (Turso em prod). Schema delta de 1 tabela aplicado online via `CREATE TABLE IF NOT EXISTS`
**Testing**: validação manual via quickstart + medição via dashboard Turso (antes/depois)
**Target Platform**: Vercel Hobby + Turso free tier
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: load home / montar consome ≤1k reads (vs ~50k antes); recompute roda em ≤500ms; write total ≤700ms (Clarification Q1 / SC-005)
**Constraints**: zero alteração de UI; assinaturas externas das funções consumidoras preservadas (FR-010); zero downtime na migration
**Scale/Scope**: 1 user em prod (~2500 records, ~10k tracks). Recompute de ~50ms estimado nessa escala. Cap teórico até ~50k records/user; acima disso revisitar abordagem incremental

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: `user_facets` é zona SYS
  (cache materializado). Recompute LÊ campos AUTHOR (records.status,
  shelfLocation, tracks.selected/moods/contexts/etc) mas NUNCA os
  modifica. Sem reescrita de zona AUTHOR por sistema.
- **II. Server-First por Padrão — OK**: queries continuam RSC;
  helper é Server-only. Sem novo client component.
- **III. Schema é a Fonte da Verdade — OK**: schema delta de 1
  tabela. Aplicada via Turso shell (mesmo padrão Inc 010/012/013/022).
- **IV. Preservar em Vez de Destruir — OK**: facets é cache
  derivado. Records e tracks continuam single source. Recompute
  pode regenerar facets a qualquer momento sem perda. Nada
  deletado.
- **V. Mobile-Native por Padrão — OK**: ganho cross-device.
  RSC mais leve = renders mais rápidos em mobile e desktop.
  Sem mudança de UI mobile.

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/023-user-facets-denormalization/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (síncrono cristalizado, JSON columns vs separado, recompute scope, idempotência, backfill flow)
├── data-model.md        # Phase 1 — entidade UserFacets (campos, defaults, relações)
├── contracts/
│   └── facets-helper.md # Contrato dos helpers + integração com queries existentes
├── quickstart.md        # Phase 1 — cenários de validação manual + medição via Turso
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                          # ALTERADO — adiciona `userFacets` table
├── lib/
│   ├── queries/
│   │   ├── user-facets.ts                  # NOVO — getUserFacets + recomputeFacets
│   │   ├── collection.ts                   # ALTERADO — listUserGenres/Styles/Shelves, collectionCounts, countSelectedTracks derivam de user_facets
│   │   └── status.ts                       # SEM MUDANÇA (loadStatusSnapshot não consome facets)
│   └── actions.ts                          # ALTERADO — listUserVocabulary deriva de user_facets; getImportProgress usa records_total; Server Actions de write chamam recomputeFacets
└── lib/discogs/
    ├── sync.ts                             # ALTERADO — runIncrementalSync chama recomputeFacets no fim
    ├── import.ts                           # ALTERADO — runInitialImport chama recomputeFacets no fim
    └── archive.ts                          # SEM MUDANÇA (archiveRecord é chamado por sync que cobre)

scripts/
└── _backfill-user-facets.mjs              # NOVO — script de backfill: itera users existentes e chama recomputeFacets
```

**Migration SQL** (aplicar em prod via `turso db shell sulco-prod` ANTES do deploy de código):

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

Backfill (rodar localmente após migration, com `DATABASE_URL` apontando pra prod):

```bash
DATABASE_URL=libsql://sulco-prod-... DATABASE_AUTH_TOKEN=... node scripts/_backfill-user-facets.mjs
```

**Structure Decision**: monolito Next.js. **3 arquivos
alterados core** + **1 arquivo novo helper** + **1 script de
backfill** + **1 schema delta**. Refator localizado, alta
densidade de impacto (8 queries pesadas substituídas).

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
