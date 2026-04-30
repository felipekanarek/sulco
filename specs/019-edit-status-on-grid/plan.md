# Implementation Plan: Editar status do disco direto na grid

**Branch**: `019-edit-status-on-grid` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/019-edit-status-on-grid/spec.md`

## Summary

Hoje a grid em `/` renderiza dois modos (lista
[`<RecordRow>`](../../src/components/record-card.tsx) e cards
[`<RecordGridCard>`](../../src/components/record-grid-card.tsx)),
ambos com `<StatusBadge>` apenas decorativo. Mudar status exige
abrir `/disco/[id]` ou triar via `/curadoria`. Esta feature
adiciona botões inline de transição de status em cada item da grid
(ambas as views), com optimistic UI + rollback em erro.

**Abordagem**: criar 1 client component compartilhado
`<RecordStatusActions>` que recebe `recordId`, `status` atual, e
um label descritivo. Ambos `<RecordRow>` e `<RecordGridCard>` o
renderizam (em layouts próprios). Internamente: `useTransition` +
`useState` pra optimistic state + `useState` pra erro com timer
auto-dismiss de 5s. Reusa Server Action `updateRecordStatus`
existente sem mudança.

Sem schema delta. Sem nova Server Action. Sem mudança nos
componentes de filtro (Inbox-zero pattern: ao mudar status que
exclui filtro corrente, a revalidação tira o card naturalmente —
~1s pós-clique).

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM (action existente), Tailwind CSS v3, `useTransition` + `useState` (React)
**Storage**: SQLite via libsql (Turso em prod). Reusa `records.status` (enum text — `unrated`/`active`/`discarded`) já tipado em [src/db/schema.ts](../../src/db/schema.ts)
**Testing**: validação manual via quickstart (alinhado com convenção do projeto)
**Target Platform**: Browser desktop + mobile (≤640px)
**Project Type**: Web application (Next.js monolito com RSC)
**Performance Goals**: optimistic UI ≤100ms (SC-002); revalidação RSC ≤1s pós-clique
**Constraints**: tap target ≥44×44 px em mobile (Princípio V); densidade da grid em desktop preservada ±20% (SC-004); a11y `aria-label` descritivo por botão (FR-012)
**Scale/Scope**: ~3 botões inline por card (visíveis condicionalmente conforme status); 1 toolbar de erro auto-dismiss (~5s); compatível com paginação atual da grid (sem mudança em `queryCollection`)

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: feature edita campo
  AUTHOR `records.status` apenas via clique do DJ. Reusa
  `updateRecordStatus` (action existente) que já tem ownership
  via `requireCurrentUser()`. Sem fonte externa.
- **II. Server-First por Padrão — OK**: a grid permanece RSC; o
  novo `<RecordStatusActions>` é client component pelo mínimo
  necessário (`useTransition` + estado de erro). Mutation segue
  via Server Action existente.
- **III. Schema é a Fonte da Verdade — OK**: zero schema delta.
  `records.status` já é tipado.
- **IV. Preservar em Vez de Destruir — OK**: nenhuma transição
  deleta dados. Curadoria é byte-idêntica antes/depois (SC-006).
  Princípio IV permite ações reversíveis sem confirm — spec
  cristalizou.
- **V. Mobile-Native por Padrão — OK**: FR-010 (tap target
  ≥44×44 mobile), SC-003 (validação 375–640px), edge case mobile
  na spec. Quickstart MUST incluir cenário mobile. Layout
  responsivo via Tailwind (`min-h-[44px] md:min-h-[32px]` é
  pattern já validado em features anteriores).

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/019-edit-status-on-grid/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões (componente compartilhado, optimistic state shape, error lifecycle, layout responsivo)
├── contracts/
│   └── ui-contract.md   # Contrato visual + comportamental do <RecordStatusActions>
├── quickstart.md        # Phase 1 — cenários de validação manual (incl. mobile + a11y + error rollback)
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades; reuso de
`records.status` já documentado.

### Source Code (repository root)

```text
src/
├── app/
│   └── page.tsx                                # SEM MUDANÇA — RSC continua passando rows pra <RecordRow> e <RecordGridCard>
├── components/
│   ├── record-card.tsx                         # ALTERADO — <RecordRow> renderiza <RecordStatusActions> abaixo do botão "Curadoria →"
│   ├── record-grid-card.tsx                    # ALTERADO — <RecordGridCard> renderiza <RecordStatusActions> abaixo do meta-line
│   └── record-status-actions.tsx               # NOVO — client component com botões inline + useTransition + erro auto-dismiss
└── lib/
    └── actions.ts                              # SEM MUDANÇA — `updateRecordStatus` existente é reusado
```

**Structure Decision**: monolito Next.js. 1 novo client component
compartilhado entre `<RecordRow>` (view list) e `<RecordGridCard>`
(view grid). Reusa Server Action existente. Pequeno ajuste em
ambos os componentes pais pra renderizar `<RecordStatusActions>`
em local apropriado ao layout.

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
