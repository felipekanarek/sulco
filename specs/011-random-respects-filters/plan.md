# Implementation Plan: Curadoria aleatória respeita filtros aplicados

**Branch**: `011-random-respects-filters` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/011-random-respects-filters/spec.md](./spec.md)

## Summary

Refatorar `pickRandomUnratedRecord` (Server Action existente do Inc 006)
para aceitar filtros opcionais idênticos aos de `queryCollection` (texto,
gêneros, estilos, bomba). `<RandomCurationButton>` lê `searchParams` da
home via prop e passa pra action. Empty state ganha mensagem contextual
quando há filtros ativos. Sem schema delta. Status filter da URL é
intencionalmente ignorado (botão sempre `unrated`).

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Next.js 15 (RSC + Server Actions), Drizzle ORM, `@libsql/client`, Zod
**Storage**: SQLite/Turso via `@libsql/client`; reusa índice existente `records_user_status_idx`
**Testing**: Verificação manual via `npm run dev` + `npm run build` (TypeScript + lint)
**Target Platform**: Web (Vercel + Turso, Node.js 20+)
**Project Type**: single Next.js project (`src/`)
**Performance Goals**: ≤500ms em acervo de 2500+ discos (SC-004); RANDOM() sobre subset filtrado é mais rápido que sem filtros
**Constraints**: Princípio I respeitado (read-only, zero escrita em AUTHOR); Server Action ≤60s (trivial); reusar exatamente a lógica de `queryCollection` para consistência (FR-004)
**Scale/Scope**: 1 Server Action existente refatorada, 1 componente client refatorado, 1 página leitora (passa searchParams como prop)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Justificativa |
|-----------|--------|--------------|
| **I. Soberania dos Dados do DJ** | OK | Action é read-only sobre `records`. Filtros aplicam apenas SELECT, sem UPDATE em nenhum campo AUTHOR. |
| **II. Server-First por Padrão** | OK | Server Action existente continua em `src/lib/actions.ts`. Validação Zod nos filtros (mesmo schema usado no parsing de searchParams da home). Componente client já era client (botão precisa de `useTransition` + redirect). |
| **III. Schema é a Fonte da Verdade** | OK | Zero schema delta. Reusa `records.userId`, `archived`, `status`, `genres`, `styles`, `tracks.is_bomb`. |
| **IV. Preservar em Vez de Destruir** | OK | Action só lê. `archived=true` continua excluído por construção (FR-003). |

**Restrições técnicas**: nenhum desvio. Sem libs novas.

**Veredito**: passa sem violação. Sem Complexity Tracking necessário.

## Project Structure

### Documentation (this feature)

```text
specs/011-random-respects-filters/
├── plan.md                  # Este arquivo
├── spec.md                  # Spec (já criada)
├── research.md              # Decisões técnicas (Phase 0)
├── data-model.md            # Reuso de entidades existentes
├── contracts/
│   └── server-actions.md    # Contrato refatorado de pickRandomUnratedRecord
├── quickstart.md            # Validação manual
└── tasks.md                 # Phase 2 (gerado por /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── actions.ts                       # pickRandomUnratedRecord refatorada
│   └── queries/
│       └── collection.ts                # Helper buildCollectionFilters extraído (Decision 1)
├── components/
│   └── random-curation-button.tsx       # Lê filtros via prop, passa pra action,
│                                        # mensagem de empty state contextual
└── app/
    └── page.tsx                         # Passa searchParams parsed pro botão
```

**Structure Decision**: single Next.js project. Refator localizado em
`src/lib/actions.ts` + `src/lib/queries/collection.ts` (extrair helper)
+ 2 callers (`page.tsx`, `random-curation-button.tsx`). Sem novos
módulos.

## Phase 0: Outline & Research

Sem `[NEEDS CLARIFICATION]` na spec. Decisão técnica relevante:
extrair helper de filtros de `queryCollection` para evitar
duplicação. Detalhada em [research.md](./research.md).

## Phase 1: Design & Contracts

- **data-model.md**: zero entidade nova; lista campos reusados.
- **contracts/server-actions.md**: assinatura refatorada de
  `pickRandomUnratedRecord` (filtros opcionais).
- **quickstart.md**: 3 cenários manuais (filtro de estilo, múltiplos
  filtros AND, empty state contextual).
- **CLAUDE.md**: marker SPECKIT atualizado.

## Complexity Tracking

> Sem violações. Tabela vazia.
