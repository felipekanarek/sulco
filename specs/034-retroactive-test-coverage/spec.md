# Feature Specification: Cobertura de testes retroativa (Inc 23-32)

**Feature Branch**: `034-retroactive-test-coverage`
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: "Inc 37 — Cobertura de testes retroativa (Inc 23-32) — 3 tiers prioritizados"

## Clarifications

### Session 2026-05-05

- Q: Instalar `@vitest/coverage-v8` durante Inc 37 + gerar baseline? → A: Sim, instalar e gerar baseline numérico de % linha/branch coverage por arquivo durante esta feature.
- Q: Mock pattern pra autenticação nos testes Tier 1 (Server Actions)? → A: `vi.doMock('@/lib/auth', ...)` retornando user fixture — pattern do `sync-preserves-author-fields.test.ts`. Zero refator em produção (preserva FR-007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Tier 3: helpers puros têm cobertura unitária (Priority: P1)

Os 3 helpers puros mais usados em otimizações shippadas (`normalizeText`,
`computeRecordSearchText`, `diffVocabArrays`) recebem testes unitários
cobrindo padrão feliz + casos edge mapeados em specs anteriores.
Refator futuro nesses helpers (ex: trocar algoritmo de normalização)
tem rede de segurança imediata.

**Why this priority**: helpers puros são baratos pra testar (sem
mocks, sem DB), validam o pattern Princípio VI antes de Tier 1/2 mais
caros, e cobrem regressões em paths que já mostraram fragilidade
(Inc 18 acentuação tem cobertura zero, Inc 32 search_text idem).

**Independent Test**: rodar `npm run test tests/unit/normalize-text.test.ts
tests/unit/compute-record-search-text.test.ts tests/unit/diff-vocab-arrays.test.ts`
— ≥30 cases passam, suíte total não regride.

**Acceptance Scenarios**:

1. **Given** input "São Paulo", **When** chamar `normalizeText`, **Then**
   retorna "sao paulo" (lowercase + diacríticos removidos).
2. **Given** records.artist="Sérgio", title="Açúcar", label=null,
   **When** chamar `computeRecordSearchText`, **Then** retorna
   "sergio acucar " sem trailing whitespace inesperado.
3. **Given** old=["Funk","Jazz"], new=["Funk","Soul"], **When** chamar
   `diffVocabArrays`, **Then** retorna `{added:["Soul"], removed:["Jazz"]}`
   sem duplicação.

---

### User Story 2 — Tier 1: AUTHOR fields protegidos por testes integration (Priority: P1)

Cada Server Action de write em campo AUTHOR (status, shelfLocation,
notes, BPM/key/energy/moods/contexts/comment/aiAnalysis) tem teste
integration cobrindo: caminho feliz, ownership/auth, validação Zod,
preservação de campos não-tocados (Princípio I), e archive não toca
pivot (Princípio IV).

**Why this priority**: Princípio I é o coração do Sulco — perda de
curadoria por bug é falha existencial. Hoje só `sync-preserves-author-fields`
cobre apply-update. As 6 Server Actions críticas + archiveRecord +
deleteSet ficam descobertas.

**Independent Test**: rodar `npm run test tests/integration/{archive-record-author-preserved,delete-set-preserves-tracks,update-record-status,update-record-author-fields,update-track-curation,sync-preserves-author-fields}.test.ts`
— ≥18 cases passam.

**Acceptance Scenarios**:

1. **Given** record com status='active', shelfLocation='E3-P2',
   notes='nota X', **When** `archiveRecord(userId, recordId)`,
   **Then** archived=true e os 3 campos AUTHOR ficam intactos.
2. **Given** set com 3 tracks, **When** `deleteSet(setId)`, **Then**
   `set_tracks` rows são deletadas mas `tracks` e `records` ficam
   intactos com curadoria preservada.
3. **Given** user A tenta `updateRecordStatus(recordIdOfUserB, ...)`,
   **When** Server Action invocada, **Then** retorna erro de ownership
   e nada é persistido.
4. **Given** sync Discogs traz format mudado (Inc 35 record_genres /
   record_styles populados), **When** `applyDiscogsUpdate` UPDATE
   path executa, **Then** pivots refletem diff correto sem perder
   AUTHOR de tracks.

---

### User Story 3 — Tier 2: otimizações têm equivalence assertions (Priority: P2)

Cada otimização shippada (`buildCollectionFilters`, `applyVocabDelta`,
`applyPivotDelta`, `cacheUser`/`revalidateUserCache`) tem teste
integration assertando que o **resultado** é idêntico ao
comportamento esperado (Princípio VI bullet 4). Otimização futura
(ex: trocar SQL strategy) tem rede de segurança garantindo que
comportamento observável não muda.

**Why this priority**: alto volume de mudanças nos 9 incs de
otimização (23-30, 32-36) sem testes — qualquer refator quebra silenciosamente.
Equivalence assertions são o único mecanismo de defesa real.

**Independent Test**: rodar `npm run test tests/integration/{buildCollectionFilters,applyVocabDelta,applyPivotDelta,cache-user}.test.ts`
— ≥30 cases passam, cobrem cada filtro/operação distinta.

**Acceptance Scenarios**:

1. **Given** 5 records seedados com formats distintos, **When**
   `queryCollection({formats:['LP']})`, **Then** retorna apenas LPs.
2. **Given** vocab inicial vazio, **When** chamar
   `applyVocabDelta(userId, 'genres', ['Funk'], [])`, **Then**
   `user_vocab` ganha 1 entry com ref_count=1; chamar de novo
   incrementa para 2.
3. **Given** user A com cache populado, **When**
   `revalidateUserCache(userIdA)`, **Then** apenas tag `user:A` é
   invalidada (user B não afetado).

---

### User Story 4 — Suíte completa permanece verde (Priority: P1)

Todos os ~30-40 testes novos coexistem com os 164 existentes em
suíte total verde. Nenhuma regressão. CI gate `npm run test` aprova.

**Why this priority**: Princípio VI bullet 7 explícito ("Suite de
testes MUST passar verde antes de merge na main"). Inc 37 não pode
shipar com falhas, mesmo que sejam pré-existentes.

**Independent Test**: `npm run test` em estado final retorna exit
code 0 com 0 fails.

**Acceptance Scenarios**:

1. **Given** branch `034-retroactive-test-coverage` com tier 1+2+3
   completo, **When** `npm run test`, **Then** ≥194 passing, 0
   failing, ≥37 todo (preservado).
2. **Given** `npm run test:constitution`, **When** executado, **Then**
   passa verde e cobre Inc 35 pivots.

### Edge Cases

- **Mocks de dependências externas (Clerk auth, libsql)**: testes
  integration usam test-db in-memory + `vi.doMock('@/db', ...)` +
  `vi.doMock('@/lib/auth', ...)` retornando user fixture (pattern
  estabelecido em sync-preserves-author-fields, Clarification Q2).
  Cenários de ownership-fail mockam `requireCurrentUser` retornando
  user diferente do owner do record/set.
- **`revalidateUserCache` em testes**: não há Next.js runtime;
  mock como no-op + verificar que função foi chamada via spy.
- **Coverage tooling opcional**: instalar `@vitest/coverage-v8` se
  Felipe aprovar Q3 — caso contrário, métrica de baseline fica
  registrada como "TODO Inc 38".
- **Testes que expõem bug genuíno**: caso raro mas possível. Quando
  acontece, criar issue dedicada em vez de ajustar teste pra passar.
- **test-db.ts evolução**: helpers existentes (`createTestDb`) já
  refletem schema atual pós-Inc 36. Tier 1+2 não devem precisar
  estender (pivots Inc 35 + record_formats já lá; user_vocab + user_facets
  já lá). Se um teste Tier 1/2 expor coluna faltando, atualizar
  test-db.ts faz parte do scope.
- **Tempo total**: estimativa ~6-8h pode ser excedida se edge cases
  surgirem. Tier 3 sozinho é ~1-2h e shipa valor independente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST adicionar 3 arquivos `tests/unit/*.test.ts`
  cobrindo `normalizeText`, `computeRecordSearchText`, `diffVocabArrays`
  com ≥10 cases cada (padrão + edge + bidirecional onde aplicável).
- **FR-002**: Sistema MUST adicionar 5 arquivos
  `tests/integration/*.test.ts` cobrindo: archive-record AUTHOR
  preserved, delete-set preserves tracks, updateRecordStatus,
  updateRecordAuthorFields, updateTrackCuration. Cada arquivo MUST
  cobrir caminho feliz + ownership rejeitando user errado +
  validação Zod + preservação Princípio I.
- **FR-003**: Sistema MUST estender
  `tests/integration/sync-preserves-author-fields.test.ts` cobrindo
  pivots Inc 35 (record_genres, record_styles, track_moods,
  track_contexts) populados consistentemente em INSERT/UPDATE/REAPARIÇÃO.
- **FR-004**: Sistema MUST adicionar 4 arquivos integration de
  equivalence: `buildCollectionFilters` (1 it() por filtro),
  `applyVocabDelta`, `applyPivotDelta`, `cache-user`. Cada um cobre
  caminho feliz + idempotência + edge cases.
- **FR-005**: Sistema MUST manter `npm run test` verde após cada
  tier. Nenhum teste novo pode ser shipado em estado FAIL.
- **FR-006**: Sistema MUST usar pattern uniforme de mocks
  (Clarification Q2): `vi.doMock('@/db', ...)` + `vi.doMock('@/lib/auth', ...)` +
  no-op pra `revalidateUserCache`/`unstable_cache`. Cada arquivo
  de teste novo MUST iniciar com comment header em formato fixo:
  ```
  /**
   * Inc 37 (034) Tier N — <descrição>
   *
   * Mocks ativados:
   * - @/db → test-db in-memory via vi.doMock
   * - @/lib/auth → fixture user via vi.doMock (Q2 clarification)
   * - @/lib/cache → revalidateUserCache spy (no-op + asserts)
   *
   * Princípio coberto: I (AUTHOR proteção) | IV (preservação) | VI (cobertura)
   */
  ```
  Padronização cross-suite verificada em task de revisão final no
  Polish phase.
- **FR-007**: Sistema NUNCA MUST modificar código de produção
  (src/lib/, src/app/, src/components/) exceto se um teste expor
  bug genuíno; nesse caso, fix + regression test no mesmo commit
  com link pra issue.
- **FR-008**: Sistema MUST atualizar `tests/helpers/test-db.ts` se
  algum teste novo precisar de coluna/tabela ainda não refletida
  no schema. Mudança de test-db.ts requer rodar suíte completa
  pra confirmar zero regressão.
- **FR-009**: Sistema MUST instalar `@vitest/coverage-v8` (devDep)
  durante Inc 37, configurar script `npm run test:coverage`, e gerar
  baseline numérico de % linha/branch coverage por arquivo crítico
  (todos os arquivos listados na auditoria). Baseline registrado em
  artefato dedicado da feature pra próximas features compararem.

### Key Entities *(include if feature involves data)*

Não aplicável — feature toca apenas testes, sem novas entidades.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ≥30 testes novos passando em
  `tests/{unit,integration}/`. Mínimo: 10 unit + 18 integration =
  28; meta: 35.
- **SC-002**: Suíte total `npm run test` permanece verde — sem
  regressão dos 164 testes existentes.
- **SC-003**: 100% das Server Actions críticas que escrevem em
  campos AUTHOR (`updateRecordStatus`, `updateRecordAuthorFields`,
  `updateTrackCuration`, `archiveRecord`, `deleteSet`,
  `applyDiscogsUpdate`) têm pelo menos 1 teste integration cobrindo
  ownership rejeitando user errado.
- **SC-004**: 100% dos helpers puros listados em FR-001 têm pelo
  menos 1 teste unit cobrindo bidirecional/edge case relevante.
- **SC-005**: 100% dos filtros do `buildCollectionFilters` (status,
  text, genres, styles, formats, year, country, label, shelf,
  bomba) têm pelo menos 1 it() de equivalence assertando subset
  esperado.
- **SC-006**: Regressão simulada manual (comentar uma proteção
  AUTHOR em apply-update.ts) faz ao menos 1 teste do Tier 1
  falhar — proof of effectiveness.
- **SC-007**: Zero modificações em código de produção exceto
  refator triviais já cobertos por FR-007.

## Assumptions

1. **`@vitest/coverage-v8` instalado durante Inc 37** (Clarification
   2026-05-05 Q1=A): scope inclui instalar dep + config + baseline.
   Threshold gate (% mínimo CI) fica como Inc 38 candidato — esta
   feature foca em **estabelecer** baseline, não em **enforce-lo**.
2. **Subdivisão em 37a/37b/37c é decisão de delivery, não de spec**:
   spec define o escopo total; delivery pode ser monolítico ou
   incremental conforme Q2 do prompt.
3. **Mocks Clerk + libsql seguem pattern existing**:
   `vi.doMock('@/db', ...)` e mockar `requireCurrentUser` são
   padrões estabelecidos. Sem novos patterns.
4. **`tests/helpers/test-db.ts` está atualizado pós-Inc 36**:
   confirmado — schema reflete colunas até Inc 36 inclusive.
5. **Não há orçamento de mudança em produção**: feature é cobertura
   pura. Se um teste expor bug, criar issue + fix em PR separado.

## Dependencies

- Constitution 1.3.0 (Princípio VI) — referência normativa.
- `tests/helpers/test-db.ts` (Inc 36) — fixture de DB de teste.
- `tests/shims/server-only.ts` — desabilita server-only em testes.
- `vitest.config.ts` — config Vitest happy-dom + alias `@/`.
- Pattern `vi.doMock('@/db', ...)` em
  `tests/integration/sync-preserves-author-fields.test.ts`.
