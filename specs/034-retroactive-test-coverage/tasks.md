---
description: "Task list — Inc 37 (034) Cobertura de testes retroativa (Inc 23-32)"
---

# Tasks: Cobertura de testes retroativa (Inc 23-32)

**Input**: Design documents from `/specs/034-retroactive-test-coverage/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: feature inteira **É** testes — todas as tasks são `tests/*.test.ts` exceto setup/coverage tooling/polish.

**Organization**: tasks agrupadas por User Story conforme priorização do spec.md. **MVP = US1 (Tier 3 Helpers Puros)** — entrega valor sozinho e valida pattern Princípio VI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências)
- **[Story]**: User Story (US1=Tier 3 Helpers, US2=Tier 1 AUTHOR, US3=Tier 2 Equivalence, US4=Suíte verde cross-cutting)
- Caminhos absolutos respeitam estrutura existente

---

## Phase 1: Setup

**Purpose**: pré-requisitos compartilhados — ambiente + coverage tooling.

- [x] T001 Verificar branch atual = `034-retroactive-test-coverage` via `git branch --show-current`
- [x] T002 Baseline build verde: `npm run build` em [/Users/infoprice/Documents/Projeto Sulco/sulco](.) (gate antes de qualquer mudança)
- [x] T003 Baseline suite verde: `npm run test` retorna 164 passing / 0 failing (Inc 36 estado)
- [x] T004 Instalar `@vitest/coverage-v8` como devDependency: `npm install --save-dev @vitest/coverage-v8` em [package.json](../../package.json) (FR-009 + Decision 5)
- [x] T005 Adicionar script `test:coverage` em [package.json](../../package.json) `"scripts"`: `"test:coverage": "vitest run --coverage"` (FR-009)
- [x] T006 Configurar bloco `coverage` em [vitest.config.ts](../../vitest.config.ts) com `provider: 'v8'`, `reporter: ['text', 'html', 'json-summary']`, include `src/**/*.{ts,tsx}`, exclude `src/**/*.test.{ts,tsx}` + `src/db/seed.ts` + `src/app/**` (Decision 5)
- [x] T007 Adicionar `coverage/` ao [.gitignore](../../.gitignore) (raw output não-versionado)
- [x] T008 Smoke `npm run test:coverage` — confirmar geração de `coverage/coverage-summary.json` sem erros

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: helper de seed compartilhado pra Tier 1 + Tier 2.

- [x] T009 Criar [tests/helpers/seed-collection.ts](../../tests/helpers/seed-collection.ts) exportando `seedCollectionFixture(db)` que cria 2 users + 5 records + 5 tracks + 1 set + pivots (record_genres, record_styles, record_formats, track_moods, track_contexts) + user_facets + user_vocab conforme tabelas em [data-model.md](./data-model.md). Retorna `{ u1, u2, r1..r5, t1..t5, s1 }` com IDs.
- [x] T010 Smoke local do helper: criar 1 teste throwaway que usa `createTestDb` + `seedCollectionFixture`, rodar via `npx vitest run`, validar que todas as inserts passaram (depois deletar o teste throwaway)

---

## Phase 3: User Story 1 — Tier 3 Helpers Puros (P1) 🟢 MVP

**Story Goal**: 3 unit tests sobre `normalizeText`, `computeRecordSearchText`, `diffVocabArrays` cobrem padrão feliz + casos edge mapeados em specs anteriores. Refator futuro nesses helpers tem rede de segurança.

**Independent Test**: `npx vitest run tests/unit/normalize-text.test.ts tests/unit/compute-record-search-text.test.ts tests/unit/diff-vocab-arrays.test.ts` retorna ≥30 cases passing.

### Implementação

- [x] T011 [P] [US1] Criar [tests/unit/normalize-text.test.ts](../../tests/unit/normalize-text.test.ts) cobrindo `normalizeText` (Inc 18) em `src/lib/text.ts` com ≥12 cases: padrão pt-BR (São Paulo→sao paulo, Açúcar→acucar, Sérgio→sergio), Unicode universal (naïve/cafe/garcon), case-insensitive, bidirecional (entrada normalizada continua normalizada), edge cases (empty, null/undefined, whitespace-only, emojis, números preservados)
- [x] T012 [P] [US1] Criar [tests/unit/compute-record-search-text.test.ts](../../tests/unit/compute-record-search-text.test.ts) cobrindo `computeRecordSearchText` (Inc 32) em `src/lib/text.ts` com ≥10 cases (FR-001): concat artist + title + label normalizado, label null produz string sem trailing whitespace duplicado, label vazio idem, paridade com `normalizeText` (mesmo input rende mesmo output), diacríticos preservam separação por espaço, multi-word artist/title preservam ordem, edge cases (todos vazios, só artist, só title), idempotência (rodar 2× produz mesmo resultado)
- [x] T013 [P] [US1] Criar [tests/unit/diff-vocab-arrays.test.ts](../../tests/unit/diff-vocab-arrays.test.ts) cobrindo `diffVocabArrays` (Inc 33) em `src/lib/queries/user-vocab.ts` com ≥10 cases: added/removed disjuntos, dedup interno (entrada com duplicata), ordem preservada, edge cases (ambos vazios, idênticos retorna `{added:[], removed:[]}`, completo replacement, only adds, only removes)

### Validação

- [x] T014 [US1] Rodar `npx vitest run tests/unit/normalize-text.test.ts tests/unit/compute-record-search-text.test.ts tests/unit/diff-vocab-arrays.test.ts` — ≥30 cases passing, 0 failing
- [x] T015 [US1] Suite total verde: `npm run test` retorna ≥194 passing, 0 failing (164 antes + ≥30 novos)

---

## Phase 4: User Story 2 — Tier 1 AUTHOR Proteção (P1)

**Story Goal**: cada Server Action AUTHOR-write tem teste integration cobrindo caminho feliz + ownership-fail + Zod + Princípio I.

**Independent Test**: `npx vitest run tests/integration/{archive-record-author-preserved,delete-set-preserves-tracks,update-record-status,update-record-author-fields,update-track-curation,sync-preserves-author-fields}.test.ts` retorna ≥18 cases passing.

### Estender existing

- [x] T016 [US2] Estender [tests/integration/sync-preserves-author-fields.test.ts](../../tests/integration/sync-preserves-author-fields.test.ts) com novo `describe('Inc 35 pivots cross-write consistency')` cobrindo ≥6 cases: INSERT path popula record_genres + record_styles + track_moods + track_contexts; UPDATE path com diff aplica added/removed; REAPARIÇÃO (`wasArchived=true → false`) re-popula pivots; archive não toca pivot (filter archived=0). Reusa `seedUserWithCuratedTrack` existing; estender test-db.ts SE faltar coluna (commit separado se necessário)

### Novos arquivos integration

- [x] T017 [P] [US2] Criar [tests/integration/archive-record-author-preserved.test.ts](../../tests/integration/archive-record-author-preserved.test.ts) com ≥6 cases: `archiveRecord(userId, recordId)` mantém status/shelfLocation/notes intactos (Princípio I); track AUTHOR fields (selected/bpm/musicalKey/energy/rating/moods/contexts/comment/aiAnalysis) intactos; `archived_at` setado; pivot entries intactas (filter archived=0 cobre); ownership-fail rejeita user errado; idempotência (re-archive de já archived é no-op)
- [x] T018 [P] [US2] Criar [tests/integration/delete-set-preserves-tracks.test.ts](../../tests/integration/delete-set-preserves-tracks.test.ts) com ≥5 cases: `deleteSet(setId)` deleta set + set_tracks via FK CASCADE; tracks ficam intactos (curadoria preservada); records ficam intactos; ownership-fail rejeita user errado (set de outro user não deletável); set inexistente retorna erro estruturado
- [x] T019 [P] [US2] Criar [tests/integration/update-record-status.test.ts](../../tests/integration/update-record-status.test.ts) com ≥5 cases: caminho feliz (active→discarded persiste); ownership-fail; Zod rejeita status inválido (ex: 'invalid'); revalidateUserCache chamado (spy); Princípio I (campos não-status ficam intactos)
- [x] T020 [P] [US2] Criar [tests/integration/update-record-author-fields.test.ts](../../tests/integration/update-record-author-fields.test.ts) com ≥5 cases: caminho feliz (shelfLocation + notes persistem); ownership-fail; Zod rejeita shelfLocation > 50 chars; null clears (shelfLocation=null limpa); Princípio I (campos não-tocados intactos — status, archived, etc.)
- [x] T021 [P] [US2] Criar [tests/integration/update-track-curation.test.ts](../../tests/integration/update-track-curation.test.ts) com ≥7 cases: caminho feliz (selected + bpm + key + energy + moods/contexts persistem); Zod rejeita BPM out-of-range (>300 ou <40); Zod rejeita musicalKey inválido; multi-select moods aplica `applyVocabDelta` + `applyPivotDelta` corretos; ownership via record JOIN rejeita user errado; rating null clears; Princípio I (campos do record + outras tracks intactos)

### Validação

- [x] T022 [US2] Rodar `npx vitest run tests/integration/sync-preserves-author-fields.test.ts tests/integration/archive-record-author-preserved.test.ts tests/integration/delete-set-preserves-tracks.test.ts tests/integration/update-record-status.test.ts tests/integration/update-record-author-fields.test.ts tests/integration/update-track-curation.test.ts` — ≥30 cases passing
- [x] T023 [US2] Smoke regressão simulada (SC-006): comentar 1 linha em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) que preserva `status` no UPDATE, rodar `npm run test:constitution`, confirmar ≥1 falha — depois **REVERTER**

---

## Phase 5: User Story 3 — Tier 2 Performance Equivalence (P2)

**Story Goal**: cada otimização Inc 23-36 tem equivalence assertion garantindo resultado idêntico.

**Independent Test**: `npx vitest run tests/integration/{buildCollectionFilters,applyVocabDelta,applyPivotDelta,cache-user}.test.ts` retorna ≥30 cases passing.

- [x] T024 [P] [US3] Criar [tests/integration/buildCollectionFilters.test.ts](../../tests/integration/buildCollectionFilters.test.ts) com ≥10 cases (1 it() por filtro): seedar 5 records via `seedCollectionFixture` e assertar subset retornado por `queryCollection`: status=active retorna 3 records, text='T1' retorna r1, genre=Funk retorna r1, style=AOR retorna r1, format=LP retorna r1+r4, year=1985 retorna r1, country=US retorna r3+r5, label='Polydor' retorna r1, shelf=E1 retorna r1+r3, bomba=only retorna r1
- [x] T025 [P] [US3] Criar [tests/integration/applyVocabDelta.test.ts](../../tests/integration/applyVocabDelta.test.ts) com ≥7 cases (Inc 33): UPSERT increment cria entry com ref_count=1; chamar 2× incrementa pra 2; DELETE decrement com clamp `MAX(0, ref_count-1)`; remoção até 0 deleta entry; idempotência (ambos arrays vazios é no-op); diff misto (added + removed simultâneos); kind inválido rejeitado
- [x] T026 [P] [US3] Criar [tests/integration/applyPivotDelta.test.ts](../../tests/integration/applyPivotDelta.test.ts) com ≥7 cases (Inc 35): INSERT batched via onConflictDoNothing (race-safe); DELETE seletivo via inArray; filtro empty/whitespace dos arrays input; no-op quando ambos vazios; multi-pivot (record_genres + track_moods independentes); FK CASCADE em record delete; idempotência (re-aplicar mesmo delta produz mesmo estado)
- [x] T027 [P] [US3] Criar [tests/integration/cache-user.test.ts](../../tests/integration/cache-user.test.ts) com ≥5 cases (Inc 23): `cacheUser` produz cache key composto (function name + userId + args serializados); tag `user:N` aplicada; TTL 300s respeitado (mock `Date.now`); `revalidateUserCache(userId)` invalida apenas tag específica do user (multi-user isolation: u1 cache miss não afeta u2); cacheUser passa args corretamente pra função cacheada
- [x] T028 [US3] Rodar `npx vitest run tests/integration/buildCollectionFilters.test.ts tests/integration/applyVocabDelta.test.ts tests/integration/applyPivotDelta.test.ts tests/integration/cache-user.test.ts` — ≥30 cases passing

---

## Phase 6: User Story 4 — Suíte completa verde (P1, cross-cutting)

**Story Goal**: todos os ≥60 testes novos coexistem com 164 existentes; suíte total verde; zero regressão.

**Independent Test**: `npm run test` retorna exit code 0 com 0 failing.

- [x] T029 [US4] Rodar `npm run test` (suite full) — confirmar ≥194 passing, 0 failing, ≥37 todo. Capturar output em log
- [x] T030 [US4] Rodar `npm run test:constitution` — confirmar passa verde após Tier 1 estender Inc 35 pivots
- [x] T031 [US4] Princípio II preservado: `git diff main -- src/` retorna vazio (zero touch em produção, FR-007). Se um teste expor bug genuíno, abrir entry em [BACKLOG.md](../../BACKLOG.md) como "Bug N" + commit fix separado com link

---

## Phase 7: Coverage Baseline + Polish

**Purpose**: gerar baseline + finalizar release.

- [x] T032 Rodar `npm run test:coverage` — gerar `coverage/coverage-summary.json`
- [x] T033 Criar [specs/034-retroactive-test-coverage/coverage-baseline.md](./coverage-baseline.md) com tabela de % linha/branch/funções por arquivo crítico (preencher números reais do JSON), comparar com alvos em data-model.md, comentar áreas não-cobertas justificadas (ex: src/app/** UI fora de escopo)
- [x] T034 Atualizar [BACKLOG.md](../../BACKLOG.md): mover Inc 37 da seção "🟢 Próximos" pra "Releases (entregues, em prod)" com sumário detalhado (Tier 3+1+2 + coverage baseline + ~50-60 testes); atualizar header `**Última atualização**` pra 2026-05-05
- [x] T035 Atualizar [CLAUDE.md](../../CLAUDE.md) SPECKIT marker descrevendo Inc 37 como deployado (key points: 3 tiers entregues, baseline coverage estabelecido, Inc 38 candidato pra threshold gate); marcar 034-retroactive-test-coverage como "Prior active (now legacy)"
- [x] T036 Build final `npm run build` (TypeScript strict OK)
- [x] T036.5 Revisar comment headers em todos os arquivos de teste novos (T011-T013, T016-T021, T024-T027) — confirmar formato fixo de FR-006 (mocks ativados + Princípio coberto). Padronizar onde necessário
- [x] T037 Commit branch + push + merge `--no-ff` em main + push main (mesmo pattern releases anteriores)
- [x] T038 NÃO requer deploy Vercel (feature é local-only, sem mudança em src/). Confirmar via `git diff main -- src/` vazio

---

## Dependencies

```
T001-T003 (Setup baseline)
  ↓
T004-T008 (Coverage tooling)
  ↓
T009-T010 (Foundational seed helper)
  ↓
US1 (P1 — MVP):
  T011, T012, T013 [P]  (3 unit tests independentes)
    ↓
  T014 → T015           (validação local + suite verde)

US2 (P1):
  Depends on T009 (seed helper)
  T016 (sequencial — toca arquivo existente)
    ↓
  T017, T018, T019, T020, T021 [P]  (5 arquivos integration novos)
    ↓
  T022 → T023           (validação + smoke regressão)

US3 (P2):
  Depends on T009 (seed helper)
  T024, T025, T026, T027 [P]  (4 arquivos integration novos)
    ↓
  T028                  (validação)

US4 (cross-cutting):
  Depends on US1+US2+US3 done
  T029 → T030 → T031    (suíte verde + constitution + diff vazio)

Polish:
  Depends on US4 done
  T032 → T033 → T034 → T035 → T036 → T037 → T038
```

---

## Parallel Execution Examples

**Phase 3 (US1)**: T011, T012, T013 são 3 arquivos independentes — paralelizáveis. Após eles, T014/T015 sequenciais.

**Phase 4 (US2)**: T017-T021 são 5 arquivos novos sem dependência mútua — paralelizáveis. T016 é sequencial (toca arquivo existente).

**Phase 5 (US3)**: T024-T027 são 4 arquivos independentes — paralelizáveis.

**Phase 7 Polish**: T034 (BACKLOG) e T035 (CLAUDE.md) podem rodar em paralelo (arquivos distintos).

---

## Implementation Strategy (MVP-first)

**MVP = US1 sozinha** (Tier 3, 3 unit tests). Entrega valor independente: helpers puros mais usados em otimizações shippadas ganham rede de segurança imediata. Custo ~1h. Valida pattern Princípio VI antes de Tier 1/2.

**Recomendação prática**: implementar US1 + US2 (até T023) como bloco "core proteção" + smoke regressão simulada → validar suite verde → seguir pra US3 + Polish em segundo bloco. Se sessão estourar tempo, US3 pode shipar como Inc 37b sub-feature (research.md Decision 2 alternative).

**Coverage baseline (Phase 7)** roda **após** todos os tiers completos pra refletir cobertura final, não inicial.

---

## Validação format

Total: **38 tasks** organizadas em **7 phases**.

| Phase | Tasks | Story | Foco |
|---|---|---|---|
| 1 — Setup | T001-T008 | (shared) | Baseline + coverage tooling |
| 2 — Foundational | T009-T010 | (shared) | Seed helper compartilhado |
| 3 — US1 (MVP) 🟢 | T011-T015 | US1 (P1) | Tier 3 helpers puros (3 unit tests) |
| 4 — US2 | T016-T023 | US2 (P1) | Tier 1 AUTHOR proteção (6 integration) |
| 5 — US3 | T024-T028 | US3 (P2) | Tier 2 equivalence (4 integration) |
| 6 — US4 | T029-T031 | US4 (cross) | Suíte verde + Princípio II preservado |
| 7 — Polish | T032-T038 | (cross) | Coverage baseline + commit/merge |

**Format check**: ✅ todos os 38 tasks seguem `- [ ] TID [P?] [Story?] Description with file path`.

**Independent test criteria** (cada US):
- US1: ≥30 cases unit passing isolados
- US2: ≥30 cases integration AUTHOR proteção + smoke regressão simulada falha
- US3: ≥30 cases integration equivalence
- US4: `npm run test` exit code 0 com ≥194 passing
