# Tasks: Otimização de leituras Turso

**Input**: Design documents from `specs/022-turso-reads-optimization/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual + medição via dashboard Turso.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar shape dos callsites e capturar baseline
de reads ANTES das mudanças.

- [X] T001 Capture baseline: anotar contador atual de row reads no dashboard Turso (https://app.turso.tech) — referência pra medir ganho pós-deploy.
- [X] T002 [P] Verify baseline: read [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — confirmar shape de `queryCollection`, `collectionCounts`, `listUserGenres`, `listUserStyles`, `listUserShelves` (todas com `userId` no primeiro arg ou em prop `q.userId`)
- [X] T003 [P] Verify baseline: read [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) — confirmar `queryCandidates` removeu `.limit()` no Inc 21; pronto pra re-aplicar `LIMIT 1000` SQL
- [X] T004 [P] Verify baseline: read [src/lib/queries/status.ts](../../src/lib/queries/status.ts) — confirmar `loadStatusSnapshot(userId)` shape
- [X] T005 [P] Verify baseline: read [src/lib/actions.ts](../../src/lib/actions.ts) — localizar `getImportProgress` (linha 205), `listUserVocabulary` (linha 710), `pickRandomUnratedRecord` (linha 853), e Server Actions de write que vão receber `revalidateUserCache` (updateRecordStatus, updateRecordAuthorFields, updateTrackCuration, acknowledge*, addTrackToSet, etc.)
- [X] T006 [P] Verify baseline: read [src/db/schema.ts](../../src/db/schema.ts) linhas 98-103 (records indexes) e 149-156 (tracks indexes) onde 2 índices novos serão adicionados

**Checkpoint**: callsites mapeados; baseline anotado; pronto pra
implementar helper.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: criar o helper `cacheUser` + `revalidateUserCache`
que todas as user stories vão consumir. Bloqueia US1 e US3.

- [X] T007 Create [src/lib/cache.ts](../../src/lib/cache.ts) — novo módulo conforme [contracts/cache-wrappers.md](./contracts/cache-wrappers.md): `'use server'`-safe (apenas `'server-only'`); exporta `cacheUser(fn, name, options?)` que envolve com `unstable_cache` aplicando: cache key `[name, userId, ...rest.map(serializeArg)]`, tags `['user:${userId}']`, `revalidate: options?.revalidate ?? 300`. `serializeArg` serializa null/undefined → '', objects → `JSON.stringify` com keys sorted, primitives → String. Também exporta `revalidateUserCache(userId): void` que chama `revalidateTag('user:${userId}')`.

**Checkpoint**: helper pronto. US1 (cache hit / queryCandidates LIMIT / random fast path) e US3 (invalidação) podem consumir.

---

## Phase 3: User Story 1 — DJ usa o app sem estourar cota Turso (Priority: P1) 🎯 MVP

**Goal**: reduzir row reads em ≥80% via 3 frentes consolidadas:
revert Inc 21 + cache layer + 2 índices.

**Independent Test**: cenário 0 (migration) + cenários 1, 2, 3
do [quickstart.md](./quickstart.md) + medição via dashboard
Turso (T001 baseline vs após).

### Implementation for User Story 1 — Frente A (revert Inc 21)

- [X] T008 [US1] Re-aplicar `LIMIT 1000` SQL em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) `queryCandidates`: adicionar `.limit(1000)` após `.orderBy(...orderBy)` e ANTES do filtro JS `matchesNormalizedText`. Inc 18 text filter JS permanece pós-LIMIT. Limit final em JS via `slice(0, opts.limit ?? 300)` permanece.
- [X] T009 [US1] Adapt `pickRandomUnratedRecord` em [src/lib/actions.ts:853](../../src/lib/actions.ts) conforme [contracts/cache-wrappers.md](./contracts/cache-wrappers.md) — Integração 9: extrair `textTerm` antes do bloco SQL; `if (!hasText)` → `ORDER BY RANDOM() LIMIT 1` SQL (fast path 1 read); `else` mantém SELECT amplo + `matchesNormalizedText` JS post-filter + `Math.random()` (slow path Inc 18 preservado). Importar `matchesNormalizedText` já presente.

### Implementation for User Story 1 — Frente B (cache layer)

- [X] T010 [US1] Envolver `queryCollection` em `cacheUser` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) conforme [contracts/cache-wrappers.md](./contracts/cache-wrappers.md) — Integração 1: renomear corpo atual pra `queryCollectionRaw(q: CollectionQuery)`; criar export `queryCollection = (q) => cacheUser((_uid, query) => queryCollectionRaw(query), 'queryCollection')(q.userId, q)`. Cache key absorve filtros via `serializeArg(q)`.
- [X] T011 [P] [US1] Envolver `collectionCounts` em `cacheUser` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — Integração 2: renomear pra `collectionCountsRaw`; export `collectionCounts = cacheUser(collectionCountsRaw, 'collectionCounts')`.
- [X] T012 [P] [US1] Envolver `listUserGenres` e `listUserStyles` em `cacheUser` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — Integração 3: criar `listUserGenresRaw(userId)` e `listUserStylesRaw(userId)`; exports `listUserGenres = cacheUser(listUserGenresRaw, 'listUserGenres')` e `listUserStyles = cacheUser(listUserStylesRaw, 'listUserStyles')`.
- [X] T013 [P] [US1] Envolver `listUserShelves` em `cacheUser` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) — Integração 4: renomear pra `listUserShelvesRaw`; export `listUserShelves = cacheUser(listUserShelvesRaw, 'listUserShelves')`.
- [X] T014 [P] [US1] Envolver `loadStatusSnapshot` em `cacheUser` em [src/lib/queries/status.ts](../../src/lib/queries/status.ts) — Integração 5: renomear pra `loadStatusSnapshotRaw`; export `loadStatusSnapshot = cacheUser(loadStatusSnapshotRaw, 'loadStatusSnapshot')`. Importar `cacheUser` de `@/lib/cache`.
- [ ] T015 [P] [US1] **PULADO** durante execução: `getImportProgress` chama `killZombieSyncRuns` (write side-effect) ANTES de ler. Cachear faria zombie kill rodar só em cache miss. Decisão executiva: deixar sem cache; impacto baixo (~3-4 reads por home load) e separar kill+read seria refator maior. Revisitar como Inc futuro se virar dor.
- [X] T016 [P] [US1] Envolver `listUserVocabulary` em `cacheUser` em [src/lib/actions.ts](../../src/lib/actions.ts) — Integração 7: criar `listUserVocabularyRaw(userId, kind)`; criar `listUserVocabularyCached = cacheUser(listUserVocabularyRaw, 'listUserVocabulary')`; refatorar export pra `const user = await requireCurrentUser(); return listUserVocabularyCached(user.id, kind);`.

### Implementation for User Story 1 — Frente C (índices)

- [X] T017 [US1] Schema delta em [src/db/schema.ts](../../src/db/schema.ts): adicionar `userArchivedStatusIdx: index('records_user_archived_status_idx').on(t.userId, t.archived, t.status)` ao block de records (após userArchivedIdx); adicionar `recordIsBombIdx: index('tracks_record_is_bomb_idx').on(t.recordId, t.isBomb)` ao block de tracks (após recordSelectedIdx).
- [X] T018 [US1] Aplicar migration SQL em **DEV local** (`sqlite3 sulco.db`): `CREATE INDEX IF NOT EXISTS records_user_archived_status_idx ON records(user_id, archived, status); CREATE INDEX IF NOT EXISTS tracks_record_is_bomb_idx ON tracks(record_id, is_bomb);`. Confirmar via `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('records','tracks');`.
- [ ] T019 [US1] Aplicar migration SQL em **PROD** via `turso db shell sulco-prod` (mesmo SQL do T018) — ANTES do deploy de código pra evitar query plans esperando índice que ainda não existe. `IF NOT EXISTS` torna a operação idempotente e online.

**Checkpoint**: US1 funcional. Quickstart cenários 1, 2, 3 validam ganho de reads via dashboard Turso.

---

## Phase 4: User Story 2 — Manter integridade do Inc 21 (busca insensitive a acentos) (Priority: P1)

**Goal**: garantir que após o revert parcial Inc 21 + cache layer, a busca accent-insensitive continua funcionando idêntica.

**Independent Test**: cenário 8 do [quickstart.md](./quickstart.md) — repetir cenários do quickstart 021.

### Implementation for User Story 2

- [X] T020 [US2] Validar manualmente: cenários 1, 2, 3 do quickstart 021 (`specs/021-accent-insensitive-search/quickstart.md`) passam idênticos. Sem código novo — verificação via quickstart cobre.

**Checkpoint**: US2 funcional sem código adicional.

---

## Phase 5: User Story 3 — Cache invalida automaticamente após edições (Priority: P1)

**Goal**: cache invalida via tag quando Server Actions de write executam, mantendo consistência percebida.

**Independent Test**: cenário 4 do [quickstart.md](./quickstart.md) — write em uma rota → cache invalidado em outras.

### Implementation for User Story 3

- [X] T021 [US3] Adicionar `revalidateUserCache(user.id)` no fim de `updateRecordStatus` em [src/lib/actions.ts](../../src/lib/actions.ts), em adição ao `revalidatePath` existente. Importar `revalidateUserCache` de `@/lib/cache`.
- [X] T022 [P] [US3] Adicionar `revalidateUserCache(user.id)` no fim de `updateRecordAuthorFields` em [src/lib/actions.ts](../../src/lib/actions.ts).
- [X] T023 [P] [US3] Adicionar `revalidateUserCache(user.id)` no fim de `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts).
- [X] T024 [P] [US3] Adicionar `revalidateUserCache(user.id)` no fim de `acknowledgeArchivedRecord`, `acknowledgeAllArchived`, `acknowledgeImportProgress` em [src/lib/actions.ts](../../src/lib/actions.ts).
- [X] T025 [P] [US3] Adicionar `revalidateUserCache(user.id)` no fim de `analyzeTrackWithAI` e `updateTrackAiAnalysis` em [src/lib/actions.ts](../../src/lib/actions.ts).
- [X] T026 [P] [US3] Adicionar `revalidateUserCache(user.id)` no fim de `addTrackToSet`, `removeTrackFromSet`, `clearSet`, `updateSet`, `createSet`, `deleteSet` em [src/lib/actions.ts](../../src/lib/actions.ts) (set tracks afetam queries cacheadas indiretamente; granularidade ampla).
- [X] T027 [P] [US3] Adicionar `revalidateUserCache(userId)` no fim de `runDailyAutoSync` e `runInitialImport` em [src/lib/discogs/sync.ts](../../src/lib/discogs/sync.ts) e [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts) — após mudanças do Discogs (sync importa novos records / archives existentes).

**Checkpoint**: US3 funcional. Cache invalida em todas as actions de write críticas.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: type-check + quickstart completo + medição via Turso + entry de release no BACKLOG.

- [X] T028 Run TypeScript + lint: `npm run build`. Confirmar zero erros relacionados a `cacheUser`, `revalidateUserCache`, `unstable_cache`, ou imports atualizados em `collection.ts`/`montar.ts`/`status.ts`/`actions.ts`/`schema.ts`/`sync.ts`/`import.ts`.
- [ ] T029 [P] Execute quickstart cenário 0 (migration índices em prod via Turso shell — ANTES do deploy de código).
- [ ] T030 [P] Execute quickstart cenário 1 (cache hit zero reads): abrir home, aguardar, abrir de novo; conferir reads no dashboard Turso.
- [ ] T031 [P] Execute quickstart cenário 2 (`queryCandidates` ≤1000 reads): abrir `/sets/[id]/montar`; conferir reads.
- [ ] T032 [P] Execute quickstart cenário 3 (botão 🎲 fast path = 1 read): clicar random sem text; conferir reads. Repetir 5×.
- [ ] T033 [P] Execute quickstart cenário 4 (cache invalida em write): edição em outra aba reflete imediato em `/`.
- [ ] T034 [P] Execute quickstart cenário 5 (multi-user isolation — se houver 2ª conta de teste): cache de A não invalida B.
- [ ] T035 [P] Execute quickstart cenário 7 (TTL fallback após 5min): aguardar 6min sem write, próxima visita re-executa.
- [ ] T036 [P] Execute quickstart cenário 8 (Inc 18 preservado): cenários 1, 2, 3 do quickstart 021 passam idênticos.
- [ ] T037 [P] Execute quickstart cenário 9 (Inc 11 random com filtros preservado — slow path): random com text filter funciona.
- [ ] T038 [P] Execute quickstart cenário 10 (mobile / Princípio V): UI inalterada; latência igual ou melhor.
- [ ] T039 Execute quickstart cenário 11 (medição global SC-001): sessão típica consome ≤2k reads; comparar com baseline T001.
- [ ] T040 Acompanhar dashboard Turso por 24-48h pós-deploy: confirmar que consumo diário ficou sustentável dentro da cota free tier.
- [X] T041 Add release entry to [BACKLOG.md](../../BACKLOG.md): mover Inc 23 de "🟢 Próximos" para "Releases" como `022-turso-reads-optimization`; atualizar header "Última atualização".

**Checkpoint**: feature pronta para commit/merge/deploy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 sequencial (anotar baseline antes de qualquer mudança); T002–T006 paralelos (read-only).
- **Foundational (Phase 2)**: T007 sequencial — bloqueia US1 e US3.
- **US1 (Phase 3)**: 
  - **Frente A (T008/T009)**: paralelos — arquivos distintos.
  - **Frente B (T010–T016)**: T010 sequencial primeiro (queryCollection toca o mesmo arquivo que T011-T013); T011-T013 podem ser feitos sequencialmente DEPOIS de T010 no mesmo arquivo (collection.ts) ou paralelos se cuidadosamente patcheados; T014/T015/T016 paralelos com Frente B (arquivos distintos).
  - **Frente C (T017/T018/T019)**: T017 sequencial (schema); T018 dev local; T019 prod ANTES do deploy de código.
- **US2 (Phase 4)**: T020 verificação manual sem código.
- **US3 (Phase 5)**: T021 sequencial; T022–T027 paralelos (todos no mesmo arquivo `actions.ts` exceto T027 — preferir sequencial ordenado pra evitar merge conflicts dentro do mesmo arquivo).
- **Polish (Phase 6)**: T028 sequencial; T029 ANTES dos demais cenários (precisa dos índices em prod); T030–T038 paralelos (cenários distintos); T039–T041 sequenciais.

### User Story Dependencies

- **US1 (P1)**: depende de T007 (cache helper). Entrega ganho principal de reads.
- **US2 (P1)**: depende de T008 (queryCandidates LIMIT) + T009 (random slow path). Sem código novo nessa story.
- **US3 (P1)**: depende de T007. Tasks T021-T027 distribuídas, todas no mesmo padrão.

### Parallel Opportunities

- T002–T006 paralelos no Setup.
- T011-T013 podem ser paralelos COM CUIDADO (mesmo arquivo); melhor sequencial.
- T014, T015, T016 paralelos (arquivos distintos).
- T021–T027 paralelos com cuidado (mesmo arquivo `actions.ts` — preferir sequencial).
- T030–T038 paralelos no Polish.

---

## Implementation Strategy

### MVP First (US1 — frentes A+C primeiro, frente B depois)

1. Phase 1+2: T001 (baseline) → T002–T006 paralelos → T007 (cache helper).
2. **Frente A primeiro** (T008+T009): re-aplicar LIMIT + fast path random — ganho imediato sem cache layer.
3. **Frente C** (T017→T018→T019): aplicar índices em dev e prod.
4. **STOP**: commit + deploy intermediário pra desbloquear cota.
5. **Frente B** (T010–T016): cache layer.
6. **STOP**: commit + deploy.
7. US3 (T021–T027): invalidação.
8. Polish.

### Incremental Delivery (recomendado)

1. **Hotfix 1**: T007 (helper) + T008 (queryCandidates LIMIT) + T009 (random fast path) + T017–T019 (índices). Deploy. Verificar redução imediata.
2. **Hotfix 2**: T010–T016 (cache layer) + T021–T027 (invalidação). Deploy.
3. Polish completo.

### Solo Strategy (single dev — Felipe)

Sequência linear conservadora:
T001 → T002–T006 → T007 → T008 → T009 → T017 → T018 → T019 →
T010 → T011 → T012 → T013 → T014 → T015 → T016 → T020 → T021 →
T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 →
…T040 → T041.

(Pode quebrar em 2 deploys: até T019 + até T041, conforme
"Incremental Delivery" acima.)

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual + dashboard Turso (cenário 11 mede SC-001).
- Princípio I respeitado: leitura/cache. Sem zona AUTHOR tocada.
- Princípio II respeitado: queries continuam RSC; cache server-side.
- Princípio III respeitado: schema delta de 2 índices apenas (sem novas colunas/tabelas).
- Princípio V respeitado: ganho cross-device; UI inalterada.
- Vercel Hobby compatible: Data Cache per-region OK pra user solo BR; cache size <100KB total.
- Inc 18 (021) preservado: text filter accent-insensitive permanece em queryCollection (cached) + queryCandidates (LIMIT 1000) + pickRandomUnratedRecord slow path.
- **Commit recomendado**: 2 commits (hotfix 1 = T007–T019; hotfix 2 = T010–T027) ou 1 único commit se Felipe preferir simplicidade.
- **Migration prod ANTES do deploy de código**: T019 precede T028+ porque queries vão usar os índices novos.
