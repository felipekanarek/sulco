# Specification Quality Checklist: Tabela de vocabulário dedicada com counters

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs) — spec usa "estrutura unificada", "delta direcionado", "contador de referências" como conceitos de domínio. PLAN cobrirá HOW (Drizzle, libsql, react.cache).
- [X] Focused on user value and business needs — DJ edita vocab sem custo proibitivo (US1); chips refletem uso real (US2); sync/archive coerentes (US3); drift auto-corrige (US4). Meta de negócio: caber no free tier escalando 5-10 amigos.
- [X] Written for non-technical stakeholders — descreve experiência do DJ editando moods/contexts/shelves e vendo chips no picker.
- [X] All mandatory sections completed — User Scenarios (4 stories), Requirements (20 FR), Success Criteria (9 SC), Assumptions.

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous — cada FR é verificável (count de rows, presença/ausência de scan, presença/ausência de termos).
- [X] Success criteria are measurable — SC-001 a SC-009 com thresholds numéricos (≤10 rows, ≤200ms, redução %, etc.).
- [X] Success criteria are technology-agnostic — métricas em rows/operação, ms percebidos, sem mencionar SQLite/libsql/Drizzle.
- [X] All acceptance scenarios are defined — 4 User Stories com Given/When/Then.
- [X] Edge cases are identified — race em writes, delta errado, casing variante, backfill concorrente, termo vazio, coleção massiva, archive de track sem vocab.
- [X] Scope is clearly bounded — vocab materializado em 1 estrutura unificada cobrindo 5 kinds. Drop das colunas JSON antigas fica fora (Inc separado).
- [X] Dependencies and assumptions identified — banco populado em uso, vocab case-sensitive, sync escreve só genres/styles, cron diário existing, ordem migration→backfill→código.

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria — FR-001/002 → US1+US2; FR-003 → US2; FR-004/005/006/007/008/009 → US1; FR-010/011 → US3; FR-012/013 → US4; FR-014/015 → backfill (US3 prep); FR-016/017/018 → migração de callers (US1+US2 cobertura); FR-019 → ordem deploy; FR-020 → multi-user.
- [X] User scenarios cover primary flows — edição típica (US1, P1), filtros UX (US2, P1), sync/archive (US3, P2), drift correction (US4, P3).
- [X] Feature meets measurable outcomes defined in Success Criteria — SC-001 a SC-004 quantificam reds/operação; SC-005 latência percebida; SC-006 paridade visual; SC-007 drift; SC-008 escala 5-10 amigos; SC-009 backfill time.
- [X] No implementation details leak into specification — sem menção a tabela específica, JSON columns, INSERT/UPDATE/DELETE, índices, etc. Spec é abstrata; PLAN preencherá HOW.

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`
- Spec é coerente — escopo bem delimitado, decisões pré-acordadas durante diagnóstico em prod e sessão pós-Inc 28.
- Pronta pra `/speckit.plan` direto. Sem `/speckit.clarify` necessário (Felipe pré-acordou todas as decisões críticas: schema unificado, ref_count, drop fica em Inc 34, sync escopo, recomputeFacets fallback).
- Inc 33 mantém defasagem de 5 entre feature dir (028) e Inc number (33) — registrar mapping em CLAUDE.md SPECKIT marker no `/speckit.plan`.
