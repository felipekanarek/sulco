# Tasks: Filter UX rework + 5 novos filtros (Inc 8)

**Input**: Design documents from `specs/032-filter-rework-and-new-fields/`
**Prerequisites**: plan.md ✓, spec.md ✓ (6 clarifications resolvidas), research.md ✓, data-model.md ✓, quickstart.md ✓
**Tests**: validação manual via quickstart.

**Modo de implementação**: cuidadoso. UX rework amplo (`/` é load mais frequente) + materialização via `user_vocab` (Inc 33 estendido). **Ordem crítica**: schema delta + backfill ANTES do code deploy.

## Phase 1: Setup

- [ ] T001 Confirmar status — feature dir `specs/032-filter-rework-and-new-fields/` + spec + plan + research + data-model + quickstart já criados nesta sessão. Branch `032-filter-rework-and-new-fields` ativa.

## Phase 2: Foundational (schema + helper core antes das US)

### Schema delta

- [ ] T002 Atualizar [src/db/schema.ts](../../src/db/schema.ts) — `userVocab.kind` enum:
  - Estender de `['genres', 'styles', 'moods', 'contexts', 'shelves']` para `['genres', 'styles', 'moods', 'contexts', 'shelves', 'formats', 'countries', 'labels']` (8 valores).
  - Comentário explicativo: "Inc 33 (5 kinds) + Inc 8 (3 kinds novos: formats/countries/labels)".

- [ ] T003 Aplicar migration SQL em sqlite local (dev) — recriar `user_vocab` SEM CHECK constraint (Q4=C):
  ```bash
  sqlite3 sulco.db <<'SQL'
  CREATE TABLE user_vocab_new (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    term TEXT NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, kind, term)
  );
  INSERT INTO user_vocab_new SELECT * FROM user_vocab;
  DROP INDEX user_vocab_user_kind_idx;
  DROP TABLE user_vocab;
  ALTER TABLE user_vocab_new RENAME TO user_vocab;
  CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
  SQL
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT COUNT(*) FROM user_vocab;"  # esperado: ~6228 entries Inc 33 preservadas
  sqlite3 sulco.db "PRAGMA table_info(user_vocab);"  # confirmar sem CHECK
  ```

### Helper core: estender VocabKind + tipo

- [ ] T004 Atualizar [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts):
  - Estender type `VocabKind`: `'genres' | 'styles' | 'moods' | 'contexts' | 'shelves' | 'formats' | 'countries' | 'labels'`.
  - `listVocab` e `applyVocabDelta` já são parametrizados por kind — funcionam automaticamente com kinds novos.
  - Build local pra confirmar tipo.

### `_repopulateVocab` estendido (Q6)

- [ ] T005 Estender `_repopulateVocab` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - Criar helper privado novo `_aggregateRecordColumnCounts(userId, column)`:
    ```ts
    async function _aggregateRecordColumnCounts(
      userId: number,
      column: typeof records.format | typeof records.country | typeof records.label,
    ): Promise<Map<string, number>> {
      const rows = await db
        .select({ value: column, count: sql<number>`COUNT(*)` })
        .from(records)
        .where(and(
          eq(records.userId, userId),
          eq(records.archived, false),
          isNotNull(column),
          ne(column, ''),
        ))
        .groupBy(column);
      const map = new Map<string, number>();
      for (const r of rows) {
        const term = r.value?.trim();
        if (term && term.length > 0) map.set(term, Number(r.count));
      }
      return map;
    }
    ```
    Importar `ne` de `drizzle-orm`.
  - Dentro de `_repopulateVocab`, após o bloco existing dos 5 kinds, adicionar:
    ```ts
    const [formatCounts, countryCounts, labelCounts] = await Promise.all([
      _aggregateRecordColumnCounts(userId, records.format),
      _aggregateRecordColumnCounts(userId, records.country),
      _aggregateRecordColumnCounts(userId, records.label),
    ]);

    for (const [term, count] of formatCounts) {
      if (count <= 0) continue;
      inserts.push(db.insert(userVocab).values({
        userId, kind: 'formats', term, refCount: count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }));
    }
    for (const [term, count] of countryCounts) {
      if (count <= 0) continue;
      inserts.push(db.insert(userVocab).values({
        userId, kind: 'countries', term, refCount: count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }));
    }
    for (const [term, count] of labelCounts) {
      if (count <= 0) continue;
      inserts.push(db.insert(userVocab).values({
        userId, kind: 'labels', term, refCount: count,
        updatedAt: sql`(unixepoch())` as unknown as Date,
      }));
    }
    ```

### Backfill local

- [ ] T006 Backfill local — re-rodar `recomputeFacets` pra cada user via script ad-hoc OU via:
  ```bash
  sqlite3 sulco.db "SELECT id FROM users;" | while read uid; do
    # Disparar recomputeFacets via Server Action ou script Node
    # Alternativa: rodar `node scripts/_backfill-user-vocab.mjs` se Inc 33 tiver script standalone
    echo "user $uid"
  done
  ```
  Mais simples: usar o script existente `scripts/_backfill-user-vocab.mjs` se disponível (Inc 33). Se não, criar script novo `scripts/_backfill-user-vocab-extended.mjs` que faz a agregação inline pros 8 kinds.
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT kind, COUNT(*) FROM user_vocab GROUP BY kind ORDER BY kind;"
  # esperado: 8 rows (genres, styles, moods, contexts, shelves, formats, countries, labels)
  ```

### Helpers wrapper em collection.ts

- [ ] T007 Adicionar wrappers em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):
  - `listUserFormats(userId)`: wrapper sobre `listVocab(userId, 'formats')` retornando `string[]` (just terms).
  - `listUserCountries(userId)`: idem para `'countries'`.
  - `listUserLabels(userId)`: idem para `'labels'`.
  - `getYearRange(userId)`: helper cached via `react.cache` retornando `{ min: number | null; max: number | null }` via SELECT MIN(year)/MAX(year). Importar `cache` de `react`.
  - Exportar todos.

### `<FilterPicker>` genérico (componente core)

- [ ] T008 Criar [src/components/filter-picker.tsx](../../src/components/filter-picker.tsx) (NOVO):
  - `'use client'`.
  - Props: `{ kind: string; label: string; available: string[]; selected: string[]; onToggle: (value: string) => void; onClose: () => void; open: boolean }`.
  - Detecção de viewport via `matchMedia` (mesmo pattern Inc 21 ShelfPicker / Bug 15) — `isMobile`.
  - Layout:
    - **Mobile** (`isMobile=true`): renderiza dentro de `<MobileDrawer side="bottom">` (primitiva Inc 009). Header com label "Filtrar por <kind>" + botão "Fechar".
    - **Desktop** (`isMobile=false`): popover absoluto fixed positioned, fecha em click fora (overlay invisível) ou ESC.
  - **Busca textual condicional** (Q3=B): se `available.length > 20`, renderiza `<input type="text">` no topo + state local `query`. Filtra `available.filter(v => v.toLowerCase().includes(query.toLowerCase()))`. Se ≤20, sem busca.
  - **Lista de chips clicáveis**: cada item de `available` vira um `<button>` chip-style. Visual ativado quando `selected.includes(value)` (border accent + bg accent-soft); inativo (border-line + text-ink-soft).
  - Tap target ≥44×44 px (Princípio V).
  - ARIA: `role="dialog"`, `aria-label`, `aria-modal="true"`.

## Phase 3: User Story 1 — DJ filtra gênero/estilo via picker (P1)

**Goal**: refator `<FilterBar>` substitui lista expandida com COLLAPSED_COUNT=10 por picker buttons + `<FilterPicker>` overlay.

**Independent test**: cenários 1, 2 do quickstart — picker mostra todos os gêneros, busca textual interna funciona quando >20 entries.

- [ ] T009 [US1] Refatorar `<FilterBar>` em [src/components/filter-bar.tsx](../../src/components/filter-bar.tsx):
  - Em `FilterContent`, substituir lista expandida de genres/styles (com `slice(0, COLLAPSED_COUNT)` + "ver mais") por **2 picker buttons**:
    ```tsx
    <FilterButton label="Gênero" count={genres.length} onClick={() => setGenrePickerOpen(true)} />
    <FilterButton label="Estilo" count={styles.length} onClick={() => setStylePickerOpen(true)} />
    ```
    `<FilterButton>` é um simples botão compacto inline (não componente novo separado — pode ser definido inline se não justificar arquivo).
  - State local: `genrePickerOpen`, `stylePickerOpen` via `useState`.
  - Renderizar `<FilterPicker>` para cada quando aberto:
    ```tsx
    <FilterPicker
      kind="genres"
      label="Gênero"
      available={availableGenres.map(g => g.value)}
      selected={genres}
      onToggle={onToggleGenre}
      onClose={() => setGenrePickerOpen(false)}
      open={genrePickerOpen}
    />
    ```
  - Constante `COLLAPSED_COUNT` removida (não mais usada).
  - Build local.

## Phase 4: User Story 2 — DJ filtra por formato (P1)

**Goal**: filtro Formato funcional via `user_vocab.formats` + picker button + URL param.

**Independent test**: cenário 3 do quickstart — picker de Formato mostra ~5 chips (LP/7"/etc.), filtro funciona.

- [ ] T010 [US2] Adicionar `formats` à `CollectionQuery` + `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):
  - Tipo: adicionar `formats: string[]` a `CollectionQuery`.
  - Em `buildCollectionFilters`:
    ```ts
    if (q.formats.length > 0) {
      conds.push(sql`${records.format} IN ${q.formats}`);
    }
    ```

- [ ] T011 [US2] Adicionar URL param `format` em [src/app/page.tsx](../../src/app/page.tsx):
  - Ler via `searchParams.format` (multi-value array).
  - Passar pra `queryCollection({ ..., formats })`.
  - Passar pra `<FilterBar formats={formats} availableFormats={await listUserFormats(user.id)} />`.

- [ ] T012 [US2] Adicionar picker button "Formato" + `<FilterPicker>` em [src/components/filter-bar.tsx](../../src/components/filter-bar.tsx):
  - Props novas: `formats: string[]`, `availableFormats: string[]`.
  - State + button + picker, mesmo padrão de T009.
  - URL param toggle: `setMulti('format', list)`.
  - Adicionar à `activeChips` lista para chips ativos.

## Phase 5: User Story 3 — DJ filtra prateleira (P1)

**Goal**: filtro Prateleira funcional via `user_vocab.shelves` (já existe Inc 33) + picker button + URL param.

**Independent test**: cenário (criar disco com shelfLocation, aplicar filtro, verificar) — análogo a US2.

- [ ] T013 [US3] Adicionar `shelves` à `CollectionQuery` + `buildCollectionFilters` em collection.ts:
  - Tipo: `shelves: string[]`.
  - Em `buildCollectionFilters`:
    ```ts
    if (q.shelves.length > 0) {
      conds.push(sql`${records.shelfLocation} IN ${q.shelves}`);
    }
    ```

- [ ] T014 [US3] Adicionar URL param `shelf` em page.tsx + props `shelves`/`availableShelves` em FilterBar (mesmo padrão T011-T012). Reusar `listUserShelves(user.id)` (Inc 33 existing).

## Phase 6: User Story 4 — DJ filtra ano via décadas (P2)

**Goal**: filtro Ano via multi-select de décadas (Q1=B) + helper `getYearRange` + URL param `decade`.

**Independent test**: cenário 4 do quickstart — picker mostra apenas décadas com ≥1 record; filtro `?decade=1970` mostra records 1970-1979.

- [ ] T015 [US4] Adicionar `decades` à `CollectionQuery` + `buildCollectionFilters`:
  - Tipo: `decades: number[]` (lista de inícios de década, ex: `[1970, 1980]`).
  - Em `buildCollectionFilters`:
    ```ts
    if (q.decades.length > 0) {
      const decadeRanges = q.decades.map(
        (start) => sql`(${records.year} BETWEEN ${start} AND ${start + 9})`,
      );
      conds.push(sql`(${sql.join(decadeRanges, sql` OR `)})`);
    }
    ```

- [ ] T016 [US4] Adicionar URL param `decade` em [src/app/page.tsx](../../src/app/page.tsx):
  - Ler via `searchParams.decade` (multi-value, parsing como `Number()`).
  - Filtrar valores inválidos (NaN, < 1900, > 2100).
  - Carregar `getYearRange(user.id)` no RSC, derivar `availableDecades: number[]` baseado em min/max.
  - Passar pra `<FilterBar decades={decades} availableDecades={availableDecades} />`.

- [ ] T017 [US4] Criar [src/components/decade-filter-picker.tsx](../../src/components/decade-filter-picker.tsx) (NOVO):
  - `'use client'`.
  - Props: `{ availableDecades: number[]; selectedDecades: number[]; onToggle: (decade: number) => void; onClose: () => void; open: boolean }`.
  - Renderiza chips de década com label "70s", "80s", etc. (`String(decade % 100).padStart(2, '0') + 's'`).
  - Sem busca interna (poucos itens, ≤8 décadas).
  - Mesmo padrão visual de `<FilterPicker>` mas estrutura simplificada (sem genericidade).
  - Reusa `<MobileDrawer>` em mobile.

- [ ] T018 [US4] Adicionar picker button "Ano" + `<DecadeFilterPicker>` em filter-bar.tsx (mesmo padrão T012).

## Phase 7: User Story 5 — DJ filtra país (P2)

**Goal**: filtro País via `user_vocab.countries` + picker button + URL param `country`.

**Independent test**: filtro `?country=Brazil` retorna apenas brasileiros.

- [ ] T019 [US5] Adicionar `countries` à `CollectionQuery` + `buildCollectionFilters`:
  ```ts
  if (q.countries.length > 0) {
    conds.push(sql`${records.country} IN ${q.countries}`);
  }
  ```
  + URL param `country` em page.tsx + picker button em filter-bar.tsx (chamando `listUserCountries`).

## Phase 8: User Story 6 — DJ filtra selo (P2)

**Goal**: filtro Selo via `user_vocab.labels` + picker button + URL param `label`. Selo tem >20 entries → busca textual interna ativa (Q3=B).

**Independent test**: cenário 5 do quickstart — picker de Selo tem busca interna, filtragem funciona.

- [ ] T020 [US6] Adicionar `labels` à `CollectionQuery` + `buildCollectionFilters`:
  ```ts
  if (q.labels.length > 0) {
    conds.push(sql`${records.label} IN ${q.labels}`);
  }
  ```
  + URL param `label` em page.tsx + picker button em filter-bar.tsx (chamando `listUserLabels`).

## Phase 9: User Story 7 — Combinação de múltiplos filtros (P3)

**Goal**: validar que filtros compostos (5+) funcionam corretamente.

**Independent test**: cenário 6 do quickstart.

- [ ] T021 [US7] Smoke local em `npm run dev`:
  - Aplicar filtros compostos via URL: `/?genre=Soul&format=LP&country=Brazil&decade=1970&label=Polydor`.
  - Verificar que lista mostra apenas records que satisfazem TODOS.
  - Verificar URL preserva params em refresh.

## Phase 10: Hooks de write para materialização (US sync/archive)

**Goal**: `applyDiscogsUpdate` (sync) + `archiveRecord` mantém `user_vocab.formats/countries/labels` sincronizado.

**Independent test**: sync incremental adiciona record com format novo → entry aparece em `user_vocab` automaticamente.

- [ ] T022 Adicionar hooks em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts):
  - Estender SELECT `existing[0]` pra carregar `oldFormat`, `oldCountry`, `oldLabel`:
    ```ts
    const existing = await db
      .select({
        id: records.id,
        archived: records.archived,
        oldGenres: records.genres,
        oldStyles: records.styles,
        oldFormat: records.format,
        oldCountry: records.country,
        oldLabel: records.label,
      })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.discogsId, release.id)))
      .limit(1);
    ```
  - **INSERT path** (`created=true`):
    ```ts
    const fmt = (release.format ?? '').trim();
    const ctry = (release.country ?? '').trim();
    const lbl = (release.label ?? '').trim();
    if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [fmt], []);
    if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [ctry], []);
    if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [lbl], []);
    ```
  - **UPDATE path** (record existing, sem reaparição): diff per-field:
    ```ts
    const prevFmt = (existing[0].oldFormat ?? '').trim();
    const newFmt = (release.format ?? '').trim();
    if (prevFmt !== newFmt) {
      await applyVocabDelta(
        userId,
        'formats',
        newFmt.length > 0 ? [newFmt] : [],
        prevFmt.length > 0 ? [prevFmt] : [],
      );
    }
    // idem prevCtry/newCtry e prevLbl/newLbl
    ```
  - **Reaparição** (`wasArchived=true→false`):
    ```ts
    if (wasArchived) {
      // Existing Inc 33+35 path: re-incrementa genres/styles/moods/contexts/shelves + pivots.
      // NOVO Inc 8: re-incrementa format/country/label do estado atual.
      const fmt = (release.format ?? '').trim();
      const ctry = (release.country ?? '').trim();
      const lbl = (release.label ?? '').trim();
      if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [fmt], []);
      if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [ctry], []);
      if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [lbl], []);
    }
    ```
  - Try/catch defensivo (mesmo padrão Inc 33+35).

- [ ] T023 Adicionar hooks em [src/lib/discogs/archive.ts](../../src/lib/discogs/archive.ts):
  - Estender SELECT inicial em `archiveRecord` pra carregar format/country/label do `recordRow`.
  - Bulk decrement adicionar 3 chamadas:
    ```ts
    const fmt = (recordRow.format ?? '').trim();
    const ctry = (recordRow.country ?? '').trim();
    const lbl = (recordRow.label ?? '').trim();
    if (fmt.length > 0) await applyVocabDelta(userId, 'formats', [], [fmt]);
    if (ctry.length > 0) await applyVocabDelta(userId, 'countries', [], [ctry]);
    if (lbl.length > 0) await applyVocabDelta(userId, 'labels', [], [lbl]);
    ```

## Phase 11: Polish — build + commit + deploy + smoke

- [ ] T024 Build local final: `npm run build`. Confirmar zero erros TS.

- [ ] T025 Smoke local: `npm run dev`, abrir `/`, validar:
  - Picker buttons visíveis no header.
  - Cada picker abre overlay com chips clicáveis.
  - Pickers Gênero/Estilo/Selo (>20 entries) têm busca interna; Formato/Prateleira/Ano não têm.
  - Filtros compostos funcionam.
  - Mobile (DevTools viewport ≤640px): bottom sheet abre.

- [ ] T026 Commit em branch `032-filter-rework-and-new-fields` com mensagem `feat(032): filter UX rework + 5 novos filtros (Inc 8)`. Push branch.

- [ ] T027 Merge `032-filter-rework-and-new-fields` → `main` com `--no-ff`. **NÃO PUSHE AINDA** se backfill prod ainda não rodou.

- [ ] T028 Aplicar migration prod via `turso db shell sulco-prod`:
  ```sql
  CREATE TABLE user_vocab_new (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    term TEXT NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, kind, term)
  );
  INSERT INTO user_vocab_new SELECT * FROM user_vocab;
  DROP INDEX user_vocab_user_kind_idx;
  DROP TABLE user_vocab;
  ALTER TABLE user_vocab_new RENAME TO user_vocab;
  CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
  SELECT COUNT(*) FROM user_vocab;
  ```

- [ ] T029 Backfill prod — re-rodar `recomputeFacets` pra cada user. Opções:
  - **(a)** Disparar via cron manual (`curl -H "Authorization: Bearer $CRON_SECRET" https://sulco.vercel.app/api/cron/sync-daily`) — mas cron faz outras coisas (sync incremental). Pode rodar 2× e drift correction.
  - **(b)** Script standalone `scripts/_backfill-vocab-extended.mjs` que itera users e agrega format/country/label inline (sem depender de código deployado).
  - Recomendado: **(b)** pra controle. Criar script novo se necessário (mesmo padrão `_backfill-user-vocab.mjs` Inc 33).

- [ ] T030 **Gate verificável antes do push**:
  ```bash
  turso db shell sulco-prod "SELECT kind, COUNT(*) FROM user_vocab GROUP BY kind ORDER BY kind;"
  ```
  - Esperado: 8 rows (genres, styles, moods, contexts, shelves, formats, countries, labels) com COUNT > 0.
  - Se < 8 kinds ou COUNT = 0 em algum → ABORTAR push, voltar a T029.

- [ ] T031 Push main + deploy prod:
  ```bash
  git push origin main
  vercel --prod --yes
  ```
  Aguardar Ready (~1min).

- [ ] T032 Smoke prod: rodar cenários 1, 2, 3, 4, 6, 8 do [quickstart.md](./quickstart.md). Coletar logs `[DB]` via `vercel logs sulco.vercel.app --follow > /tmp/inc8-smoke.log 2>&1`.
  - Cenário 1: picker buttons substituem lista expandida.
  - Cenário 2: picker de Gênero mostra todos os termos + busca interna ativa (>20).
  - Cenário 3: picker de Formato sem busca interna.
  - Cenário 4: picker de Ano com chips de décadas.
  - Cenário 6: filtros compostos funcionam.
  - Cenário 8: mobile (viewport ≤640px) — bottom sheet abre.

- [ ] T033 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar `- **032** — Filter UX rework + 5 novos filtros (Inc 8) · 2026-05-XX · specs/032-filter-rework-and-new-fields/ · ...`. Remover Inc 8 de "Próximos". Atualizar header. Atualizar CLAUDE.md SPECKIT marker promovendo Inc 8 → "Prior active".

## Dependencies

- **T002 (schema TS)** ANTES de T003 (sqlite local migration).
- **T003 (sqlite local migration)** ANTES de T006 (backfill local).
- **T004 (VocabKind type)** ANTES de qualquer task que usa kinds novos.
- **T005 (`_repopulateVocab` estendido)** ANTES de T006 (backfill via recomputeFacets).
- **T007 (helpers wrapper)** ANTES de T011/T014/T019/T020 (page.tsx chama estes).
- **T008 (`<FilterPicker>` genérico)** ANTES de T009/T012/T014/T019/T020 (todos os pickers usam).
- **T009 (refator FilterBar US1)** ANTES de T012/T014/T018/T019/T020 (mesmo arquivo).
- **T010 → T011 → T012** (US2 cadeia: tipo → param → UI).
- **T013 → T014** (US3 cadeia).
- **T015 → T016 → T017 → T018** (US4 cadeia: tipo → param → DecadeFilterPicker → button).
- **T019** (US5 — todos em sequência).
- **T020** (US6 — todos em sequência).
- **T021 (smoke US7)** depende de US1-6 completos.
- **T022, T023** (hooks sync/archive): independentes entre si após T004. Sequenciais por arquivo (apply-update.ts e archive.ts).
- **T024 (build)** depende de T002-T023.
- **T025 (smoke local)** depende de T024.
- **T026-T027** (commit + merge): sequenciais.
- **T028 (migration prod)** ANTES de T029 (backfill prod).
- **T029 (backfill prod)** ANTES de T030 (gate). **CRÍTICO**.
- **T030 (gate)** depende de T028+T029+T027.
- **T031 (push + deploy)** depende de T030.
- **T032 (smoke prod)** depende de T031.
- **T033 (BACKLOG)** depende de T032 OK.

## Parallelization examples

Tasks `[P]` (independentes — mesmos arquivos NÃO paraleliza):

- T002 [P] — schema.ts
- T004 [P] — user-vocab.ts (depende T002)
- T007 [P] — collection.ts helpers (depende T004)
- T008 [P] — filter-picker.tsx (NOVO — não depende de outros componentes UI)
- T017 [P] — decade-filter-picker.tsx (NOVO)
- T022 [P] — apply-update.ts (independente de T023)
- T023 [P] — archive.ts (independente de T022)

Sequenciais (mesmo arquivo ou ordem importa):

- T009 → T012 → T014 → T018 → T019 → T020 (cadeia em filter-bar.tsx — refator + 5 picker buttons)
- T010 → T013 → T015 → T019 → T020 (cadeia em collection.ts — buildCollectionFilters extensions)
- T011 → T014 → T016 → T019 → T020 (cadeia em page.tsx — searchParams)
- T028 → T029 → T030 → T031 → T032 (migration prod → backfill → gate → deploy → smoke)

## MVP Scope

**MVP = US1-6** (T001-T020) + **hooks** (T022-T023) + **Polish** (T024-T032).

US7 (combinação) é validação automática via smoke — não há código próprio.

Tudo num único release. Esforço total ~4-5h.

## Implementation strategy

Sequência ótima:

1. **T001-T007** (Foundational: schema + helpers + backfill local, ~30min)
2. **T008** (FilterPicker genérico, ~30min)
3. **T009** (refator FilterBar pra picker buttons US1, ~30min)
4. **T010-T012** (US2 formato, ~20min)
5. **T013-T014** (US3 prateleira, ~10min — reusa Inc 33)
6. **T015-T018** (US4 ano décadas, ~30min)
7. **T019** (US5 país, ~10min)
8. **T020** (US6 selo, ~10min)
9. **T021** (smoke US7 local, ~5min)
10. **T022-T023** (hooks sync/archive, ~30min)
11. **T024-T025** (build + smoke local, ~10min)
12. **T026-T027** (commit + merge, ~3min)
13. **T028-T030** (migration + backfill + gate, ~10min)
14. **T031** (deploy, ~3min)
15. **T032** (smoke prod, ~15min)
16. **T033** (BACKLOG, ~5min)

**Total estimado: ~4h30**.

Após T032 OK, Inc 8 fecha. Próximas candidatas: Inc 31 (UX bag física), Inc 29 (UX rework filtros montar), Inc 32 stress test prometido.
