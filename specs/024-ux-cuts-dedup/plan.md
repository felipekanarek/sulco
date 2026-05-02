# Implementation Plan: Cortes UX agressivos + dedup de queries

**Branch**: `024-ux-cuts-dedup` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-ux-cuts-dedup/spec.md`

## Summary

Reduzir ~17 queries SQL por load `/` para ≤6, atacando 3 vetores: (1) deduplicação de calls a `requireCurrentUser` e `getUserFacets` via `react.cache()` do React 19; (2) remoção de componentes globais com baixo valor (`<SyncBadge>`, `<ArchivedRecordsBanner>`); (3) renderização condicional do `<ImportProgressCard>` + remoção da rota `/curadoria` morta + mover `killZombieSyncRuns` para cron diário + `prefetch={false}` universal em links autenticados.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC), Drizzle ORM (libsql dialect), React 19 (`cache()`)
**Storage**: Turso (libsql) prod; SQLite local dev; schema em [src/db/schema.ts](../../src/db/schema.ts) — **sem mudança nesta feature**
**Testing**: Validação manual via [quickstart.md](./quickstart.md) + medição via instrumentação `[DB]` em logs Vercel + dashboard Turso
**Target Platform**: Vercel Hobby (Lambda nodejs24.x, region gru1/iad1), browsers modernos (Princípio V — mobile incluso)
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: ≤6 queries SQL por load `/`; cold start Lambda ≤600ms (vs ~1.2s hoje); ≤1M row reads/dia em uso solo intenso
**Constraints**: zero gasto (Hobby plan), zero schema delta, reversível por commit revert, Vercel Hobby cache `unstable_cache` é no-op (Lambdas freshly created por request)
**Scale/Scope**: ~10 arquivos modificados, ~3 arquivos deletados, escopo bem confinado; usuário solo (Felipe, ~2588 records, ~10k tracks) projetando escala 5-10 amigos no free tier 500M reads/mês

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ feature é puramente leitura/UI. Nenhuma escrita em campos AUTHOR. `archived` e `archivedAcknowledgedAt` (zona SYS) não são tocados — apenas o ponto de exibição global é removido.
- **II — Server-First por Padrão**: ✅ tudo continua RSC. Otimização é via `react.cache()` que é nativo do React 19 RSC. Sem novos client components. Sem novas API routes.
- **III — Schema é a Fonte da Verdade**: ✅ zero schema delta. Sem migration. Sem mudança em `src/db/schema.ts`.
- **IV — Preservar (Soft-Delete)**: ✅ archived records, conflicts, sync runs continuam preservados em DB. Apenas o ponto de exibição global muda — informação acessível em `/status`. `/curadoria` é deletado mas é rota morta (zero dados afetados).
- **V — Mobile-Native por Padrão**: ✅ menu mobile (`MobileNav`) mantém link "Sync" → `/status`. Tap targets ≥44×44 px preservados. Cortes não pioram experiência mobile (banner global era visualmente intrusivo em viewport pequeno).

**Resultado**: passa em todos os princípios. Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/024-ux-cuts-dedup/
├── plan.md                      # Este arquivo
├── research.md                  # Phase 0 — decisões + alternativas
├── data-model.md                # Phase 1 — N/A (zero entities novos)
├── quickstart.md                # Phase 1 — validação manual
├── contracts/
│   └── observability-contract.md # Phase 1 — formato de log [DB] esperado
└── checklists/
    └── requirements.md          # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── lib/
│   ├── auth.ts                  # MOD: wrappar getCurrentUser/requireCurrentUser em react.cache()
│   ├── queries/
│   │   ├── user-facets.ts       # MOD: wrappar getUserFacets em react.cache()
│   │   ├── status.ts            # MOD: remover killZombieSyncRuns; deletar computeBadgeActive
│   │   └── curadoria.ts         # DELETE: helper sem callers após remoção de rota
│   └── actions.ts               # MOD: remover killZombieSyncRuns de getImportProgress
├── components/
│   ├── sync-badge.tsx           # DELETE
│   ├── archived-records-banner.tsx  # DELETE
│   ├── mobile-nav.tsx           # MOD: remover link Curadoria; prefetch=false (audit)
│   └── curadoria-view.tsx       # DELETE (se existir e sem callers externos)
└── app/
    ├── layout.tsx               # MOD: remover imports + uso de SyncBadge e ArchivedRecordsBanner; remover NavLink "Curadoria"
    ├── page.tsx                 # MOD: render condicional de ImportProgressCard
    ├── curadoria/
    │   ├── page.tsx             # DELETE
    │   └── concluido/
    │       └── page.tsx         # DELETE
    └── api/cron/sync-daily/
        └── route.ts             # MOD: chamar killZombieSyncRuns explicitamente

# Outros arquivos (audit prefetch=false em todos os <Link>):
src/components/conflict-row.tsx
src/components/archived-record-row.tsx
src/components/record-card.tsx
src/components/candidate-row.tsx
src/app/disco/[id]/page.tsx
src/app/sets/page.tsx
src/app/sets/[id]/page.tsx
src/app/sets/[id]/montar/page.tsx
src/app/admin/page.tsx
src/app/admin/convites/page.tsx
```

**Structure Decision**: single-app Next.js App Router. Mudanças são localizadas em camadas existentes (`src/lib/`, `src/components/`, `src/app/`). Sem reorganização de diretórios.

## Complexity Tracking

> Sem violações constitucionais a justificar.

Risco mais alto: regressão visual em rotas autenticadas (header sem `<SyncBadge>` e sem `<ArchivedRecordsBanner>`). Mitigação: smoke test em todas as 6 rotas autenticadas pós-deploy; cenários no [quickstart.md](./quickstart.md) cobrem cada uma.
