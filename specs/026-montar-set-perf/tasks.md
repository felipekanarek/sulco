# Tasks: Otimização do fluxo de montar set (Inc 28)

**Input**: Design documents from `specs/026-montar-set-perf/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓ (N/A), contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso

**Modo de implementação**: cuidadoso. Frente C primeiro (maior ROI), depois B (quick win), depois A (debounce — mais delicado), depois D (Server Action cleanup). Felipe pode estar offline; speckit autossuficiente.

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir `specs/026-montar-set-perf/` + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão. Branch `026-montar-set-perf` ativa.

## Phase 2: Foundational (auditorias)

- [X] T002 Localizar e auditar callers de `listSelectedVocab` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts). Comando: `grep -rn "listSelectedVocab" src/`. Output esperado: callers em `/sets/[id]/montar/page.tsx` e possivelmente em outros componentes do montar. Listar pra confirmar que mudança da implementação interna não afeta assinatura externa.

- [X] T003 Localizar callers de `getUserAIConfigStatus` em [src/lib/ai/index.ts](../../src/lib/ai/index.ts). Comando: `grep -rn "getUserAIConfigStatus" src/`. Esperado: pelo menos `/sets/[id]/montar/page.tsx`. Confirmar se restam callers fora desse path antes de remover import.

## Phase 3: User Story 1 — Filtros sem queimar reads (P1)

**Goal**: load do montar usa cache materializado pra vocab; toggles em sequência rápida são debounced.

**Independent test**: cenários 1, 2, 3, 4, 5 do quickstart — load com ≤ 5 queries, sequência de 5 toggles ≤ 2 persists, flush on unmount.

### Frente C — listSelectedVocab via facets

- [X] T004 [US1] Refatorar `listSelectedVocab(userId, kind)` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts):
  - Importar `getUserFacets` de `@/lib/queries/user-facets` (cached via Inc 24/26).
  - Substituir o corpo da função por:
    ```ts
    export async function listSelectedVocab(
      userId: number,
      kind: 'moods' | 'contexts',
    ): Promise<string[]> {
      const facets = await getUserFacets(userId);
      return kind === 'moods' ? facets.moods : facets.contexts;
    }
    ```
  - Manter assinatura externa idêntica. Callers (de T002) não mudam.
  - Remover imports não usados após refator (ex: `tracks`, `records`, `sql`, `json_each` se ficarem órfãos).
  - Build local `npm run build` pra confirmar zero erros.

### Frente B — aiConfigured via user cached (note: cobre US3 — Inc 27 leftover)

- [X] T005 [US3] Refatorar [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx):
  - Substituir chamada `await getUserAIConfigStatus(user.id)` por derivação direta:
    ```ts
    const aiConfigured = user.aiProvider !== null && user.aiModel !== null;
    ```
  - Se a chamada estava num `Promise.all([...])`, removê-la do array (não chamar mais a Server Action).
  - Atualizar locais que usavam `aiConfigStatus.configured` ou `aiConfigStatus.provider` pra usar `aiConfigured` ou `user.aiProvider`/`user.aiModel`.
  - Remover import `getUserAIConfigStatus` do topo do arquivo.
  - Comentário inline: `// Inc 28: aiConfigured derivado do user cached (Inc 27 trouxe aiProvider/aiModel pro requireCurrentUser).`
  - Verificar se não há outros callers de `getUserAIConfigStatus` em `/sets/[id]/montar` (T003 já confirmou).

### Frente A — Debounce + flush em MontarFilters

- [X] T006 [US1] Implementar debounce em [src/components/montar-filters.tsx](../../src/components/montar-filters.tsx) seguindo o contrato de [contracts/filters-debounce-contract.md](./contracts/filters-debounce-contract.md):
  - Adicionar imports: `import { useRef, useEffect, useTransition } from 'react';` (ajustar imports já existentes).
  - Adicionar constante: `const DEBOUNCE_MS = 500;` no topo do arquivo (após imports).
  - Dentro do componente, antes do return:
    ```ts
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<FiltersState | null>(null);
    const [isPending, startTransition] = useTransition(); // se já não existir
    ```
    Reusar `useTransition` se já estiver no componente.
  - Criar função local `scheduleFlush(filters: FiltersState)`:
    ```ts
    function scheduleFlush(filters: FiltersState) {
      pendingRef.current = filters;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const toFlush = pendingRef.current;
        if (toFlush) {
          startTransition(() => {
            persistMontarFilters(setId, toFlush).catch((err) => {
              console.error('[debounce] persistMontarFilters falhou:', err);
            });
          });
          pendingRef.current = null;
        }
        timerRef.current = null;
      }, DEBOUNCE_MS);
    }
    ```
    `FiltersState` é o tipo já existente do componente (verificar nome exato no arquivo atual).
  - Substituir TODAS as chamadas atuais a `persistMontarFilters(setId, ...)` no componente por `scheduleFlush(...)` com o mesmo argumento de filters.
  - Adicionar `useEffect` cleanup pra flush on unmount:
    ```ts
    useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          const toFlush = pendingRef.current;
          if (toFlush) {
            persistMontarFilters(setId, toFlush).catch(() => {});
          }
          timerRef.current = null;
          pendingRef.current = null;
        }
      };
    }, [setId]);
    ```
  - Garantir que UI continua atualizando candidatos imediatamente (state client + URL replace) — debounce afeta APENAS a chamada `persistMontarFilters`.

- [X] T007 [US1] Investigar e eliminar duplo-fire de `persistMontarFilters` se existir em [src/components/montar-filters.tsx](../../src/components/montar-filters.tsx):
  - Logs em prod mostraram 2 POSTs em sequência em alguns toggles.
  - Causas comuns: `useEffect` com deps mal configurados que dispara 2× (ex: deps incluindo objeto recriado), `onChange` sendo chamado em `onClick` + handler nativo, dupla referência ao `persistMontarFilters` em diferentes hooks.
  - Auditar visualmente o código atual do componente. Documentar causa raiz no commit. Eliminar.
  - Pós T006 + T007: 1 toggle → 1 schedule → 1 flush após 500ms.
  - **Critério de sucesso**: cenário 2 do [quickstart.md](./quickstart.md) passa em prod (sequência rápida de 5 toggles → ≤ 2 POSTs `update sets`). Se cenário 2 falhar com >2 POSTs, T007 não está completa.

## Phase 4: User Story 2 — Adicionar candidato com custo mínimo (P2)

**Goal**: `addTrackToSet` faz 4 SELECTs (era 5) + 1 INSERT.

**Independent test**: cenário 6 do quickstart — adicionar candidato gera ≤ 4 SELECTs + 1 INSERT.

### Frente D — Combinar COUNT + MAX em 1 SELECT

- [X] T008 [US2] Refatorar `addTrackToSet` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Localizar a função: `grep -n "export async function addTrackToSet" src/lib/actions.ts`.
  - Substituir os 2 SELECTs separados (1 `SELECT COUNT(*)` + 1 `SELECT COALESCE(MAX(order), -1)`) por 1 SELECT combinado:
    ```ts
    const [stats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        maxOrder: sql<number>`COALESCE(MAX("order"), -1)`,
      })
      .from(setTracks)
      .where(eq(setTracks.setId, parsed.data.setId));
    const total = Number(stats?.total ?? 0);
    const maxOrder = Number(stats?.maxOrder ?? -1);
    ```
  - Atualizar o resto da função pra usar `total` e `maxOrder` em vez das 2 vars que vinham dos 2 SELECTs.
  - Manter `INSERT ... ON CONFLICT DO NOTHING` intacto.
  - Comentário inline: `// Inc 28: Frente D — COUNT + MAX combinados em 1 SELECT.`
  - Build local pra confirmar tipos.

- [X] T009 [US2] Confirmar via grep que mensagem de "já está no set" continua clara (FR-008):
  - Lógica esperada: se `INSERT ... RETURNING { id }` retorna 0 rows ou se `total` antes do insert já incluía o trackId (verificar query de detecção atual), retornar `{ ok: false, error: 'Faixa já está no set.' }` ou flag similar.
  - Não regredir — manter comportamento atual de UI clara.

## Phase 5: Polish — build + grep + deploy + smoke

- [X] T010 Build local: `npm run build`. Confirmar zero erros TypeScript em todos os arquivos modificados (auth.ts não muda; user-facets.ts não muda; montar.ts, page.tsx, montar-filters.tsx, actions.ts modificados).

- [X] T011 Verificar grep final:
  - `grep -rn "listSelectedVocab" src/` — implementação interna mudou; callers permanecem.
  - `grep -rn "getUserAIConfigStatus" src/sets/` — esperado 0 ocorrências em `/sets/[id]/montar/page.tsx` (mas pode ter callers em outros lugares — `/disco/[id]/page.tsx` foi migrado no Inc 27, talvez ainda esteja em outro arquivo; OK).
  - `grep -rn "select DISTINCT value FROM tracks" src/` — esperado: zero em src; só em logs históricos ou docs.
  - **Verificar princípio de menor exposição (FR-006)**: `grep -rn "aiApiKeyEncrypted" src/` — esperado: aparecer apenas em (a) `src/lib/ai/index.ts` (`getUserAIConfig` que decifra pra chamar provider), (b) `src/lib/actions.ts` em `saveAIConfig` (write da chave), (c) `src/lib/auth.ts` apenas em comentário "INTENCIONALMENTE FORA". **Não deve aparecer** em `auth.ts:toCurrentUser` retorno, nem em `/sets/[id]/montar/page.tsx`, nem em outros consumidores genéricos.
  - Verificar visualmente o componente `<MontarFilters>`: helper `scheduleFlush` presente, `useEffect` cleanup presente, callsite de `persistMontarFilters` substituído.

- [X] - [ ] T012 Commit em branch `026-montar-set-perf` com mensagem `feat(026): otimização do fluxo de montar set (Inc 28)`. Push branch.

- [X] - [ ] T013 Merge `026-montar-set-perf` → `main` com `--no-ff`. Push main.

- [X] - [ ] T014 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready (~1min). Confirmar via `vercel ls sulco --yes | head -3` que novo deploy aparece como Production.

- [X] - [ ] T015 Smoke test pós-deploy: rodar cenários 1, 2, 4, 6, 8, 9 do [quickstart.md](./quickstart.md). Coletar output de `vercel logs sulco.vercel.app --follow > /tmp/inc28.log 2>&1 &` durante cada cenário.
  - Cenário 1 (load montar): ≤ 5 queries, ZERO `select DISTINCT value FROM tracks`, ZERO `select "ai_provider", "ai_model"` separado.
  - Cenário 2 (debounce sequência): ≤ 2 POSTs `update sets`.
  - Cenário 4 (flush on unmount): 1 POST disparado mesmo com nav rápida.
  - Cenário 6 (addTrack): 1 SELECT combinado COUNT+MAX, não 2 separados.
  - Cenário 8 (curadoria total): delta ≤ 5k rows lidas no dashboard Turso.
  - Cenário 9 (smoke geral): zero erros 500/JS.

- [X] - [ ] T016 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **026** — Otimização do fluxo de montar set (Inc 28) · 2026-05-02 · specs/026-montar-set-perf/ · ...` com sumário (listSelectedVocab via facets cached; debounce 500ms + flush on unmount; aiProvider/aiModel via user cached Inc 27 leftover; COUNT+MAX combinado em addTrackToSet; ~600 → ~50 queries por set montado; ~1M → ~5k rows lidas; -99.5%).

## Dependencies

- **Phase 2 (T002, T003)** ANTES de Phase 3 (auditorias informam refator).
- **T004 (Frente C)** independe de T005 (Frente B), T006/T007 (Frente A) — arquivos diferentes.
- **T005 (Frente B)** independe de T004, T006/T007.
- **T006 (debounce)** ANTES de T007 (eliminar duplo-fire — pode estar em código que vai ser tocado em T006).
- **T008 (Frente D)** independe de US1 — podem rodar em paralelo se quiser.
- **T009 (verify mensagem)** depende de T008.
- **T010 (build)** depende de T004-T009 completos.
- **T011 (grep)** depende de T010.
- **T012-T014 (commit/push/deploy)** depende de T010 + T011 verdes.
- **T015 (smoke)** depende de T014 (deploy ativo).
- **T016 (BACKLOG)** independe de smoke; mas só commitar depois de T015 confirmar sucesso.

## Parallelization examples

Tasks `[P]` (independentes, arquivos diferentes):

- T004 [P] [US1] — montar.ts (Frente C)
- T005 [P] [US1] — page.tsx (Frente B)
- T006 [P] [US1] — montar-filters.tsx (Frente A)
- T008 [P] [US2] — actions.ts (Frente D)

Sequenciais:

- T002 → T003 → (Foundational pronto) → T004/T005/T006 em paralelo → T007 (depende de T006) → T008/T009 → T010 → T011 → T012-T015

## MVP Scope (sugerido)

**MVP = Frente C (T004) sozinha** entrega o ganho dominante (-20k rows/render). Pode shipar isolada se Felipe quiser fazer incremental:
- v1 (T004 + T010-T015 com smoke parcial): ~30min — ganho killer
- v2 (T005 + T006/T007 + T008 + smoke completo): ~1h — completa o pacote

Mas como esforço total é pequeno (~1.5-2h), recomendo shipar tudo num único release.

## Implementation strategy

Sequência ótima de execução:

1. **T001** — confirmar status (instantâneo)
2. **T002 + T003** — auditorias (5min total)
3. **T004 (Frente C)** — montar.ts refator listSelectedVocab (10min)
4. **T005 (Frente B)** — page.tsx aiConfigured derivation (5min)
5. **T006 (Frente A)** — montar-filters.tsx debounce + cleanup (30-40min — mais denso)
6. **T007 (Frente A)** — investigar duplo-fire (10min)
7. **T008 (Frente D)** — actions.ts addTrackToSet COUNT+MAX (10min)
8. **T009** — verify mensagem duplicado clara (5min)
9. **T010** — build local (3min)
10. **T011** — grep final (3min)
11. **T012** — commit (2min)
12. **T013** — merge main + push (5min)
13. **T014** — deploy prod manual (3min + 1min wait)
14. **T015** — smoke test prod (15min — múltiplos cenários)
15. **T016** — BACKLOG entry (5min)

**Total estimado: ~2h**.

Após T015 OK, instrumentação `[DB]` continua ligada pra futuras investigações. Pode desligar via `DB_DEBUG=0` quando preferir.
