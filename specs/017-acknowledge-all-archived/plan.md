# Implementation Plan: Botão "Reconhecer tudo" no banner de archived

**Branch**: `017-acknowledge-all-archived` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/017-acknowledge-all-archived/spec.md`

## Summary

Hoje em `/status` cada record archived pendente exibe botão individual
"Reconhecer" via `<ArchivedRecordRow>` que chama
`acknowledgeArchivedRecord({ recordId })` (action existente em
[src/lib/actions.ts:1528](../../src/lib/actions.ts)). Quando sync detecta
múltiplos discos removidos do Discogs (Felipe reportou 9 archived após
sync 268 em 2026-04-25), reconhecer um a um vira fricção.

**Abordagem**: adicionar 1 Server Action bulk
`acknowledgeAllArchived()` (sem input — usa user da sessão) que faz
UPDATE atômico de todos os records archived pendentes do user atual,
filtrado por `userId`. UI ganha 1 componente client novo
`<AcknowledgeAllArchivedButton>` que chama a action via `useTransition`
+ `window.confirm`, integrado no header da seção "Discos arquivados"
em [src/app/status/page.tsx](../../src/app/status/page.tsx) quando
`archivedPending.length > 1`. Sem schema delta. Princípio V cumprido
via tap target 44×44 e confirmação nativa do browser (compatível
mobile-first por construção).

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM, `@libsql/client`, Zod (não há input externo nesta action — sem validação Zod necessária), Clerk (`auth()` para userId)
**Storage**: SQLite via libsql (Turso em prod). Reusa coluna `records.archivedAcknowledgedAt` (nullable timestamp) já existente desde Inc 002+
**Testing**: validação manual via quickstart (alinhado com convenção do projeto — sem unit tests automatizados)
**Target Platform**: Browser desktop + mobile (≤640px), via Vercel + Turso
**Project Type**: Web application (Next.js monolito com RSC + Server Actions)
**Performance Goals**: bulk UPDATE single-statement típico ≤50ms para até 100 records archived (worst case prático). `revalidatePath` cobre `/status` e `/` em ≤1s para banner global desaparecer (SC-002)
**Constraints**: Atomicidade obrigatória (Princípio IV — preservar em vez de destruir). Multi-user isolation via `WHERE userId = ?`. Tap target ≥ 44×44 px em mobile (Princípio V)
**Scale/Scope**: 1 user por vez; cardinalidade típica de archived pendente: 1–20 records (caso reportado: 9). Sem necessidade de paginação ou batching

## Constitution Check

*GATE: passa antes de Phase 0; re-check após Phase 1.*

- **I. Soberania dos Dados do DJ — OK**: `archivedAcknowledgedAt` é
  zona SYS (não AUTHOR). Nenhum campo autoral
  (`status`/`shelfLocation`/`notes`/curadoria/`aiAnalysis`) é tocado.
- **II. Server-First por Padrão — OK**: nova ação fica em
  `src/lib/actions.ts` com `'use server'`. Componente client é
  o mínimo possível (1 botão + 1 useTransition + window.confirm).
- **III. Schema é a Fonte da Verdade — OK**: zero schema delta. Reusa
  coluna `records.archivedAcknowledgedAt` já tipada.
- **IV. Preservar em Vez de Destruir — OK**: action não deleta nada.
  Apenas marca timestamp. Records archived continuam preservados no DB.
- **V. Mobile-Native por Padrão — OK**: comportamento mobile especificado
  em FR-010, SC-004 e edge case mobile (spec.md). Quickstart inclui
  cenário de validação mobile (375px). Tap target 44×44 px.
  `window.confirm` é nativo do browser → fullscreen overlay em
  iOS/Android sem retrofit.

**Sem violações.** Sem entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/017-acknowledge-all-archived/
├── plan.md              # This file
├── research.md          # Phase 0 — decisões de design (confirmação, threshold, atomicidade)
├── quickstart.md        # Phase 1 — cenários de validação manual (incl. mobile)
├── contracts/
│   └── server-actions.md  # Contrato da Server Action acknowledgeAllArchived
├── checklists/
│   └── requirements.md  # (já existente)
└── tasks.md             # Phase 2 — gerado por /speckit.tasks
```

Sem `data-model.md`: zero novas entidades; reuso de `records.archivedAcknowledgedAt`.

### Source Code (repository root)

```text
src/
├── app/
│   └── status/
│       └── page.tsx                          # ALTERADO — header da seção "Discos arquivados" passa a renderizar <AcknowledgeAllArchivedButton> quando archivedPending.length > 1
├── components/
│   ├── acknowledge-all-archived-button.tsx   # NOVO — client component, useTransition + window.confirm
│   ├── archived-record-row.tsx               # SEM MUDANÇA (botão individual continua intacto)
│   └── archived-records-banner.tsx           # SEM MUDANÇA (banner global; revalidate já cobre)
└── lib/
    └── actions.ts                             # ALTERADO — adiciona export `acknowledgeAllArchived()`
```

**Structure Decision**: app monolito Next.js (já estabelecido). Localização das mudanças:
- Server Action junto às demais em [src/lib/actions.ts](../../src/lib/actions.ts) (próxima de `acknowledgeArchivedRecord` para co-localização semântica).
- Componente client em [src/components/](../../src/components/) seguindo convenção dos demais (kebab-case file, PascalCase export).
- Integração feita inline no Server Component [src/app/status/page.tsx](../../src/app/status/page.tsx) — passa `count` e renderiza condicionalmente.

## Complexity Tracking

> Sem violações constitucionais. Tabela vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
