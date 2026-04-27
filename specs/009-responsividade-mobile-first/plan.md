# Implementation Plan: Responsividade mobile-first do Sulco (009)

**Branch**: `009-responsividade-mobile-first` | **Date**: 2026-04-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-responsividade-mobile-first/spec.md`

## Summary

Refator front-end aditivo pra fazer todas as rotas autenticadas
funcionarem em mobile (360-640px viewport). Estratégia mobile-first
com Tailwind v3 (default = mobile, prefixos `md:`/`lg:` adicionam
desktop), 2 client components novos (`<MobileNav>` drawer lateral +
`<FilterBottomSheet>` reutilizável), e refactor cirúrgico de 5
componentes/páginas existentes (header em `layout.tsx`, `<TrackCurationRow>`,
`<CandidateRow>`, `<MontarFilters>`, `<FilterBar>` da home + `/disco/[id]`
e `/sets/[id]/montar` pages). Sem schema delta, sem novas Server
Actions, sem dependências novas. PWA fica como Inc futuro 2b.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Next.js 15 App Router (RSC) — mesmo stack 001-008.
**Primary Dependencies**: Tailwind CSS v3 (mobile-first breakpoints sm/md/lg/xl já existentes), React 19 (`useState` + `useEffect` pra drawer state). Sem dependências novas.
**Storage**: N/A — feature é puramente front-end. Reutiliza Server Actions e queries do 001-008.
**Testing**: Vitest pra component tests novos (drawer + nav); Playwright e2e em modo mobile (`viewport: 375x667`) pra US1; visual diff manual pra anti-regressão desktop.
**Target Platform**: Web mobile (Safari iOS ≥15, Chrome Android ≥100) + desktop existente preservado. Mesmos targets dos 001-008.
**Project Type**: Web app single project (Next.js).
**Performance Goals**: SC-001 fluxo US1 completo em ≤30s no celular; SC-005 funcionando em iPhone real (Safari) e Android real (Chrome).
**Constraints**: Sem service worker (PWA é Inc futuro), sem libs de UI externas (constituição), sem mudanças de schema, sem regressão visual desktop (SC-004).
**Scale/Scope**: 4 user stories, 17 FRs em 7 grupos, ~10 rotas autenticadas a auditar, ~6-8 componentes a refatorar.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Alinhamento com `.specify/memory/constitution.md` v1.0.0:

- **I. Soberania dos Dados do DJ (NON-NEGOTIABLE)** — ✅ Respeitado. Feature é puramente front-end de **apresentação**: zero leitura/escrita de campos AUTHOR. Refactor de UI não toca actions nem queries que poderiam mexer em curadoria. Reutiliza 100% das primitivas existentes.
- **II. Server-First por Padrão** — ✅ Respeitado. RSCs continuam fazendo fetch (loadDisc, queryCandidates etc.); Server Actions inalteradas. 2 client components novos (`<MobileNav>`, `<FilterBottomSheet>`) são justificados pela constituição: requerem estado local (open/closed), event handlers, e gerenciamento de body scroll lock — interatividade JS real, não decoração.
- **III. Schema é a Fonte da Verdade** — ✅ Respeitado. Zero schema delta. Drizzle queries inalteradas.
- **IV. Preservar em Vez de Destruir** — ✅ Respeitado. Sem deletes, sem migrações destrutivas. Refator visual.

**Restrições técnicas**: Sem Redux/Zustand (proibido) — drawer/sheet state local via `useState`. Sem shadcn (idem) — `<MobileNav>` e `<FilterBottomSheet>` implementados do zero com Tailwind. Stack inalterada (Next 15 + Tailwind v3 + libsql).

**Conclusão**: passa sem desvios. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/009-responsividade-mobile-first/
├── plan.md                    # Este arquivo (/speckit.plan)
├── research.md                # Phase 0 (/speckit.plan)
├── data-model.md              # Phase 1 (/speckit.plan) — minimal (sem schema delta)
├── quickstart.md              # Phase 1 (/speckit.plan)
├── contracts/
│   └── components.md          # Contratos UI dos novos client components
├── checklists/
│   └── requirements.md        # ✅ aprovado em /speckit.specify
└── tasks.md                   # Phase 2 (/speckit.tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
sulco/
├── src/
│   ├── components/
│   │   ├── mobile-nav.tsx              # ← NOVO drawer lateral (FR-007/007a)
│   │   ├── mobile-drawer.tsx           # ← NOVO primitiva genérica (lateral OU bottom)
│   │   ├── filter-bottom-sheet.tsx     # ← NOVO bottom sheet de filtros (FR-008/008a/008b)
│   │   ├── filter-active-chips.tsx     # ← NOVO chip-bar de filtros aplicados (FR-008b)
│   │   ├── track-curation-row.tsx      # ← REFATOR: grid responsivo, tap targets, editor mobile
│   │   ├── candidate-row.tsx           # ← REFATOR: 1 coluna mobile, badges essenciais
│   │   ├── montar-filters.tsx          # ← REFATOR: empacota dentro de FilterBottomSheet em mobile
│   │   ├── filter-bar.tsx              # ← REFATOR: idem (home /)
│   │   ├── record-grid-card.tsx        # ← REFATOR: 1col≤480px, 2col≤768px (FR-011)
│   │   └── (outros conforme necessário)
│   ├── app/
│   │   ├── layout.tsx                  # ← REFATOR: Header colapsa em mobile + monta MobileNav
│   │   ├── disco/[id]/page.tsx         # ← REFATOR: banner full-width + stack vertical (FR-009)
│   │   ├── sets/[id]/montar/page.tsx   # ← REFATOR: filtros viram FilterBottomSheet em mobile
│   │   └── (outras pages auditar individualmente)
│   └── app/globals.css                 # ← Possível ajuste: classes utility de safe-area, scroll lock
└── tests/
    ├── unit/
    │   └── (n/a — feature é UI; cobertura via e2e)
    ├── integration/
    │   └── mobile-drawer-state.test.tsx     # estado open/closed, body scroll lock, tap fora fecha
    └── e2e/
        └── mobile-curadoria-fluxo.spec.ts   # US1 fluxo end-to-end em viewport 375x667
```

**Structure Decision**: Projeto único. Feature 009 adiciona ~3-4 client components novos em `src/components/`, refatora ~5-6 componentes existentes pra mobile-first responsivo, e ajusta 3-4 páginas pra layout adaptativo. Padrão idêntico aos incrementos anteriores — incremental sobre o existente, sem reorganizar estrutura.

## Complexity Tracking

> Preencher apenas se Constitution Check tiver violações justificáveis.

Sem violações. Seção vazia.
