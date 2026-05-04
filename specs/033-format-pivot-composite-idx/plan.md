# Implementation Plan: Otimizar filtros pesados — pivot record_formats + index composite

**Branch**: `033-format-pivot-composite-idx` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-format-pivot-composite-idx/spec.md`

## Summary

Resolver o gargalo de reads identificado em prod pós-Inc 8: filtros
restritivos (`format=LP`, `year=1985`) hoje custam ~3k rows lidas/navegação
porque o planner usa `records_user_archived_imported_idx` pro `ORDER BY
imported_at DESC LIMIT 50` e percorre todo o index quando filtros não
encontram 50 matches rápido.

**Frente A**: pivot `record_formats(record_id, token)` análoga a Inc 35
substitui OR-de-LIKE por subquery com COVERING INDEX. Validado via
EXPLAIN local (1741 records → 5.8k entries pivot, 36 tokens distinct).

**Frente B**: index composite `(user_id, archived, year, imported_at DESC)`
permite planner usar year como driver mantendo ORDER BY natural sem TEMP
B-TREE FOR ORDER BY. Validado via EXPLAIN local — planner muda de
`SEARCH records USING INDEX records_user_archived_imported_idx` para
`SEARCH records USING COVERING INDEX records_user_archived_year_imported_idx`.

UI permanece visualmente idêntica — toda mudança é backend.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM 0.32+, `@libsql/client` (libsql/Turso), Zod 3.x
**Storage**: SQLite via libsql (Turso prod), local file `sulco.db` (dev)
**Testing**: smoke manual (quickstart) + EXPLAIN QUERY PLAN
**Target Platform**: Vercel (Next.js Hobby), Turso (libsql free tier)
**Project Type**: web-service (Next.js full-stack — RSC + Server Actions)
**Performance Goals**: filtros restritivos ≤200 rows lidas/navegação; combinação 8 filtros ≤500 rows lidas
**Constraints**: zero schema delta UI-visible; ordem deploy crítica (migration → backfill → code); cota Turso free tier 500M rows/mês
**Scale/Scope**: 1 user (Felipe) com 2587 records ativos em prod; escala 5-10 amigos. ~10k pivot entries esperadas (média ~4 tokens/record).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Princípio I — Soberania dos Dados do DJ

- ✅ `record_formats` é zona SYS materializada (deriva de `records.format` que é DISCOGS). DJ não escreve diretamente.
- ✅ Hooks de write em `applyDiscogsUpdate`/`archiveRecord` apenas populam pivot (mesmo Princípio I do Inc 35).

### Princípio II — Server-First por Padrão

- ✅ Nenhum componente client novo. Toda lógica em RSC + Server Actions existentes.
- ✅ Filter SQL muda em `src/lib/queries/collection.ts` (server-only).

### Princípio III — Schema é a Fonte da Verdade

- ✅ Schema delta minimalista — 1 tabela + 1 index composite + reuso de tipos/helpers existentes.
- ✅ Drizzle schema atualizado primeiro; tipos derivados depois.
- ✅ Migration explícita via script DDL atomic.

### Princípio IV — Preservar em Vez de Destruir

- ✅ Pivot é **derivada** — recomputável via backfill.
- ✅ Indexes são puramente aditivos.
- ✅ Sem deletes silenciosos. FK CASCADE só dispara em delete físico raríssimo.

### Princípio V — Mobile-Native por Padrão

- ✅ Feature é backend puro — zero impacto UI mobile. Quickstart inclui Cenário 8 mobile.

**Resultado**: 5/5 princípios OK. Sem violações. Procede pro Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/033-format-pivot-composite-idx/
├── plan.md              # Este arquivo (/speckit.plan output)
├── research.md          # Phase 0 — 7 decisões + risks
├── data-model.md        # Phase 1 — schema delta + transitions
├── quickstart.md        # Phase 1 — 8 cenários de validação
├── checklists/
│   └── requirements.md  # Spec quality checklist (do /speckit.specify)
└── tasks.md             # Phase 2 (criado por /speckit.tasks)
```

### Source Code (mudanças)

```text
src/
├── db/
│   └── schema.ts                          # +1 tabela `recordFormats` + 1 index composite
├── lib/
│   ├── queries/
│   │   └── collection.ts                  # buildCollectionFilters: format usa subquery pivot
│   └── discogs/
│       ├── apply-update.ts                # +applyPivotDelta em 3 paths (insert/update/reaparição)
│       └── archive.ts                     # NÃO toca pivot (filtro archived=0 cobre)

scripts/
└── _backfill-record-formats.mjs           # NOVO — backfill 1× prod
```

Pattern idêntico ao Inc 35 (record_genres/record_styles).

## Phase 0: Research

Resolvido em [research.md](./research.md). 7 decisões documentadas:

| # | Decision | Status |
|---|---|---|
| 1 | Pivot `record_formats(record_id, token)` análoga a Inc 35 | ✅ |
| 2 | Composite `(user_id, archived, year, imported_at DESC)` | ✅ |
| 3 | Manter os 4 indexes single-column de Inc 8 follow-up | ✅ |
| 4 | Hooks paralelos a Inc 35 via `applyPivotDelta` | ✅ |
| 5 | Backfill via script Node + `db.batch` chunk 500 | ✅ |
| 6 | Ordem deploy: migration → backfill → code | ✅ |
| 7 | Cron diário cobre drift residual | ✅ |

Q1/Q2 do prompt original resolvidos:
- **Q1**: composite apenas pra year. Country/label/shelf ficam pra Inc 36b se monitoring revelar.
- **Q2**: NÃO drop single-column. Mantém pra cobrir queries sem ORDER BY.

## Phase 1: Design

### Data Model

[data-model.md](./data-model.md) — schema delta + transitions + Princípios.

### Contracts

Sem contratos externos novos. Toda mudança é interna a `src/lib/queries/`
e `src/lib/discogs/`. Inputs/outputs de RSC e Server Actions preservados.

### Quickstart

[quickstart.md](./quickstart.md) — 8 cenários de validação manual em prod, comparando antes/depois. Inclui cenário mobile (Princípio V).

### Agent Context Update

CLAUDE.md SPECKIT marker atualizado pra apontar pra plan.md desta feature (será feito no commit final do `/speckit.implement`).

## Phase 2: Tasks (criado por `/speckit.tasks`)

Não criado neste comando. Próximo comando = `/speckit.tasks`.

## Constitution Re-Check (post-design)

- ✅ **I**: schema delta confirmou pivot = SYS materializada. Sem AUTHOR write.
- ✅ **II**: nenhum API route novo. Apenas modificação interna RSC/Server Actions.
- ✅ **III**: schema centralizado em `schema.ts`. Migration explícita.
- ✅ **IV**: pivot é derivada e recomputável. Indexes aditivos.
- ✅ **V**: backend puro. UI inalterada.

**Gates**: ALL PASS. Pronto pra `/speckit.tasks`.

---

## Estimativa final

- **Speckit phases (specify→plan→tasks→implement)**: ~2-3h
- **Schema delta**: 1 tabela + 1 index = mínimo
- **Code change**: ~3 arquivos modificados + 1 script novo
- **Risco**: baixo — pattern Inc 35 reusado quase idêntico
