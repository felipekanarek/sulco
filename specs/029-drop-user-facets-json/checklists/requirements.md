# Specification Quality Checklist: Cleanup pós-vocab — drop de colunas mortas

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs) — spec usa "colunas dedicadas a listas", "tabela enxuta", "vocabulário materializado" como conceitos. PLAN cobre HOW.
- [X] Focused on user value and business needs — schema reflete realidade (P1 mantenedor); funcionalidade preservada (P1 DJ); recomputação mais barata (P2).
- [X] Written for non-technical stakeholders — descreve cleanup técnico mas em termos de "leitor da spec entende sem ruído", "DJ não percebe diferença".
- [X] All mandatory sections completed — 3 User Stories com priorities, 12 FR, 6 SC, 6 edge cases, 7 assumptions.

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous — cada FR é verificável (count de colunas, presença/ausência de helpers, build TS).
- [X] Success criteria are measurable — SC-001 (zero greps), SC-002 (12→7 campos), SC-003 (100% funcional), SC-004 (build OK), SC-005 (5 SELECTs a menos), SC-006 (cota preservada).
- [X] Success criteria are technology-agnostic — métricas em campos, queries, smoke checks. Sem mencionar Drizzle/libsql/SQLite.
- [X] All acceptance scenarios are defined — 3 User Stories com Given/When/Then.
- [X] Edge cases are identified — ordem de deploy, migration race, caller esquecido, reversão, falha em DROP COLUMN, cron concorrente.
- [X] Scope is clearly bounded — apenas cleanup das 5 colunas mortas. NÃO toca user_vocab (Inc 33), NÃO toca counters de records, NÃO toca outros aspectos.
- [X] Dependencies and assumptions identified — Inc 33 deployado e validado, backend suporta DROP COLUMN, sem ambiente staging, reversibilidade aceitável.

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria — FR-001/002 → US1; FR-003/004 → US1+US2; FR-005/007 → US2+US3; FR-006 → US3; FR-008/009 → US2 deploy; FR-010/011/012 → US2 segurança.
- [X] User scenarios cover primary flows — leitura limpa do schema (US1), funcionalidade preservada (US2), recomputação simplificada (US3).
- [X] Feature meets measurable outcomes defined in Success Criteria — SC-001 quantifica zero refs; SC-002 quantifica número de campos; SC-005 quantifica delta de SELECTs.
- [X] No implementation details leak into specification — spec não menciona Drizzle, libsql, ALTER TABLE syntax, etc. PLAN preencherá.

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`
- Spec é coerente — escopo estritamente limitado ao cleanup. Decisões pré-acordadas (Felipe).
- Pronta pra `/speckit.plan` direto. Sem `/speckit.clarify` necessário.
- Inc 34 mantém defasagem de 5 entre feature dir (029) e Inc number (34) — registrar mapping em CLAUDE.md SPECKIT marker.
- Inc 34 é o **último item da fila de reads/cleanup pós-Inc 33**. Após shipar, prioridade volta pra UX (Inc 30/31/29).
