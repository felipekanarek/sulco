---
description: "Task list — Inc 36 (033) Otimizar filtros pesados — pivot record_formats + index composite"
---

# Tasks: Otimizar filtros pesados — pivot record_formats + index composite

**Input**: Design documents from `/specs/033-format-pivot-composite-idx/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Smoke manual via [quickstart.md](./quickstart.md) (8 cenários). Sem testes automatizados nesta feature — pattern Inc 35.

**Organization**: tasks agrupadas por User Story pra permitir delivery independente. **MVP = US1** (pivot format) — entrega valor sozinho.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências)
- **[Story]**: a qual User Story a task pertence (US1-US4)
- Caminhos absolutos respeitam estrutura existente do projeto

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pré-requisitos compartilhados — verificações de ambiente.

- [x] T001 Verificar acesso a Turso prod via `turso db tokens create sulco-prod --expiration 1d` + `turso db show sulco-prod --url` (necessário pra T012 migration prod e T014 backfill prod)
- [x] T002 Verificar build verde no estado atual rodando `npm run build` em [/Users/infoprice/Documents/Projeto Sulco/sulco](.) — gate antes de qualquer mudança

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema delta + tipos TS — bloqueia US1 e US2.

- [x] T003 Adicionar tabela `recordFormats` em [src/db/schema.ts](../../src/db/schema.ts) seguindo pattern de `recordGenres`/`recordStyles` (linhas ~134-152): PK composta `(recordId, token)`, FK `recordId → records.id ON DELETE CASCADE`, index reverso `record_formats_token_idx ON (token, record_id)` — conforme [data-model.md](./data-model.md#nova-tabela-record_formats)
- [x] T004 Adicionar index composite `records_user_archived_year_imported_idx ON (user_id, archived, year, imported_at DESC)` em [src/db/schema.ts](../../src/db/schema.ts) bloco `(t) => ({...})` da tabela `records` (~linha 132 entre `userArchivedArchivedatIdx` e os 4 single-column do Inc 8 follow-up)

---

## Phase 3: User Story 1 — Filtrar por formato sem estourar reads (P1) 🟢 MVP

**Story Goal**: filtro `format=LP` em coleção 2.6k records consume ≤200 rows lidas no Turso (vs ~3k pré-Inc 36).

**Independent Test**: aplicar `?format=LP` em `/` em prod, conferir Turso dashboard "Rows Read" e EXPLAIN QUERY PLAN — esperado `SEARCH record_formats USING COVERING INDEX record_formats_token_idx + BLOOM FILTER`.

### Implementação core (write hooks)

- [x] T005 [P] [US1] Estender INSERT path em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) (~linha 87) — adicionar `applyPivotDelta(recordFormats, 'recordId', 'token', recordId, tokenizeFormat(release.format), [])` paralelo a `recordGenres`/`recordStyles`. Reusar import de `recordFormats` adicionado em T003.
- [x] T006 [P] [US1] Estender UPDATE path em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) (~linha 178-189) — calcular `fmtTokenDiff = diffVocabArrays(tokenizeFormat(oldFormat), tokenizeFormat(release.format))` (já existe `tokenizeFormat` local ao arquivo) e chamar `applyPivotDelta(recordFormats, ..., fmtTokenDiff.added, fmtTokenDiff.removed)` quando há diff. Substitui o uso atual de `applySingleValueVocabDiff(userId, 'formats', oldFormat, release.format)` por essa lógica + atualização paralela em `user_vocab` (mantém vocab consistente).
- [x] T007 [P] [US1] Estender REAPARIÇÃO path em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) (~linha 145) — adicionar `applyPivotDelta(recordFormats, ..., tokenizeFormat(release.format), [])` paralelo a `recordGenres`/`recordStyles` no bloco `if (wasArchived) { ... }`

### Filter SQL (substitui OR-de-LIKE)

- [x] T008 [US1] Substituir filtro `format` em `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) (~linha 134-149) — trocar OR posicional de 4 LIKE patterns por `${records.id} IN (SELECT record_id FROM record_formats WHERE token IN ${q.formats})`, mesmo pattern do filtro `genres`/`styles` (linhas 104-115). Manter import de `recordFormats` do schema.

### Backfill + smoke local

- [x] T009 [US1] Criar script `scripts/_backfill-record-formats.mjs` análogo a [scripts/_backfill-pivot-tables.mjs](../../scripts/_backfill-pivot-tables.mjs) (Inc 35) — SELECT id, format de records archived=0 com format != NULL, tokeniza via split-trim, INSERT batched em chunks de 500 via `db.batch(stmts, 'write')`. Idempotente: `INSERT OR IGNORE` ou DELETE prévio por user_id.
- [x] T010 [US1] Rodar T009 em DB local (`node scripts/_backfill-record-formats.mjs` sem env vars → `file:./sulco.db`) e verificar ~5-6k entries via `sqlite3 sulco.db "SELECT COUNT(*) FROM record_formats"` (esperado paridade com EXPLAIN test do plan.md: 5791 entries em 1741 records ativos)
- [x] T011 [US1] Smoke local: rodar `npm run build && npm run dev`, abrir `http://localhost:3000/?format=LP` e confirmar lista correta + EXPLAIN local via `sqlite3 sulco.db "EXPLAIN QUERY PLAN <query gerada>"` mostra uso de `record_formats_token_idx`

### Migration + backfill prod

- [x] T012 [US1] Migration prod via `@libsql/client` script inline (mesmo pattern Inc 8 follow-up): `db.batch(['CREATE TABLE record_formats (...)', 'CREATE INDEX record_formats_token_idx ON ...', 'CREATE INDEX records_user_archived_year_imported_idx ON ...'], 'write')` — usar token de T001
- [x] T013 [US1] Verificar migration prod aplicada: query `SELECT name FROM sqlite_master WHERE name IN ('record_formats', 'record_formats_token_idx', 'records_user_archived_year_imported_idx')` retorna 3 linhas
- [x] T014 [US1] Rodar backfill prod: `DATABASE_URL=... DATABASE_AUTH_TOKEN=... node scripts/_backfill-record-formats.mjs` — esperado ~10k entries pra Felipe (user 2)
- [x] T015 [US1] Gate verificável: `SELECT COUNT(*), COUNT(DISTINCT token) FROM record_formats WHERE record_id IN (SELECT id FROM records WHERE user_id=2 AND archived=0)` retorna ~10k rows / ~36 tokens

---

## Phase 4: User Story 2 — Filtros restritivos não-format usam index seletivo (P2)

**Story Goal**: filtro restritivo year=1985 (~30 records) consume ≤200 rows lidas; planner usa novo composite como driver.

**Independent Test**: aplicar `?year=1985` em prod, EXPLAIN deve mostrar `SEARCH records USING COVERING INDEX records_user_archived_year_imported_idx (user_id=? AND archived=? AND year=?)`.

**Note**: T004 (criar index composite) já é Foundational. Esta phase apenas confirma comportamento via smoke.

- [x] T016 [US2] Smoke local: `http://localhost:3000/?year=1985` → confirmar lista e rodar `sqlite3 sulco.db "EXPLAIN QUERY PLAN SELECT id FROM records WHERE user_id=1 AND archived=0 AND year=1985 ORDER BY imported_at DESC LIMIT 50"` → output `SEARCH records USING COVERING INDEX records_user_archived_year_imported_idx`
- [x] T017 [US2] (após T012-T015 prod) Smoke prod: `https://sulco.vercel.app/?year=1985` + verificar Turso dashboard reads adicionais ≤200

---

## Phase 5: User Story 3 — Combinação 8+ filtros mantém perf razoável (P3)

**Story Goal**: 8 filtros combinados consume ≤500 rows lidas.

**Independent Test**: URL `?status=active&genre=Funk&style=Soul&format=LP&year=1980&country=BR&label=...&shelf=Compactos` → Turso dashboard reads ≤500.

- [ ] T018 [US3] Smoke prod com URL completa de 8 filtros — conferir contador de reads no Turso dashboard antes/depois

---

## Phase 6: User Story 4 — Pivot consistente cross-write (P2)

**Story Goal**: hooks de write mantêm `record_formats` em sincronia com `records.format` em todos os caminhos (insert/update/archive/reaparição).

**Independent Test**: cenários do quickstart 6 e 7 — sync diário + reaparição preservam consistência.

**Note**: tasks de write hooks (T005-T007) já cobrem implementação. Esta phase é apenas verificação.

- [x] T019 [US4] Verificar consistência local após sync simulado: SELECT em `record_formats` JOIN records → todos os records archived=0 com format!='' tem N entries iguais ao len(tokenizeFormat(format))
- [x] T020 [US4] Verificar archive não-toca-pivot: arquivar 1 record local, conferir que pivot mantém entries (filter `archived=0` em queries cobre)
- [ ] T021 [US4] (pós-prod) Cron diário 04:00 UTC executa sem erro — verificar logs Vercel manhã seguinte

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: cleanup, documentação, deploy final.

- [x] T022 Build final `npm run build` (deve passar verde — TypeScript strict)
- [x] T023 Commit + push branch `033-format-pivot-composite-idx` + merge `--no-ff` em `main` + push main (mesmo pattern dos releases anteriores)
- [x] T024 Vercel `vercel --prod --yes` + confirmar `Ready` em [vercel ls --prod](https://vercel.com/felipekanarek-5052s-projects/sulco)
- [ ] T025 Smoke prod completo via [quickstart.md](./quickstart.md) — 8 cenários
- [x] T026 Atualizar [BACKLOG.md](../../BACKLOG.md): mover Inc 36 da seção "🟢 Próximos" pra "Releases (entregues, em prod)" com sumário detalhado (mesmo pattern Inc 35); atualizar header `**Última atualização**` pra 2026-05-04
- [x] T027 Atualizar [CLAUDE.md](../../CLAUDE.md) SPECKIT marker: descrever Inc 36 como deployado (key points: pivot record_formats + composite year_imported, redução esperada ≥97% em filtros pesados); marcar 033-format-pivot-composite-idx como "Prior active (now legacy)"
- [ ] T028 Commit final docs + push main

---

## Dependencies

```
T001, T002 (Setup)
  ↓
T003, T004 (Foundational — schema delta)
  ↓
US1 (P1 — MVP):
  T005, T006, T007 [P]  (write hooks)
    ↓
  T008                   (filter SQL)
    ↓
  T009, T010, T011       (backfill local + smoke)
    ↓
  T012, T013, T014, T015 (prod migration + backfill + gate)

US2 (P2):
  Depends on T004 (composite index — Foundational)
  T016, T017 (smoke local + prod)

US3 (P3):
  Depends on US1 + US2 done
  T018 (smoke combined)

US4 (P2):
  Depends on T005-T007 (write hooks)
  T019, T020, T021 (verificações)

Polish:
  Depends on US1-US4 done
  T022 → T023 → T024 → T025 → T026 → T027 → T028
```

---

## Parallel Execution Examples

**Phase 3 (US1)**: T005, T006, T007 podem rodar em paralelo (3 paths distintos no mesmo arquivo, mas blocos independentes — INSERT/UPDATE/REAPARIÇÃO). Após eles, T008 sequencial.

**Phase 7 Polish**: T026 e T027 podem rodar em paralelo (arquivos distintos). T028 espera ambos.

---

## Implementation Strategy (MVP-first)

**MVP = US1 sozinho**: pivot record_formats entrega valor independente — filtro format passa a ser eficiente. US2 (composite year) é orthogonal mas leve (1 index). Recomendação: implementar US1 + US2 juntos porque ambos dependem do mesmo schema delta (T003+T004) e mesma janela de migration prod.

**US3** (combinação 8 filtros) e **US4** (pivot consistente) são verificações — não exigem código novo, apenas smoke.

---

## Validação format

Total: **28 tasks** organizadas em **7 phases**.

| Phase | Tasks | Story |
|---|---|---|
| 1 — Setup | T001-T002 | (shared) |
| 2 — Foundational | T003-T004 | (shared) |
| 3 — US1 (MVP) | T005-T015 | US1 (P1) |
| 4 — US2 | T016-T017 | US2 (P2) |
| 5 — US3 | T018 | US3 (P3) |
| 6 — US4 | T019-T021 | US4 (P2) |
| 7 — Polish | T022-T028 | (cross-cutting) |

**Format check**: ✅ todos os 28 tasks seguem `- [ ] TID [P?] [Story?] Description with file path`.
