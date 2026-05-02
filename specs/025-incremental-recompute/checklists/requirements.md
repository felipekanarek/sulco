# Specification Quality Checklist: Recompute incremental + dedups remanescentes em /disco/[id]

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs) — spec é WHAT/WHY; PLAN cobre HOW. Spec não menciona tabelas, SQL específico, nem nomes de funções concretas.
- [X] Focused on user value and business needs — DJ cura disco com baixo consumo de reads; meta é caber 5-10 amigos no free tier.
- [X] Written for non-technical stakeholders — descreve o que o DJ faz e o que o sistema deve fazer; jargão limitado a "agregações materializadas" (necessário pro escopo).
- [X] All mandatory sections completed — User Scenarios (3 stories), Requirements (15 FR), Success Criteria (8 SC), Assumptions.

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous — cada FR é verificável (presença/ausência de queries, contagem de rows lidas, retorno HTTP).
- [X] Success criteria are measurable — SC-001 a SC-008 têm thresholds numéricos (≤ 5 queries, ≤ 1000 rows, ≤ 200ms, ≤ 50k reads/dia, etc).
- [X] Success criteria are technology-agnostic — métricas em queries/edição, ms, %, rows/dia. Não menciona Drizzle, libsql, Postgres, etc.
- [X] All acceptance scenarios are defined — User Stories 1, 2, 3 com Given/When/Then.
- [X] Edge cases are identified — race condition, no-op edits, último termo de vocab, drift sintético, cron falhando.
- [X] Scope is clearly bounded — 3 frentes (delta updates, dedup ai config, cron de drift). Recompute completo permanece como fallback.
- [X] Dependencies and assumptions identified — Vercel Hobby, free tier, cron existente reusado, Felipe único user prod, sqlite serializa.

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria — FR-001/002/007 → US1; FR-011/012 → US2; FR-009/010 → US3.
- [X] User scenarios cover primary flows — curadoria com baixo consumo (US1, P1), página com dedups (US2, P2), drift correction (US3, P2).
- [X] Feature meets measurable outcomes defined in Success Criteria — SC-001 quantifica queries/edição; SC-002 quantifica rows/curadoria; SC-004/005 quantifica reads/dia.
- [X] No implementation details leak into specification — não menciona `recomputeFacets`, `userFacets`, `react.cache`, etc. Spec usa termos abstratos como "objeto de usuário cached por request" e "agregações materializadas".

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`
- Spec abstrai escopo técnico (frente C — wrap loadDisc — foi explicitamente excluída pelo mantenedor; spec não a menciona).
- Frente D (audit revalidatePath) está coberta em FR-013 sem prescrever implementação.
- Pronta para `/speckit.plan` direto. Não precisa `/speckit.clarify` — escopo bem definido com mantenedor durante diagnóstico em prod.
