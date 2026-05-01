# Tasks: Denormalização user_facets (Inc 24)

**Input**: Design documents from `specs/023-user-facets-denormalization/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via dashboard Turso

**Modo de implementação**: emergencial. Cota Turso estourando ~3M reads por curadoria de disco. Tasks lineares, sem paralelismo elaborado, foco em throughput.

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão.

## Phase 2: Foundational

- [X] T002 Schema delta em [src/db/schema.ts](../../src/db/schema.ts): adicionar `userFacets` table conforme [data-model.md](./data-model.md).
- [X] T003 Helper [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts) novo: `UserFacets` type + `getUserFacets` + `recomputeFacets` (com helpers internos `aggregateFacet/Vocabulary/Shelves/Counts/TracksSelected`) conforme [contracts/facets-helper.md](./contracts/facets-helper.md).

## Phase 3: User Story 1 — Reads consumidores migram pra facets

- [X] T004 [US1] Substituir `listUserGenres/Styles` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — derivam de `getUserFacets(userId)`.
- [X] T005 [US1] Substituir `listUserShelves` em collection.ts — deriva de facets.shelves.
- [X] T006 [US1] Substituir `collectionCounts` em collection.ts — deriva dos contadores.
- [X] T007 [US1] Substituir `countSelectedTracks` em collection.ts — deriva de `tracksSelectedTotal`.
- [X] T008 [US1] Substituir parte de `getImportProgress` em [src/lib/actions.ts](../../src/lib/actions.ts) (`recordCount`) — usa `facets.recordsTotal`.
- [X] T009 [US1] Substituir `listUserVocabulary` em actions.ts — deriva de `facets.moods` / `facets.contexts`.

## Phase 4: User Story 2 — Writes disparam recompute síncrono

- [X] T010 [US2] `updateRecordStatus` chama `await recomputeFacets(user.id)` no fim (síncrono Q1).
- [X] T011 [US2] `updateRecordAuthorFields` chama recompute (afeta shelves se shelfLocation mudou).
- [X] T012 [US2] `updateTrackCuration` chama recompute (afeta tracks_selected + moods/contexts).
- [X] T013 [US2] `acknowledgeArchivedRecord` + `acknowledgeAllArchived` chamam recompute.
- [X] T014 [US2] `runIncrementalSync` em [src/lib/discogs/sync.ts](../../src/lib/discogs/sync.ts) chama recompute no fim.
- [X] T015 [US2] `runInitialImport` em [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts) chama recompute no fim.

## Phase 5: User Story 3 — Multi-user isolation

- [X] T016 [US3] Sem código novo — `recomputeFacets(userId)` filtra por userId em todas as queries internas (FR-004 garantido pela construção). Verificação via cenário 6 do quickstart.

## Phase 6: Migration + Backfill + Polish

- [X] T017 Build local: `npm run build` para confirmar zero erros.
- [X] T018 Migration SQL aplicada em **dev local** (sqlite3 sulco.db).
- [X] T019 Backfill em dev local (verificar que row populada).
- [X] T020 Migration SQL aplicada em **prod** via `turso db shell sulco-prod`.
- [X] T021 Backfill em prod (rodar script com env de prod).
- [X] T022 Commit + push + deploy.
- [X] T023 BACKLOG release entry.
