# Implementation Plan: Cobertura de testes retroativa (Inc 23-32)

**Branch**: `034-retroactive-test-coverage` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/034-retroactive-test-coverage/spec.md`

## Summary

Aplicar Princípio VI (Cobertura de Testes por Camada — Constitution
1.3.0) retroativamente sobre Inc 23-32. Auditoria pós-Inc 36 mostrou
0 cobertura direta em 10 arquivos críticos. Inc 37 ataca em 3 tiers
prioritizados:

- **Tier 3** (Helpers puros, P1): 3 unit tests sobre `normalizeText`
  (Inc 18), `computeRecordSearchText` (Inc 32), `diffVocabArrays`
  (Inc 33). ~30 cases. Custo ~1h. Valida pattern.

- **Tier 1** (AUTHOR proteção, P1 — Princípio I): 6 integration tests
  sobre Server Actions críticas (`updateRecordStatus`,
  `updateRecordAuthorFields`, `updateTrackCuration`, `archiveRecord`,
  `deleteSet`) + extensão de `sync-preserves-author-fields` cobrindo
  pivots Inc 35. ~33 cases. Custo ~3h.

- **Tier 2** (Equivalence em otimizações, P2 — Princípio VI bullet 4):
  4 integration tests sobre `buildCollectionFilters`, `applyVocabDelta`,
  `applyPivotDelta`, `cacheUser`. ~30 cases. Custo ~3h.

**+1 fechamento**: instalar `@vitest/coverage-v8` + script
`test:coverage` + gerar baseline em `coverage-baseline.md`
(Clarification Q1=A).

Total alvo: 50-60 testes novos. Ordem: Tier 3 → Tier 1 → Tier 2 →
Coverage.

## Technical Context

**Language/Version**: TypeScript strict
**Primary Dependencies**: Vitest 2.x (já instalado), `@libsql/client` in-memory pra test-db, Drizzle ORM. **NOVA**: `@vitest/coverage-v8`.
**Storage**: SQLite in-memory (test-db helper). Zero touch em `sulco.db` ou Turso prod.
**Testing**: Vitest unit + integration. Sem Playwright nesta feature.
**Target Platform**: Node.js 20+ local. Sem deploy.
**Project Type**: cobertura de testes — internal-only.
**Performance Goals**: suíte total `npm run test` mantém ≤30s de duração.
**Constraints**: zero touch em código de produção (FR-007). Princípio I/IV protegidos pela própria suíte criada.
**Scale/Scope**: ~50-60 testes, 12-13 arquivos novos, 1 helper de seed, 1 dep nova (`@vitest/coverage-v8`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Princípio I — Soberania dos Dados do DJ

- ✅ Tier 1 valida explicitamente AUTHOR não-overwrite. Cenário "ownership-fail" cobre user errado tentando modificar record alheio.

### Princípio II — Server-First por Padrão

- ✅ Testes integration usam `vi.doMock('@/db', ...)` + `vi.doMock('@/lib/auth', ...)`. Server Actions de produção ficam intactas (FR-007).

### Princípio III — Schema é a Fonte da Verdade

- ✅ Zero schema delta. `tests/helpers/test-db.ts` já reflete schema atual pós-Inc 36.

### Princípio IV — Preservar em Vez de Destruir

- ✅ Tier 1 cobre archive (preservação AUTHOR) e delete set (FK CASCADE só toca set_tracks).

### Princípio V — Mobile-Native por Padrão

- N/A: feature toca apenas testes, sem UI.

### Princípio VI — Cobertura de Testes por Camada

- ✅ Esta feature **É a aplicação retroativa do princípio**:
  - Helpers puros (Tier 3) — bullet 1.
  - Server Actions/queries (Tier 1) — bullet 2.
  - Otimizações sem mudança comportamental (Tier 2) — bullet 4.
  - Suíte gate (FR-005) — bullet 7.

**Resultado**: 6/6 princípios OK. Sem violações. Procede.

## Project Structure

### Documentation (this feature)

```text
specs/034-retroactive-test-coverage/
├── plan.md                  # Este arquivo
├── research.md              # Phase 0 — 7 decisões + risks
├── data-model.md            # Phase 1 — fixture + coverage table
├── quickstart.md            # Phase 1 — 6 cenários de validação
├── coverage-baseline.md     # NOVO (gerado pós-implement)
├── checklists/
│   └── requirements.md      # Spec quality (já completo)
└── tasks.md                 # Phase 2 (criado por /speckit.tasks)
```

### Source Code (mudanças)

```text
src/                                          # ZERO MUDANÇA (FR-007)

tests/
├── unit/
│   ├── normalize-text.test.ts                # NOVO Tier 3
│   ├── compute-record-search-text.test.ts    # NOVO Tier 3
│   └── diff-vocab-arrays.test.ts             # NOVO Tier 3
├── integration/
│   ├── sync-preserves-author-fields.test.ts  # ESTENDIDO Tier 1
│   ├── archive-record-author-preserved.test.ts  # NOVO Tier 1
│   ├── delete-set-preserves-tracks.test.ts      # NOVO Tier 1
│   ├── update-record-status.test.ts             # NOVO Tier 1
│   ├── update-record-author-fields.test.ts      # NOVO Tier 1
│   ├── update-track-curation.test.ts            # NOVO Tier 1
│   ├── buildCollectionFilters.test.ts           # NOVO Tier 2
│   ├── applyVocabDelta.test.ts                  # NOVO Tier 2
│   ├── applyPivotDelta.test.ts                  # NOVO Tier 2
│   └── cache-user.test.ts                       # NOVO Tier 2
└── helpers/
    └── seed-collection.ts                       # NOVO (fixture compartilhado)

vitest.config.ts                              # MODIFICADO (coverage block)
package.json                                  # MODIFICADO (devDep + script)
```

12 testes novos + 1 estendido + 1 helper + 1 config + 1 dep ≈ 15 arquivos afetados.

## Phase 0: Research

Resolvido em [research.md](./research.md). 7 decisões:

| # | Decision | Status |
|---|---|---|
| 1 | Ordem: Tier 3 → Tier 1 → Tier 2 | ✅ |
| 2 | Delivery monolítico (Inc 37 inteiro) | ✅ |
| 3 | Mock pattern `vi.doMock` uniforme | ✅ |
| 4 | Seed strategy: fixture compartilhado de 5 records | ✅ |
| 5 | Coverage tooling: `@vitest/coverage-v8` (Q1=A) | ✅ |
| 6 | Threshold gate diferido pra Inc 38 | ✅ |
| 7 | Baseline em `coverage-baseline.md` | ✅ |

## Phase 1: Design

### Data Model

[data-model.md](./data-model.md) — schema delta zero, fixture detalhado (2 users, 5 records, 5 tracks, 1 set), coverage table alvo por arquivo.

### Contracts

Sem contratos externos. Testes consomem APIs internas (Server Actions, queries, helpers) sem expor nada novo. test-db.ts é o "contract" interno do test fixture — preservado e estendido apenas se necessário.

### Quickstart

[quickstart.md](./quickstart.md) — 6 cenários:
1. Suíte total verde
2. Tier 3 unit
3. Tier 1 integration + smoke de regressão simulada
4. Tier 2 integration
5. Coverage baseline gerado
6. Princípio II preservado (`git diff main -- src/` vazio)

### Agent Context Update

CLAUDE.md SPECKIT marker atualizado pra apontar pra plan.md desta feature (no commit final do `/speckit.implement`).

## Phase 2: Tasks (criado por `/speckit.tasks`)

Não criado neste comando. Próximo = `/speckit.tasks`.

## Constitution Re-Check (post-design)

- ✅ **I**: Tier 1 com cenário ownership-fail explícito (5 Server Actions críticas).
- ✅ **II**: zero touch em produção, mocks via `vi.doMock`.
- ✅ **III**: zero schema delta confirmado.
- ✅ **IV**: archive + delete-set cobertos.
- ✅ **V**: N/A (sem UI).
- ✅ **VI**: feature é aplicação retroativa do próprio princípio.

**Gates**: ALL PASS. Pronto pra `/speckit.tasks`.

---

## Estimativa final

- **Speckit phases**: ~15min (specify) + 5min (clarify) + 20min (plan) + 15min (tasks) + ~6h (implement) + 30min (analyze opcional) = **~7-8h total**.
- **Schema delta**: zero.
- **Code change em `src/`**: zero.
- **Test files novos/estendidos**: 12 + 1 + 1 helper.
- **Risco**: baixo — feature aditiva, mocks padronizados, sem dependência de prod. Único risco real: estourar tempo (contingência: shipar Tier 1+3 e adiar Tier 2 pra Inc 37b sub-feature).
