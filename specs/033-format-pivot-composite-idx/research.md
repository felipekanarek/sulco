# Research — Inc 36 (033)

## Decision 1 — Pivot table `record_formats(record_id, token)`

**Decision**: criar tabela pivot análoga a `record_genres`/`record_styles`
(Inc 35). PK composta `(record_id, token)`, index reverso `(token,
record_id)`, FK ON DELETE CASCADE.

**Rationale**: validado experimentalmente via EXPLAIN QUERY PLAN local
(1741 records, ~36 tokens distinct). Filtro `format=LP` passa a usar
`record_formats_token_idx` como driver via subquery `id IN (SELECT
record_id FROM record_formats WHERE token IN ?)`. Pattern exato do Inc 35
funciona aqui sem adaptação. SQLite pega COVERING INDEX + BLOOM FILTER
automaticamente.

**Alternatives considered**:
- **OR-de-LIKE atual** (Inc 8): 4 patterns × N tokens — não usa index,
  scan ~2.6k rows. Descartado: foi exatamente o que motivou Inc 36.
- **FTS5 sobre records.format**: full-text overkill pra ~36 tokens
  finitos; storage extra significativo; sintaxe diferente da SQL
  esperada. Descartado.
- **Materializar tokens em `user_vocab`**: já existe (Inc 8 estendido).
  Mas user_vocab não tem record_id — só count agregado. Não serve pra
  filter SQL. Pivot é complementar, não substituto.

---

## Decision 2 — Index composite `(user_id, archived, year, imported_at DESC)`

**Decision**: criar 1 index composite em `records` cobrindo
`(user_id, archived, year, imported_at DESC)`. Year é o filtro
não-format mais provável de ser seletivo (60+ valores distintos vs
12 países / 350 labels / 2 prateleiras).

**Rationale**: validado experimentalmente. Com o composite criado, o
planner muda de:
```
SEARCH records USING INDEX records_user_archived_imported_idx
  (user_id=? AND archived=?)
```
para:
```
SEARCH records USING COVERING INDEX records_user_archived_year_imported_idx
  (user_id=? AND archived=? AND year=?)
```
Inclui `imported_at DESC` no index, eliminando TEMP B-TREE FOR ORDER BY
(mesma técnica do Inc 35).

**Alternatives considered**:
- **4 indexes composite (year/country/label/shelf cada um com
  imported_at)**: 4× custo de write por record (~6.4k rows × 4 = 25.6k
  index entries adicionais). Storage: ~3-5MB extra. Q1 do prompt
  original sugeria isso. **Descartado pra Inc 36** — escopo amarrado:
  começar com year (mais provável de ser usado), monitorar uso real,
  abrir Inc 36b se country/label/shelf surgirem como gargalos.
- **Sem composite (apenas single-column existentes do Inc 8 follow-up)**:
  testado em prod — planner não pega por causa do ORDER BY natural.
  Descartado.
- **Multi-column `(user_id, archived, year, country, ...)` ultra-largo**:
  não cobre filter sets distintos, custo de write desproporcional.
  Descartado.

---

## Decision 3 — Manter os 4 indexes single-column de Inc 8 follow-up

**Decision**: NÃO drop os indexes single-column criados em Inc 8
follow-up (`records_user_archived_year_idx`, `..._country_idx`,
`..._label_idx`, `..._shelf_idx`).

**Rationale** (Q2 do prompt):
- Composite de Inc 36 cobre apenas `(user_id, archived, year, imported_at)`.
  Não substitui filtros em country/label/shelf.
- Single-column ainda servem queries sem ORDER BY (ex: `getYearRange`
  derivações, `listUserShelves` se um dia migrar pra DISTINCT em
  records, ou queries futuras).
- Custo de manter: 4× ~3k rows × ~12 bytes = ~144KB total. Trivial.
- Custo de drop + recriar futuro: 4× CREATE INDEX em prod = downtime
  de segundos.

**Alternatives considered**:
- **Drop todos os 4 single-column**: economiza ~144KB + write cost.
  Mas re-aplicação futura é trabalho extra. Descartado por margin
  pequena.

---

## Decision 4 — Hooks de write paralelos a Inc 35

**Decision**: implementar hooks `applyDiscogsUpdate` e `archiveRecord`
em paralelo aos existentes de `record_genres`/`record_styles` (Inc 35).
Reuso de `applyPivotDelta` em `src/lib/pivot-helpers.ts`.

**Rationale**: pattern já validado em prod (Inc 35). 4 paths cobertos:
1. INSERT novo record → INSERT N tokens.
2. UPDATE format (composite Discogs muda) → diff old vs new tokens via
   `tokenizeFormat` + `applyPivotDelta`.
3. ARCHIVE → bulk DELETE via FK CASCADE (mas `archiveRecord` NÃO toca
   pivot diretamente — filtro `WHERE archived=0` em todas as queries de
   filtro impede pivot entries de archived aparecerem; FK CASCADE cobre
   delete físico raríssimo).
4. REAPARIÇÃO (`wasArchived=true → false`): re-INSERT entries via
   `applyPivotDelta`.

**Alternatives considered**:
- **Hook em `archiveRecord` deletando entries da pivot**: redundante
  porque queries filtram `archived=0` no records. Inc 35 confirmou que
  não-touching pivot em archive funciona. Descartado.
- **Trigger SQL ON UPDATE**: não-portável, complica review/debug.
  Descartado.

---

## Decision 5 — Backfill via script Node + libsql

**Decision**: script `scripts/_backfill-record-formats.mjs` lê todos
records archived=0 com format != NULL, tokeniza via split-trim, batch
INSERT com chunk size 500.

**Rationale**: pattern validado nos backfills Inc 24/27/28/30/32.
`db.batch(stmts, 'write')` reduz tempo de ~1h sequencial → ~1min em
remote libsql.

**Alternatives considered**:
- **Trigger SQL one-shot**: SQLite suporta mas envolve eval de string
  composta complexo. Não-portável. Descartado.
- **`db:push` do drizzle**: cria tabela vazia mas não popula. Depois
  precisaria do script anyway. Mantemos só script.

---

## Decision 6 — Ordem de deploy (migration → backfill → code)

**Decision**: ordem crítica:
1. Migration prod (CREATE TABLE + indexes via DDL batch atômico).
2. Backfill prod (popular pivot via script Node).
3. Code deploy (commit + push + Vercel deploy).

**Rationale**: ordem inversa quebraria. Code novo procura `record_formats`
e falharia até backfill rodar. Tabela vazia + code novo retornaria 0
matches em todos os filtros = listagem vazia em prod. Backfill primeiro
garante consistência at deploy time.

Mesmo pattern de Inc 35 e Inc 33.

**Alternatives considered**:
- **Migration + code junto, backfill depois**: causa downtime de
  filtro até backfill terminar. Descartado.
- **Drizzle migration synchronous no server start**: app Vercel não
  controla DB lifecycle; risco em serverless. Descartado.

---

## Decision 7 — Cron diário cobre drift

**Decision**: nenhum recompute incremental de `record_formats`
separado. Cron diário `/api/cron/sync-daily` (existente) chama
`recomputeFacets(userId)` ou helper análogo se necessário, mas pivot
é mantida pelos hooks normais. Drift cobre-se via re-execução do
backfill manual se houver bug.

**Rationale**: igual ao Inc 35 — pattern de hooks consistentes mais
sync diário cobre 99.9% dos casos. Pra os outros 0.1%, restore via
backfill é trivial (idempotente).

**Alternatives considered**:
- **Recompute helper com `applyPivotDelta` no cron**: redundante. Hooks
  já cobrem casos de write normais. Descartado.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Backfill prod consome reads alto durante 1× | Script offline (não bloqueia deploy); aplica em prod fora de horário de pico (madrugada). Reads ~2.6k records SELECT + 5-10k INSERT. |
| Pivot diverge de records.format por bug em hook | Cron diário detecta via `recomputeFacets` se incluído; backup: `_backfill-record-formats.mjs` re-executável. |
| Composite index não escolhido pelo planner em alguns casos | Plano B: análise EXPLAIN em prod pós-deploy; iterar se necessário. Inc 36b cobre expansão se Q1 expandir. |
| Custo write extra em sync Discogs | Pequeno (~4 INSERT extra por record vs ~30 já existentes). Aceitável. |

---

## Open Questions resolvidas

- **Q1 (escopo do composite)**: apenas year. Country/label/shelf ficam
  pra Inc 36b se monitoring revelar gargalo.
- **Q2 (drop single-column)**: NÃO. Mantém pra cobrir queries sem
  ORDER BY.
- **Q3 (mudar ORDER BY)**: descartado. Inc 36 é otimização pura, sem
  mudança de UX.
