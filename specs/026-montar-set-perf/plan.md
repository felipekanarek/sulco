# Implementation Plan: Otimização do fluxo de montar set

**Branch**: `026-montar-set-perf` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-montar-set-perf/spec.md`

## Summary

Reduzir custo de leituras em `/sets/[id]/montar` em ≥99% atacando 4 vetores: (C) `listSelectedVocab` em `src/lib/queries/montar.ts` deriva de `user_facets` (helper `getUserFacets` do Inc 24, cached via `react.cache` no Inc 26) em vez de scan de tracks; (A) debounce client-side de 500ms no `<MontarFilters>` antes de chamar `persistMontarFilters` Server Action; (B) `aiProvider`/`aiModel` na page derivam de `requireCurrentUser()` (Inc 27 leftover); (D) `addTrackToSet` em `src/lib/actions.ts` combina `COUNT + MAX(order)` em 1 SELECT.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node.js 20+
**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), Drizzle ORM (libsql dialect), React 19 (`cache()`, `useEffect`/`useRef` para debounce client)
**Storage**: Turso (libsql) prod; SQLite local dev; `users`, `sets`, `setTracks`, `tracks`, `records`, `userFacets` — **sem schema delta**
**Testing**: Validação manual via [quickstart.md](./quickstart.md); medição via instrumentação `[DB]` em logs Vercel
**Target Platform**: Vercel Hobby (Lambda nodejs24.x, region gru1/iad1), browsers modernos
**Project Type**: web (Next.js App Router single-app)
**Performance Goals**: ≤5 queries/load montar (vs ~7); ≤2 persist em 5 toggles rápidos (vs ~10); ≤4 queries/add (vs ~6); ≤5k rows/curadoria (vs ~1M)
**Constraints**: zero gasto (Vercel Hobby), zero schema delta, reversível por revert, debounce não pode introduzir latência percebida (UI atualiza imediato via state client)
**Scale/Scope**: ~5 arquivos modificados; refator localizado em camadas existentes; nenhuma reorganização

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I — Soberania dos Dados do DJ**: ✅ feature toca apenas zona SYS (`user_facets`, `sets.montar_filters_json`). Campos AUTHOR (`tracks.moods`, `tracks.contexts`, etc.) seguem fluxo normal de write via Server Actions existentes. Vocabulário derivado de cache materializado SYS — DJ continua dono dos dados.
- **II — Server-First por Padrão**: ✅ tudo continua RSC + Server Actions. Debounce é client-side dentro de componente que **já é client** (`<MontarFilters>` em [src/components/montar-filters.tsx](../../src/components/montar-filters.tsx)). Sem novos client components, sem novas API routes.
- **III — Schema é a Fonte da Verdade**: ✅ zero schema delta. `userFacets`, `sets.montarFiltersJson` já existem.
- **IV — Preservar (Soft-Delete)**: ✅ nada é deletado. `recomputeFacets` permanece como fallback. Filtros ainda persistidos em DB (apenas debounced). Drift de vocabulário corrigido por cron noturno (Inc 27).
- **V — Mobile-Native por Padrão**: ✅ ganho direto de UX mobile: debounce evita queimar bateria/dados em rede 3G; renderizações mais leves = scroll mais fluido em viewport pequena.

**Resultado**: passa em todos os princípios.

## Project Structure

### Documentation (this feature)

```text
specs/026-montar-set-perf/
├── plan.md                          # Este arquivo
├── research.md                      # Phase 0 — decisões + alternativas
├── data-model.md                    # Phase 1 — N/A (zero entities novos)
├── quickstart.md                    # Phase 1 — validação manual
├── contracts/
│   └── filters-debounce-contract.md # Phase 1 — contrato do debounce + flush
└── checklists/
    └── requirements.md              # Já criado em /speckit.specify
```

### Source Code (repository root)

Mudanças confinadas a estes arquivos:

```text
src/
├── lib/
│   ├── queries/
│   │   └── montar.ts                # MOD (Frente C): listSelectedVocab deriva de getUserFacets
│   └── actions.ts                   # MOD (Frente D): addTrackToSet combina COUNT+MAX em 1 SELECT
├── components/
│   └── montar-filters.tsx           # MOD (Frente A): debounce 500ms + flush on unmount
└── app/
    └── sets/[id]/montar/page.tsx    # MOD (Frente B): aiConfigured deriva de user.aiProvider/aiModel cached
```

**Helpers já existentes** (sem mudança, apenas consumidos):

- `getUserFacets(userId)` — [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts) (Inc 24, cached Inc 26)
- `requireCurrentUser()` — [src/lib/auth.ts](../../src/lib/auth.ts) (Inc 26 cached, Inc 27 ganhou aiProvider/aiModel)

**Frente A — debounce**: implementação dentro de `<MontarFilters>` usando `useRef<number | null>` pra timer + `useEffect` cleanup pra flush. Função `flush()` invoca `persistMontarFilters` imediato com último estado pendente. Trigger de flush: (a) timer expira, (b) componente desmonta (rota mudou), (c) usuário fecha tab/refresh (via `beforeunload`? — opcional, decidir no research).

**Frente C — `listSelectedVocab`**: refatorar pra:
```ts
export async function listSelectedVocab(userId: number, kind: 'moods' | 'contexts'): Promise<string[]> {
  const facets = await getUserFacets(userId);
  return kind === 'moods' ? facets.moods : facets.contexts;
}
```
Mantém assinatura externa idêntica. Callers não mudam.

**Frente B — page.tsx**: substituir `getUserAIConfigStatus(user.id)` (de `@/lib/ai`) por derivação direta:
```ts
const aiConfigured = user.aiProvider !== null && user.aiModel !== null;
```
Eliminar import se não houver outros callers em `/sets/[id]/montar`.

**Frente D — `addTrackToSet`**: substituir 2 SELECTs separados por 1:
```ts
const [stats] = await db
  .select({
    total: sql<number>`COUNT(*)`,
    maxOrder: sql<number>`COALESCE(MAX("order"), -1)`,
  })
  .from(setTracks)
  .where(eq(setTracks.setId, parsed.data.setId));
```
Manter ownership checks (sets + tracks) — são checks de segurança, não otimizáveis sem afetar Princípio I.

**Structure Decision**: single-app Next.js App Router. Refator cirúrgico em 4 arquivos. Sem reorganização, sem novos diretórios.

## Complexity Tracking

> Sem violações constitucionais a justificar.

**Riscos identificados**:
- **Debounce + flush on unmount**: edge case de unmount durante render do Next pode perder o flush. Mitigação: ref-based pattern + cleanup em `useEffect`. Documentar no contracts/.
- **Drift de vocabulário materializado** (Frente C): se `user_facets.moodsJson` estiver desatualizado, DJ pode ver chip antigo no picker. Aceito por design — cron noturno corrige. Drift de até 24h é tolerável.
- **`addTrackToSet` race**: 2 cliques simultâneos no mesmo track → ambos lêem `maxOrder=N`, ambos tentam INSERT com order N+1. ON CONFLICT já protege contra duplicação na PK composta `(set_id, track_id)`. Order pode ficar com gap (sem mal). Aceito.
- **Multi-aba persistindo filtros diferentes**: eventual consistency aceito (último write vence). Não é dado crítico (preferência de UX).
