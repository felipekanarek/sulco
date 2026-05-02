# Tasks: Cortes UX agressivos + dedup de queries (Inc 26)

**Input**: Design documents from `specs/024-ux-cuts-dedup/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓ (N/A), contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso

**Modo de implementação**: emergencial (cota Turso). Lineares; foco em throughput; Felipe pode estar offline durante implementação.

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão.

## Phase 2: Foundational (pré-requisitos pra todas as US)

- [X] T002 Auditar callers de [src/lib/queries/curadoria.ts](../../src/lib/queries/curadoria.ts) e [src/components/curadoria-view.tsx](../../src/components/curadoria-view.tsx). Comando: `grep -rn "listCuradoriaIds\|curadoria-view\|CuradoriaView" src/`. Listar callers fora de `/curadoria/*` (se houver). Output esperado: zero callers externos.

- [X] T003 Auditar todos os `<Link>` em rotas autenticadas. Comando: `grep -rn "<Link" src/app src/components | grep -v "prefetch={false}"`. Listar arquivos:linhas que faltam `prefetch={false}`. Servirá de input pra T021.

## Phase 3: User Story 1 — Loads autenticados com baixo consumo (P1)

**Goal**: reduzir 17 → ≤6 queries por load `/`. Eliminar duplicações.

**Independent test**: cenário 1 do quickstart — hard refresh em `/` gera ≤6 linhas `[DB]` no log Vercel.

- [X] T004 [US1] Wrappar `getCurrentUser` e `requireCurrentUser` em [src/lib/auth.ts](../../src/lib/auth.ts) com `cache()` do React 19. Adicionar `import { cache } from 'react'` no topo. Substituir export `export async function getCurrentUser(...)` por `export const getCurrentUser = cache(async () => { ... })`. Mesmo pra `requireCurrentUser`. Manter assinatura externa idêntica. Build local pra confirmar tipo.

- [X] T005 [US1] Wrappar `getUserFacets` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts) com `cache()`. Adicionar `import { cache } from 'react'`. Mudar `export async function getUserFacets(userId: number)` para `export const getUserFacets = cache(async (userId: number) => { ... })`. Assinatura externa idêntica.

- [X] T006 [US1] Remover `<SyncBadge>` do layout em [src/app/layout.tsx](../../src/app/layout.tsx): apagar import `import { SyncBadge } from '@/components/sync-badge'` e a tag `<SyncBadge />` no header. Verificar nada mais referencia (`grep -rn "SyncBadge" src/`).

- [X] T007 [US1] Deletar arquivo [src/components/sync-badge.tsx](../../src/components/sync-badge.tsx).

- [X] T008 [US1] Em [src/lib/queries/status.ts](../../src/lib/queries/status.ts), deletar export `computeBadgeActive` + função interna `computeBadgeActiveRaw` (criadas no hotfix Inc 23). Confirmar via grep que sem callers externos. Manter `loadStatusSnapshot` intocado (ainda usado por `/status`).

- [X] T009 [US1] Remover `<ArchivedRecordsBanner>` do layout em [src/app/layout.tsx](../../src/app/layout.tsx): apagar import + tag.

- [X] T010 [US1] Deletar arquivo [src/components/archived-records-banner.tsx](../../src/components/archived-records-banner.tsx).

- [X] T011 [US1] Refatorar [src/app/page.tsx](../../src/app/page.tsx) (home) pra render condicional do `<ImportProgressCard>`. Criar nova função `getImportProgressLight()` em [src/lib/actions.ts](../../src/lib/actions.ts) com pseudocódigo:
  ```
  export async function getImportProgressLight(): Promise<{ shouldShow: false } | { shouldShow: true, progress: ImportProgress }> {
    const user = await requireCurrentUser(); // já cached via react.cache(); 0 reads novos no Promise.all do RSC
    const lastAck = user.importAcknowledgedAt; // disponível no objeto retornado por getCurrentUser
    const [latest] = await db.select({ outcome, startedAt, ... }).from(syncRuns)
      .where(eq(syncRuns.userId, user.id) AND eq(kind, 'initial_import'))
      .orderBy(desc(startedAt)).limit(1); // 1 SELECT
    const isRunning = latest?.outcome === 'running';
    const isUnacked = latest?.startedAt && (!lastAck || latest.startedAt > lastAck);
    if (!isRunning && !isUnacked) return { shouldShow: false }; // 99% dos loads pós-ack
    // Caminho cheio: chama getImportProgress completo pra preencher x/y/outcome
    const progress = await getImportProgress();
    return { shouldShow: true, progress };
  }
  ```
  Custo no caso comum (ack feito): 1 SELECT em `sync_runs` (vs ~3-4 atuais via `getImportProgress` completo). Caso edge (running/sem ack): mesmo custo de hoje. Em [src/app/page.tsx](../../src/app/page.tsx), substituir `getImportProgress()` no Promise.all por `getImportProgressLight()` e renderizar `<ImportProgressCard>` apenas se `result.shouldShow === true` passando `result.progress`. **Pré-requisito**: T004 (getCurrentUser cacheado) deve estar feito antes pra evitar SELECT users duplicado dentro de getImportProgressLight.

- [X] T012 [US1] Em [src/lib/actions.ts](../../src/lib/actions.ts), remover chamada `await killZombieSyncRuns(user.id, 'initial_import')` da função `getImportProgress()` (linha ~247). Adicionar comentário: "// Inc 26: zombie cleanup movido pra cron diário".

- [X] T013 [US1] Em [src/lib/queries/status.ts](../../src/lib/queries/status.ts), remover chamada `await killZombieSyncRuns(userId)` da função `loadStatusSnapshotRaw()` (linha ~62). Mesmo comentário.

- [X] T014 [US1] Adicionar chamada `killZombieSyncRuns` em [src/app/api/cron/sync-daily/route.ts](../../src/app/api/cron/sync-daily/route.ts) — antes do loop de sync, iterar todos os users e chamar `killZombieSyncRuns(userId)` (sem o argumento `kind` — limpar todos os tipos). Importar `killZombieSyncRuns` de `@/lib/discogs/zombie`.

## Phase 4: User Story 2 — Alertas via /status (P2)

**Goal**: garantir que info de archived/conflicts/runs continua acessível via menu → /status.

**Independent test**: cenário 4 do quickstart — entrar em `/status` mostra archived pendentes + runs.

- [X] T015 [US2] Smoke test local de `/status`: rodar `npm run dev`, autenticar, abrir `http://localhost:3000/status`. Confirmar visualmente que aparecem (a) lista de últimas execuções de sync (`runs`), (b) seção de archived pendentes se houver, (c) seção de conflicts se houver. Confirmar via `vercel logs` ou `console.log` local que `loadStatusSnapshot` continua sendo chamado e retornando dados. Diff do git deve mostrar zero mudanças em `src/app/status/page.tsx` e `src/lib/queries/status.ts` (exceto remoção de `killZombieSyncRuns` em T013 e `computeBadgeActive` em T008 que já não impactam `/status`).

- [X] T016 [US2] Confirmar que NavLink "Sync" → `/status` permanece visível em [src/app/layout.tsx](../../src/app/layout.tsx) (desktop nav) e em [src/components/mobile-nav.tsx](../../src/components/mobile-nav.tsx) (drawer mobile). Tap target ≥44×44 px (Princípio V).

## Phase 5: User Story 3 — Rota /curadoria deletada (P3)

**Goal**: rota morta removida; menu limpo; queries pesadas eliminadas.

**Independent test**: cenário 5 do quickstart — `/curadoria` retorna 404; menu não tem mais o item.

- [X] T017 [US3] Deletar diretório [src/app/curadoria/](../../src/app/curadoria/) inteiro (`rm -rf src/app/curadoria/`).

- [X] T018 [US3] Deletar [src/lib/queries/curadoria.ts](../../src/lib/queries/curadoria.ts) se T002 confirmou zero callers externos. Caso contrário, deletar apenas exports não-usados.

- [X] T019 [US3] Deletar [src/components/curadoria-view.tsx](../../src/components/curadoria-view.tsx) se T002 confirmou zero callers externos.

- [X] T020 [US3] Remover NavLink "Curadoria" em [src/app/layout.tsx](../../src/app/layout.tsx) (linha ~73 do desktop nav). Remover entrada correspondente em [src/components/mobile-nav.tsx](../../src/components/mobile-nav.tsx).

## Phase 6: Polish — Prefetch universal + Build + Deploy

- [X] T021 Adicionar `prefetch={false}` em todos os `<Link>` listados pelo T003 (em rotas autenticadas) que não tenham. Re-rodar grep pra confirmar lista vazia: `grep -rn "<Link" src/app src/components | grep -v "prefetch={false}" | grep -v "sign-in\|sign-up\|onboarding\|convite-fechado"`. Output esperado: zero linhas (excluindo rotas públicas).

- [X] T022 Build local: `npm run build`. Confirmar zero erros TypeScript + zero warnings novos. Verificar especialmente que `getCurrentUser` e `getUserFacets` mantêm tipos corretos pós-`cache()` wrap.

- [X] T023 Verificar grep final: `grep -rn "SyncBadge\|ArchivedRecordsBanner\|/curadoria\|computeBadgeActive\|listCuradoriaIds" src/` — output esperado: apenas referências em comentários históricos ou specs (zero em código de produção).

- [X] T024 Commit com mensagem `feat(024): cortes UX + dedup de queries (Inc 26)`. Push em main (depois de merge da branch `024-ux-cuts-dedup`).

- [X] T025 Validar deploy automático Vercel (se ainda quebrado, deploy manual via `vercel --prod --yes` + `vercel promote`).

- [X] T026 Smoke test pós-deploy: rodar cenários 1, 4, 5, 9 do [quickstart.md](./quickstart.md). Cola output de `vercel logs sulco.vercel.app --follow` durante load `/` em prod. **Sub-step pra SC-003 (cold start ≤600ms)**: aguardar 5+ minutos sem nenhum acesso a `sulco.vercel.app` (Lambda fria), então fazer 1 hard refresh em `/`. No Vercel dashboard → Logs → clicar no request → ler "Function Duration". Esperado: ≤600ms (vs ~1.2s pré-Inc 26).

- [ ] T027 Se Cenário 1 passar (queries ≤6/load), setar `DB_DEBUG=0` em Vercel env vars (Production environment) pra desligar instrumentação sem revert de código.

- [X] T028 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar `- **024** — Cortes UX agressivos + dedup de queries (Inc 26) · 2026-05-02 · specs/024-ux-cuts-dedup/ · ...` com sumário de queries economizadas e arquivos deletados. Atualizar entrada Inc 25 do BACKLOG removendo Fase A items absorvidos (A1 dedup getUserFacets feita aqui; A2 SyncBadge removido; A4 listCuradoriaIds deletado).

## Dependencies

- **Phase 2 (T002, T003)** ANTES de Phase 3-5 (auditoria de callers/links).
- **Phase 3 (US1)** independente de **Phase 4 (US2)** e **Phase 5 (US3)** — podem rodar em paralelo, mas como esforço é pequeno faz mais sentido sequencial.
- **Phase 4 (US2)** ANTES de Phase 5 (US3) tecnicamente pra evitar quebrar `/status` antes de validar — mas como ambos não se cruzam (US2 valida, US3 deleta), pode ser paralelo.
- **Phase 6 (Polish)** depende de Phases 3-5 completas.
- **T024 (commit/push)** depende de T022 (build) + T023 (grep) verdes.
- **T026 (smoke test)** depende de T025 (deploy efetivado).
- **T027 (DB_DEBUG=0)** depende de T026 passar.
- **T028 (BACKLOG)** pode rodar em paralelo com smoke test, mas só commitado depois de T027.

## Parallelization examples

Tasks marcáveis como `[P]` (independentes, arquivos diferentes):

- T004 [P] [US1] auth.ts cache wrap
- T005 [P] [US1] user-facets.ts cache wrap
- T007 [P] [US1] sync-badge.tsx delete
- T010 [P] [US1] archived-records-banner.tsx delete
- T017 [P] [US3] src/app/curadoria/ delete
- T018 [P] [US3] queries/curadoria.ts delete
- T019 [P] [US3] curadoria-view.tsx delete

Tasks sequenciais (mesmo arquivo ou ordem importa):

- T006 → T008 → T009 → T011 (todas modificam layout.tsx ou page.tsx em sequência)
- T012 → T013 → T014 (cadeia killZombieSyncRuns: remove de actions.ts, status.ts, adiciona em cron)
- T020 → T021 (mexe em layout + grep final)

## MVP Scope (sugerido)

**MVP = US1 (Phase 3 inteira)** — impacto mais alto (-12 queries/load).
US2 (Phase 4) é só validação — sem código novo.
US3 (Phase 5) é cleanup — barato, mas não bloqueia ganho de queries da US1.

Se Felipe quiser shipar em fases:
- v1 (4-5 commits): US1 → mede → ship
- v2 (1-2 commits): US3 → ship
- US2 sempre rodada como validação no smoke test

Mas como esforço total é pequeno (~1-2h), recomendo shipar tudo num único release.

## Implementation strategy

Sequência ótima de execução (sem paralelismo, throughput-first):

1. T002 + T003 (auditorias) — 5min
2. T004 + T005 (cache wraps) — 10min
3. T006 + T007 (SyncBadge fora) — 5min
4. T008 (computeBadgeActive deleta) — 3min
5. T009 + T010 (ArchivedBanner fora) — 5min
6. T011 (ImportProgressCard condicional) — 15min (mais complexo)
7. T012 + T013 + T014 (killZombie pra cron) — 10min
8. T015 + T016 (US2 validação) — 5min
9. T017 + T018 + T019 + T020 (curadoria deletada) — 10min
10. T021 (prefetch=false universal) — 10min
11. T022 + T023 (build + grep) — 5min
12. T024 + T025 (commit + deploy) — 10min (inclui aguardar deploy)
13. T026 (smoke test prod) — 10min
14. T027 (DB_DEBUG=0) — 2min
15. T028 (BACKLOG entry) — 5min

**Total: ~1h45min**.

Após T026 passar, instrumentação `[DB]` continua ligada pelo tempo que Felipe quiser usar pra futuras investigações (ex: medir antes/depois do Inc 25). Pode desligar via env var quando quiser.
