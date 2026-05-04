# Feature Specification: Otimizar filtros pesados — pivot record_formats + index composite

**Feature Branch**: `033-format-pivot-composite-idx`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "Inc 36 — Otimizar filtros pesados: pivot record_formats + index composite com ORDER BY"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Filtrar por formato sem estourar reads (Priority: P1)

DJ aplica filtro de formato (`format=LP`) em `/` (home) e a listagem retorna em
≤200 rows lidas, em vez de varrer toda a coleção (~2.6k records). UI permanece
visualmente idêntica — chips selecionados, lista paginada de resultados,
contador.

**Why this priority**: format é o filtro mais usado pelo DJ pra separar 7"
de LPs (workflow físico de DJ — bag de festa diferente de bag de casa).
Hoje filtrar por LP custa o mesmo que listar tudo. Sem essa otimização,
Felipe estoura cota Turso em 1-2 sessões intensas.

**Independent Test**: aplicar `?format=LP` em `/` e medir EXPLAIN QUERY PLAN
+ contador de rows lidas via Turso dashboard. Esperado: planner usa pivot
table como driver, lendo apenas as ~2243 entries de LP (token-indexed) em
vez de full-scan. UI da home não muda em nada visualmente.

**Acceptance Scenarios**:

1. **Given** DJ tem 2.6k records dos quais 2243 são LP, **When** acessa
   `/?format=LP`, **Then** Turso reporta ≤200 rows lidas pra essa
   navegação (excluindo overhead de outras queries da página) e UI mostra
   primeira página de LPs ordenados por importedAt DESC.
2. **Given** DJ aplica `format=7"`, **When** lista carrega, **Then**
   resultado mostra apenas 7" e EXPLAIN confirma uso de
   `record_formats_token_idx` como driver da subquery.
3. **Given** DJ adiciona disco novo via sync Discogs (formato "Vinyl, LP,
   Album, Stereo"), **When** sync conclui, **Then** pivot
   `record_formats` recebe entries `(record_id, "Vinyl")`,
   `(record_id, "LP")`, `(record_id, "Album")`, `(record_id, "Stereo")`.
4. **Given** DJ arquiva um LP, **When** archive completa, **Then** pivot
   entries do record são removidas via cascade (ou bulk delete).

---

### User Story 2 — Filtros restritivos não-format usam index seletivo (Priority: P2)

DJ aplica filtro restritivo em year/country/label/shelf (ex: `year=1985`,
~30 records) e listagem retorna em ≤200 rows lidas. Planner usa o index
mais seletivo como driver (não mais o `imported_idx` que percorre tudo).

**Why this priority**: complementa US1. Filtros não-format (year, country,
label, shelf) hoje têm indexes single-column criados em Inc 8 follow-up
mas planner ainda prefere `imported_idx` por causa do `ORDER BY imported_at
DESC LIMIT 50`. Index composite que inclua `imported_at` permite usar
filtro como driver mantendo a ordem natural.

**Independent Test**: aplicar `/?year=1985` e medir EXPLAIN QUERY PLAN.
Esperado: planner usa index composite que cobre `(user_id, archived,
year, imported_at)` — varre 30 entries (uma por record com year=1985)
em vez de 2.6k.

**Acceptance Scenarios**:

1. **Given** coleção com ~30 records year=1985, **When** acessa
   `/?year=1985`, **Then** ≤200 rows lidas e EXPLAIN mostra index
   composite com year como driver.
2. **Given** filtros combinados year=1985 + country=BR (~5 records),
   **When** lista carrega, **Then** ≤200 rows lidas; planner picking o
   filtro mais seletivo como driver.

---

### User Story 3 — Combinação 8+ filtros mantém perf razoável (Priority: P3)

DJ aplica múltiplos filtros simultâneos (ex: status=ativo + genre + style
+ format + year + country + label + shelf) e listagem retorna em ≤500
rows lidas, mesmo que resultado final seja vazio.

**Why this priority**: caso edge raro mas importante pro confort do DJ
explorar a coleção. Hoje cada combinação cara hard refresh = ~3k reads.

**Independent Test**: aplicar URL com 8 search params e medir reads.
Esperado: ≤500 rows lidas (3-5× margem sobre US1/US2 pelo overhead de
múltiplas subqueries IN).

**Acceptance Scenarios**:

1. **Given** filtros simultâneos cobrindo 8 dimensões, **When** lista
   carrega, **Then** ≤500 rows lidas e UI mostra resultado correto
   (vazio ou paginado).

---

### User Story 4 — Pivot record_formats consistente cross-write (Priority: P2)

Hooks de write (sync Discogs, archive, edição manual de format) mantêm
pivot table em sincronia com `records.format`. Drift impossível.

**Why this priority**: garantia de correção. Filtro de format precisa
refletir realidade. Bug de drift = filtro falhar em mostrar disco.

**Independent Test**: cenários de write seguidos de query — assert
consistência:
- INSERT novo record → pivot recebe N tokens.
- UPDATE format (ex: "Vinyl, LP" → "Vinyl, LP, Stereo") → diff aplicado
  (added "Stereo").
- ARCHIVE record → pivot entries removidas.
- Reaparição (archived=true → false) → pivot re-populada.

**Acceptance Scenarios**:

1. **Given** record novo via sync com format "Vinyl, LP, Album",
   **When** sync conclui, **Then** pivot tem 3 entries para esse
   record_id.
2. **Given** record com format "Vinyl, LP", **When** Discogs envia
   update com "Vinyl, LP, Stereo", **Then** pivot ganha entry "Stereo"
   e mantém "Vinyl"+"LP".
3. **Given** record arquivado, **When** archive conclui, **Then** SELECT
   COUNT em pivot pra esse record_id retorna 0.
4. **Given** record reaparece (archived=false), **When** apply update,
   **Then** pivot re-popula entries.

### Edge Cases

- **Format vazio ou NULL**: record sem format declarado (raro Discogs)
  → não gera entries no pivot. Filtro `format=LP` não retorna.
- **Format com whitespace/duplicatas**: "Vinyl,  LP, Vinyl" → tokens
  trimmed; PK composta `(record_id, token)` evita duplicação na inserção.
- **Token vazio entre vírgulas**: "Vinyl, , LP" → tokens vazios
  filtrados (mesma lógica do tokenizeFormat existente).
- **Filtro com 0 matches**: `format=NaoExiste` → subquery retorna
  vazio, lista mostra empty state padrão. Reads ≤50 (apenas verifica
  pivot index).
- **Backfill em prod com dados existentes**: 2587 records × ~4 tokens
  médio = ~10k entries esperadas. Backfill atomic via `db.batch`.
- **Concorrência sync ↔ archive**: sync workers paralelos não devem
  inserir duplicatas. PK composta + `onConflictDoNothing` cobre.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST manter tabela pivot `record_formats(record_id,
  token)` com PK composta e index reverso `(token, record_id)` cobrindo
  lookup direto sem scan.
- **FR-002**: Sistema MUST popular pivot via tokenização de
  `records.format` (split por vírgula, trim, filtra empty) — mesma lógica
  já usada em `user_vocab` (Inc 8).
- **FR-003**: Filtro de format em `buildCollectionFilters` MUST usar
  `id IN (SELECT record_id FROM record_formats WHERE token IN ?)` em vez
  de OR-de-LIKE × 4 patterns.
- **FR-004**: Hooks de write (`applyDiscogsUpdate` insert/update/
  reaparição + `archiveRecord`) MUST manter pivot consistente — paralelo
  a record_genres/record_styles do Inc 35.
- **FR-005**: Sistema MUST criar 1+ index composite em `records` que
  inclua `(user_id, archived, <filtro>, imported_at)` permitindo planner
  usar filtro como driver mantendo ORDER BY natural. Exato escopo
  decidido em Q1.
- **FR-006**: Sistema MUST decidir se mantém ou drop os 4 indexes
  single-column (year/country/label/shelf) criados em Inc 8 follow-up,
  baseado na cobertura dos novos composites. Decidido em Q2.
- **FR-007**: Backfill prod MUST ser atomic (single migration) e
  idempotente (DELETE + INSERT por user, ou re-run safe).
- **FR-008**: UI da home MUST permanecer visualmente idêntica —
  comportamento de filtros, picker, paginator, contador — zero regressão
  visual.
- **FR-009**: EXPLAIN QUERY PLAN em prod MUST confirmar que filtros
  format/year/country/label/shelf usam o novo index/pivot como driver.
- **FR-010**: Cron diário existente (`/api/cron/sync-daily`) MUST
  manter pivot em sincronia em caso de drift via `recomputeFacets` ou
  helper similar (a definir no plan).

### Key Entities *(include if feature involves data)*

- **`record_formats` (pivot)**: PK `(record_id, token)`, FK `record_id
  → records.id ON DELETE CASCADE`. Token = string base ("LP", "7\"",
  "12\"", "CD", etc.) extraído do split de `records.format`.
- **`records_user_archived_year_imported_idx` (index composite, exemplo)**:
  4 colunas — escopo final em Q1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Filtro `format=LP` em coleção 2.6k records consume ≤200
  rows lidas no Turso (vs ~3k pré-Inc 36).
- **SC-002**: Filtro restritivo não-format (`year=1985`, `country=BR`)
  consume ≤200 rows lidas.
- **SC-003**: Combinação 8 filtros simultâneos consume ≤500 rows
  lidas.
- **SC-004**: 1 hard refresh sequencial após o primeiro (cache warm)
  consume ≤100 rows lidas (cobertura cacheUser preservada).
- **SC-005**: Sessão de teste de filtros (~10 cliques) consume ≤2k rows
  lidas, vs ~77-122k pré-Inc 36 (redução ≥97%).
- **SC-006**: Smoke geral em prod (`/`, `/sets/[id]/montar`,
  `/disco/[id]`, `/status`) zero regressão funcional ou visual.
- **SC-007**: Sync Discogs diário (cron 04:00 UTC) mantém pivot
  consistente — 0 drift detectado em verificação semanal manual.

## Assumptions

1. **Tokenização atual é fonte autoritativa**: `tokenizeFormat` em
   `src/lib/discogs/apply-update.ts` (split `,` + trim + filter empty)
   é a especificação. Pivot reflete o mesmo conjunto de tokens.
2. **Pivot é zona SYS materializada**: como `record_genres`/`record_styles`/
   `user_vocab`, é derivada de campo DISCOGS (`records.format`). Princípio
   I respeitado.
3. **Cron diário cobre drift residual**: como Inc 35, não há recompute
   incremental separado; cron diário é fallback se write hook falhar.
4. **Backfill prod usa script Node + libsql client direto**: mesmo
   pattern de Inc 28/30/32. Atomic via `db.batch`.
5. **Composite index em year é o filtro mais seletivo provável**: DJ
   tem ~60 anos distintos vs ~12 países e ~350 labels. Year tende a
   ser mais usado; country/label são casos edge.

## Dependencies

- Inc 35 (030) `record_genres`/`record_styles` em prod — pattern
  validado em escala real.
- Inc 8 (032) tokenização de format em writes — pivot herda mesma
  lógica.
- Inc 23 (022) cacheUser pra invalidação cross-request — preservado.
- Turso prod accessível via DATABASE_URL/AUTH_TOKEN.
