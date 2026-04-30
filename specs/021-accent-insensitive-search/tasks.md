# Tasks: Busca insensitive a acentos

**Input**: Design documents from `specs/021-accent-insensitive-search/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: Não solicitados na spec — validação via quickstart manual.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: mapeia task para user story (US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar shape dos callsites antes de tocar código.

- [X] T001 Verify baseline: read [src/lib/queries/collection.ts:55-100](../../src/lib/queries/collection.ts) — confirmar shape de `buildCollectionFilters` (param object + retorno `SQL[]`) onde `omitText` será adicionado
- [X] T002 [P] Verify baseline: read [src/lib/queries/collection.ts:102-...](../../src/lib/queries/collection.ts) — `queryCollection`: ordering `desc(records.importedAt)`, mapping pós-query (trackAggMap, bombSet) que precisa rodar APÓS o text filter JS
- [X] T003 [P] Verify baseline: read [src/lib/queries/montar.ts:57-176](../../src/lib/queries/montar.ts) — `queryCandidates`: ordering por rating/artist/position (ou rankByCuration), `.limit()` SQL atual que vai mover pra JS
- [X] T004 [P] Verify baseline: read [src/lib/actions.ts:853-887](../../src/lib/actions.ts) — `pickRandomUnratedRecord` Inc 11: usa `ORDER BY RANDOM() LIMIT 1` no SQL, vai re-estruturar pra JS

**Checkpoint**: callsites mapeados; pronto pra implementar helper.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: criar o helper de normalização que todas as user
stories vão consumir. Bloqueia US1 e US2.

- [X] T005 Create [src/lib/text.ts](../../src/lib/text.ts) — novo módulo puro com 2 funções exportadas conforme [contracts/text-helper.md](./contracts/text-helper.md): (a) `normalizeText(s: string | null | undefined): string` — `lowercase + NFD + replace(/\p{M}/gu, '')`, retorna '' pra null/undefined; (b) `matchesNormalizedText(haystacks: ReadonlyArray<string | null | undefined>, query: string): boolean` — normaliza query; trim; retorna true se vazia; senão verifica se algum haystack normalizado contém o needle (`includes`). Pure function sem side-effects.

**Checkpoint**: helper pronto. US1 e US2 podem consumir.

---

## Phase 3: User Story 1 — Buscar artista com acento na home (Priority: P1) 🎯 MVP

**Goal**: digitar `joao` em `/` acha `João Gilberto`; `acucar`
acha `Açúcar`; `sergio` acha `Sérgio`. Bidirecional, case-insensitive.

**Independent Test**: cenário 1 do
[quickstart.md](./quickstart.md) — variantes de digitação (sem
acento, com acento, caps) acham mesmo conjunto de resultados.

### Implementation for User Story 1

- [X] T006 [US1] Add `omitText?: boolean` ao param object de `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) (linhas 55-100). Default false. Quando `omitText === true`, pular o bloco SQL de text filter. Outros callers (`pickRandomUnratedRecord` original) continuam funcionando sem mudança.
- [X] T007 [US1] Adapt `queryCollection` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts): chamar `buildCollectionFilters({ ...q, omitText: true })`; após `await db.select(...)` e antes de `if (rows.length === 0) return []`, aplicar filtro JS via `matchesNormalizedText([r.artist, r.title, r.label], q.text)` quando `q.text.trim().length > 0`. Usar `textFiltered` no resto da função (recordIds, agregação, mapping). Importar `matchesNormalizedText` de `@/lib/text`.
- [X] T008 [US1] Adapt `pickRandomUnratedRecord` em [src/lib/actions.ts:853-887](../../src/lib/actions.ts) conforme [contracts/text-helper.md](./contracts/text-helper.md): substituir `ORDER BY RANDOM() LIMIT 1` por SELECT amplo (`id`, `artist`, `title`, `label`) sem text filter SQL (chamar `buildCollectionFilters` com `omitText: true`), aplicar `matchesNormalizedText` em JS quando há `text` no `parsed.data`, e escolher random via `Math.random()` sobre o array filtrado. Manter retorno `{ recordId } | { recordId: null }`. Importar `matchesNormalizedText`.

**Checkpoint**: US1 funcional. Quickstart cenários 1, 3, 4
validam (busca em /, bidirecional, random respeita).

---

## Phase 4: User Story 2 — Buscar faixa com acento em /sets/[id]/montar (Priority: P1)

**Goal**: digitar `aguas` em `/sets/[id]/montar` acha `Águas de
Março`; `antonio` acha `Antônio Carlos Jobim`; `musica popular`
acha `música popular brasileira`.

**Independent Test**: cenário 2 do
[quickstart.md](./quickstart.md) — busca normalize-aware em
candidatos.

### Implementation for User Story 2

- [X] T009 [US2] Adapt `queryCandidates` em [src/lib/queries/montar.ts:57-176](../../src/lib/queries/montar.ts): (a) remover bloco SQL de text filter (linhas ~107-111: `if (filters.text && filters.text.trim().length > 0) { ... conds.push(sql`...`) ... }`); (b) remover `.limit(opts.limit ?? 300)` do query builder do Drizzle; (c) após `await db.select(...).orderBy(...orderBy)` (sem limit), aplicar filtro JS via `matchesNormalizedText([r.title, r.artist, r.recordTitle, r.fineGenre], filters.text)` quando `filters.text.trim().length > 0`; (d) aplicar `slice(0, opts.limit ?? 300)` em JS após o text filter. Importar `matchesNormalizedText` de `@/lib/text`.

**Checkpoint**: US2 funcional. Cenário 2 valida.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: type-check + quickstart completo + entry de release
no BACKLOG.

- [X] T010 Run TypeScript + lint: `npm run build`. Confirmar zero erros relacionados a `normalizeText`/`matchesNormalizedText` ou imports atualizados em `collection.ts`/`montar.ts`/`actions.ts`.
- [ ] T011 [P] Execute quickstart cenário 1 (US1 desktop): variantes de termo (sem acento, com acento, caps) acham mesmo conjunto.
- [ ] T012 [P] Execute quickstart cenário 2 (US2 desktop): `aguas`, `antonio`, `musica popular` acham faixas correspondentes.
- [ ] T013 [P] Execute quickstart cenário 3 (FR-003 bidirecional): digitar `João` (com acento) acha mesmo conjunto que `joao` (sem).
- [ ] T014 [P] Execute quickstart cenário 4 (Inc 11 + Inc 18 cross — random respeita busca normalize-aware).
- [ ] T015 [P] Execute quickstart cenário 5 (mobile / Princípio V — SC-003): viewport 375×667, teclado virtual sem acento; busca funciona.
- [ ] T016 [P] Execute quickstart cenário 6 (pontuação preservada): `Stones,` acha exato.
- [ ] T017 [P] Execute quickstart cenário 7 (FR-007 termo só whitespace): filtro não aplicado, sem regressão.
- [ ] T018 [P] Execute quickstart cenário 8 (FR-008 multi-user isolation): DJ A não vê discos de DJ B mesmo com termo coincidindo.
- [ ] T019 [P] Execute quickstart cenário 9 (SC-002 performance): tempo de resposta ≤500ms em ambas rotas com escala de prod (~2500 records / ~10k tracks).
- [ ] T020 [P] Execute quickstart cenário 10 (FR-006 / Decisão 8): filtros multi-select de tag continuam exact match; combinados com text normalize-aware funcionam (AND).
- [X] T021 Add release entry to [BACKLOG.md](../../BACKLOG.md): mover Inc 18 de "🟢 Próximos" para "Releases" como `021-accent-insensitive-search`; atualizar header "Última atualização".

**Checkpoint**: feature pronta para commit/merge/deploy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 sequencial; T002–T004 paralelos (read-only, arquivos distintos).
- **Foundational (Phase 2)**: T005 sequencial — bloqueia tudo.
- **US1 (Phase 3)**: T006 sequencial primeiro (param novo); T007 e T008 paralelos depois (arquivos distintos, ambos consomem T006 e T005).
- **US2 (Phase 4)**: T009 sequencial; pode rodar em paralelo com T007/T008 de US1 porque mexe em arquivo distinto.
- **Polish (Phase 5)**: T010 sequencial após implementação completa; T011–T020 paralelos (cenários manuais distintos); T021 final.

### User Story Dependencies

- **US1 (P1)**: depende de T005 (helper) + T006 (flag). Entrega busca accent-insensitive em `/`.
- **US2 (P1)**: depende de T005 (helper). Entrega busca accent-insensitive em `/sets/[id]/montar`. Independente de US1 (arquivos distintos).

### Within Each User Story

- US1: T006 (flag) → T007/T008 paralelos.
- US2: T009 isolado.

### Parallel Opportunities

- T002, T003, T004 paralelos no Setup.
- T007, T008, T009 paralelos depois de T005+T006 (arquivos distintos).
- T011–T020 paralelos no Polish (cenários manuais não-conflitantes).

---

## Parallel Example: Setup phase

```bash
# Read all baseline files in parallel:
Task: "Read src/lib/queries/collection.ts:55-100 (buildCollectionFilters)"
Task: "Read src/lib/queries/collection.ts:102-... (queryCollection ordering+aggregation)"
Task: "Read src/lib/queries/montar.ts:57-176 (queryCandidates)"
Task: "Read src/lib/actions.ts:853-887 (pickRandomUnratedRecord)"
```

## Parallel Example: User Stories implementation

```bash
# Once T005 + T006 done, US1 e US2 podem rodar em paralelo:
Task: "Adapt queryCollection in src/lib/queries/collection.ts (US1)"
Task: "Adapt pickRandomUnratedRecord in src/lib/actions.ts (US1)"
Task: "Adapt queryCandidates in src/lib/queries/montar.ts (US2)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1+2 (Setup + Foundational): T001 → T002–T004 paralelos → T005.
2. Phase 3 (US1): T006 → T007/T008 paralelos.
3. **STOP**: validar cenário 1.
4. Já entrega valor real — busca em `/` funciona accent-insensitive.

### Incremental Delivery

1. MVP (US1) → testar cenário 1 → commit.
2. US2 (T009) → testar cenário 2 → commit.
3. Polish (T010–T021) → quickstart completo → commit final → deploy.

### Solo Strategy (single dev — Felipe)

Sequência linear esperada:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 →
T010 → T011…T020 → T021.

(Como T007/T008/T009 estão em arquivos distintos, dá pra fazer
todos os 3 em sequência rápida sem merge conflicts.)

---

## Notes

- Tests **não solicitados**. Validação via quickstart manual.
- Princípio I respeitado: feature é puramente leitura. Nenhum
  write em campo AUTHOR ou em qualquer lugar.
- Princípio II respeitado: queries continuam RSC; helper é puro.
- Princípio III respeitado: zero schema delta.
- Princípio V (Mobile-Native): ganho maior em mobile; cenário 5
  do quickstart valida.
- Sem novas Server Actions; sem `data-model.md`.
- `pickRandomUnratedRecord` (Inc 11) re-estruturada — comportamento
  observável idêntico (random uniforme sobre filtrados), mas SQL
  diferente.
- Limit do `queryCandidates` move SQL → JS (Decisão 6 do research)
  pra preservar candidatos válidos.
- Filtros multi-select de tag (genres, styles, moods, contexts)
  permanecem exact match (Decisão 8).
- Commit recomendado: 1 commit no fim da Phase 4 (US1 + US2 ambas
  funcionando) e 1 commit no fim do Polish.
