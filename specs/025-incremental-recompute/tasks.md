# Tasks: Recompute incremental + dedups remanescentes em /disco/[id] (Inc 27)

**Input**: Design documents from `specs/025-incremental-recompute/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓ (N/A), contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso

**Modo de implementação**: cuidadoso — cada Server Action exige decisão explícita de qual delta aplicar. Felipe pode estar offline; speckit autossuficiente.

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir `specs/025-incremental-recompute/` + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão. Branch `025-incremental-recompute` ativa.

## Phase 2: Foundational (helpers + tipos antes de cada Server Action ser tocada)

- [X] T002 Estender tipo `CurrentUser` em [src/lib/auth.ts](../../src/lib/auth.ts) adicionando campos `aiProvider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'qwen' | null` e `aiModel: string | null`. Atualizar mapper `toCurrentUser(u)` pra incluir esses campos vindos de `u.aiProvider`/`u.aiModel`. **NÃO incluir** `aiApiKeyEncrypted` no objeto cached (princípio menor exposição). Build local pra confirmar tipo.

- [X] T003 Adicionar 4 helpers novos + 1 wrapper em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts) conforme [contracts/facets-delta-helper.md](./contracts/facets-delta-helper.md):
  - `applyRecordStatusDelta(userId, prev, next)` — UPDATE expressão atômica nos 3 counters de status; no-op se prev===next.
  - `applyTrackSelectedDelta(userId, delta: -1|+1)` — UPDATE expressão atômica em `tracks_selected_total` com `MAX(0, ...)` defensivo.
  - `recomputeShelvesOnly(userId)` — SELECT DISTINCT shelf_location + UPDATE shelves_json.
  - `recomputeVocabularyOnly(userId, kind: 'moods'|'contexts')` — SELECT JOIN tracks + json_each + GROUP BY ORDER BY count + UPDATE moods_json/contexts_json.
  - `applyDeltaForWrite(userId, scope: DeltaScope)` — wrapper que despacha em `Promise.all` baseado no scope; try/catch defensivo logando `[applyDelta] erro pós-write`.

  Manter `recomputeFacets(userId)` exportado como fallback (não deletar). Adicionar comentários no header do arquivo explicando padrão de uso (delta vs completo).

- [X] T004 Auditar `revalidatePath` em [src/lib/actions.ts](../../src/lib/actions.ts) e [src/lib/discogs/](../../src/lib/discogs/). Comando: `grep -rn "revalidatePath" src/lib/`. Listar paths que apontam pra rotas inexistentes (ex: `/curadoria` deletada no Inc 26 — confirmar que sumiu). Output esperado: zero paths obsoletos. Se houver, marcar pra remoção em T015.

## Phase 3: User Story 1 — Curadoria com baixo consumo de reads (P1)

**Goal**: substituir `await recomputeFacets(user.id)` síncrono por delta direcionado em cada Server Action de write. Edições sem impacto em facets pulam delta completamente.

**Independent test**: cenários 1-7 do quickstart — edição de BPM gera 0 queries de delta; toggle status gera 1 UPDATE; curadoria de 30 edições gera ≤ 1k rows lidas.

- [X] T005 [US1] Refatorar `updateRecordStatus` em [src/lib/actions.ts](../../src/lib/actions.ts) (linha ~602):
  - Antes do UPDATE, fazer SELECT do status atual: `const [prev] = await db.select({ status: records.status }).from(records).where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id))).limit(1);`. Se `prev` ausente → retornar erro "Disco não encontrado." (já fazia).
  - UPDATE com `returning { id }` (já fazia).
  - Substituir `await recomputeFacets(user.id)` por:
    ```ts
    if (prev.status !== parsed.data.status) {
      try {
        await applyRecordStatusDelta(user.id, prev.status, parsed.data.status);
      } catch (err) {
        console.error('[applyDelta] erro pós-write (updateRecordStatus):', err);
      }
    }
    ```
  - Importar `applyRecordStatusDelta` em vez de `recomputeFacets`.

- [X] T006 [US1] Refatorar `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts) (linha ~661):
  - Antes do UPDATE, carregar estado atual da track relevante: `const [prev] = await db.select({ selected: tracksTable.selected, moods: tracksTable.moods, contexts: tracksTable.contexts }).from(tracksTable).where(eq(tracksTable.id, parsed.data.trackId)).limit(1);`. Combina com ownership check existente (substitui ou adiciona campos).
  - Helper de comparação por conjunto (não por ordem) — evitar disparar recompute caro quando DJ envia mesma lista em ordem diferente:
    ```ts
    function setEquals(a: readonly string[] | null, b: readonly string[] | null): boolean {
      const aa = a ?? [];
      const bb = b ?? [];
      if (aa.length !== bb.length) return false;
      const sortedA = [...aa].sort();
      const sortedB = [...bb].sort();
      return sortedA.every((v, i) => v === sortedB[i]);
    }
    ```
    Definir como function-local em `updateTrackCuration` (não exportar — uso isolado).
  - Detectar mudanças efetivas usando o helper acima:
    ```ts
    const selectedChanged =
      parsed.data.selected !== undefined &&
      parsed.data.selected !== prev.selected;
    const moodsChanged =
      parsed.data.moods !== undefined &&
      !setEquals(prev.moods ?? [], payload.moods ?? []);
    const contextsChanged =
      parsed.data.contexts !== undefined &&
      !setEquals(prev.contexts ?? [], payload.contexts ?? []);
    ```
    Notas: (a) `parsed.data.X !== undefined` já garante que o campo veio no input (substitui o `'X' in input` confuso); (b) `payload.moods`/`payload.contexts` já contém a versão normalizada (trim + dedup) que será gravada; (c) `setEquals` é simétrico e independente de ordem.
  - Substituir `await recomputeFacets(user.id)` por:
    ```ts
    try {
      await applyDeltaForWrite(user.id, {
        trackSelected: selectedChanged
          ? { delta: parsed.data.selected ? 1 : -1 }
          : undefined,
        moods: moodsChanged,
        contexts: contextsChanged,
      });
    } catch (err) {
      console.error('[applyDelta] erro pós-write (updateTrackCuration):', err);
    }
    ```
  - Edições em BPM/key/energy/comment/rating/aiAnalysis/fineGenre/references/isBomb/audioFeaturesSource resultam em todos os flags `false`/`undefined` → scope vazio → `applyDeltaForWrite` é no-op (zero queries de delta).

- [X] T007 [US1] Refatorar `updateRecordAuthorFields` em [src/lib/actions.ts](../../src/lib/actions.ts) (linha ~789):
  - Antes do UPDATE, carregar `shelfLocation` atual:
    ```ts
    const [prev] = await db.select({ shelfLocation: records.shelfLocation }).from(records)
      .where(and(eq(records.id, parsed.data.recordId), eq(records.userId, user.id))).limit(1);
    ```
  - Detectar mudança efetiva:
    ```ts
    const shelfChanged =
      'shelfLocation' in input && parsed.data.shelfLocation !== undefined &&
      parsed.data.shelfLocation !== prev?.shelfLocation;
    ```
  - Substituir `await recomputeFacets(user.id)` por:
    ```ts
    if (shelfChanged) {
      try {
        await recomputeShelvesOnly(user.id);
      } catch (err) {
        console.error('[applyDelta] erro pós-write (updateRecordAuthorFields):', err);
      }
    }
    ```
  - Edição apenas de `notes` resulta em `shelfChanged === false` → zero queries de delta.

- [X] T008 [US1] Remover `await recomputeFacets(user.id)` de `acknowledgeArchivedRecord` em [src/lib/actions.ts](../../src/lib/actions.ts) (~linha 1611). `archived_acknowledged_at` não é materializado em facets → skip total. Manter try/catch removido + adicionar comentário "// Inc 27: skip recompute — campo não materializado em user_facets".

- [X] T009 [US1] Remover `await recomputeFacets(user.id)` de `acknowledgeAllArchived` em [src/lib/actions.ts](../../src/lib/actions.ts) (~linha 1671). Mesma justificativa de T008.

- [X] T010 [US1] Verificar imports em `src/lib/actions.ts`: substituir `import { ..., recomputeFacets } from '@/lib/queries/user-facets';` por `import { ..., applyRecordStatusDelta, applyTrackSelectedDelta, recomputeShelvesOnly, applyDeltaForWrite } from '@/lib/queries/user-facets';`. Remover `recomputeFacets` se não for mais usado em actions.ts (continua usado em `sync.ts`/`import.ts`/cron). Build local pra detectar imports órfãos.

## Phase 4: User Story 2 — Página `/disco/[id]` com queries deduplicadas (P2)

**Goal**: derivar `aiProvider`/`aiModel` do `CurrentUser` cached em vez de query separada.

**Independent test**: cenário 8 do quickstart — load `/disco/[id]` mostra `select users` com `ai_provider`/`ai_model` no SELECT, **zero** ocorrências de `select "ai_provider", "ai_model" from users`.

- [X] T011 [US2] Refatorar `getUserAIConfigStatus` em [src/lib/actions.ts](../../src/lib/actions.ts) (procurar a função; ela hoje faz SELECT separado). Substituir corpo por:
  ```ts
  export async function getUserAIConfigStatus(): Promise<{ configured: boolean; provider: string | null; model: string | null }> {
    const user = await requireCurrentUser(); // cached via react.cache (Inc 26)
    return {
      configured: user.aiProvider !== null && user.aiModel !== null,
      provider: user.aiProvider,
      model: user.aiModel,
    };
  }
  ```
  Zero queries SQL adicionais — derivado do user cached.

- [X] T012 [US2] Confirmar que `enrichTrackComment`/`analyzeTrackWithAI`/`suggestSetTracks` (que precisam da chave criptografada) continuam fazendo SELECT dedicado pra `aiApiKeyEncrypted` — **NÃO** trazer chave pro `CurrentUser` cached. Grep `grep -n "aiApiKeyEncrypted" src/lib/`. Verificar que apenas funções de execução IA leem essa coluna.

- [X] T013 [US2] Verificar que `/disco/[id]/page.tsx` em [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx) consome `getUserAIConfigStatus` ou similar. Se chamar `requireCurrentUser` direto e ler `user.aiProvider`/`user.aiModel`, ainda melhor. Confirmar que não há mais SELECT separado pra ai config no caminho do disco.

## Phase 5: User Story 3 — Drift residual auto-corrigido por cron (P2)

**Goal**: cron diário existente em `/api/cron/sync-daily` ganha `recomputeFacets(userId)` por user no fim, corrigindo drift residual em ≤ 24h.

**Independent test**: cenário 10 do quickstart — adulterar manualmente `records_active` em prod via Turso shell, disparar cron via curl, verificar que valor voltou ao real.

- [X] T014 [US3] Adicionar drift correction em [src/app/api/cron/sync-daily/route.ts](../../src/app/api/cron/sync-daily/route.ts):
  - Importar `recomputeFacets` de `@/lib/queries/user-facets`.
  - Após o loop de `runDailyAutoSync(userId)` existente (mas antes do `return NextResponse.json(...)`), adicionar:
    ```ts
    let driftCorrected = 0;
    for (const u of allUsers) {
      try {
        await recomputeFacets(u.id);
        driftCorrected += 1;
      } catch (err) {
        console.error(`[cron] recomputeFacets falhou pra user ${u.id}:`, err);
      }
    }
    console.log(`[cron sync-daily] drift correction: ${driftCorrected}/${allUsers.length} users recomputed`);
    ```
  - Incluir `drift_corrected: driftCorrected` no response JSON do cron.
  - **Reusar** `allUsers` já carregado (Inc 26 trouxe esse SELECT pra zombie cleanup) — zero queries adicionais pra carregar lista.

## Phase 6: Polish — cleanup + build + deploy + smoke

- [X] T015 Aplicar removals/limpezas detectadas em T004. Se algum `revalidatePath('/curadoria')` ainda existir em código, remover. Confirmar via re-grep.

- [X] T016 Build local: `npm run build`. Confirmar zero erros TypeScript (especialmente nos novos helpers + novos campos de `CurrentUser` + novas chamadas de delta). Atenção a tipos de `'unrated' | 'active' | 'discarded'` em `applyRecordStatusDelta`.

- [X] T017 Verificar grep final em src/lib/:
  - `grep -rn "recomputeFacets" src/lib/` — deve aparecer apenas em: `user-facets.ts` (definição), `discogs/sync.ts` (mantém uso completo), `discogs/import.ts` (mantém uso completo), e `app/api/cron/sync-daily/route.ts` (drift correction).
  - **Não deve aparecer** em `actions.ts` (todas as chamadas substituídas por deltas).
  - Se aparecer em algum Server Action de actions.ts, voltar à task correspondente.

- [X] T018 Commit em branch `025-incremental-recompute` com mensagem `feat(025): recompute incremental + dedups remanescentes (Inc 27)`. Push branch.

- [X] T019 Merge `025-incremental-recompute` → `main` com `--no-ff`. Push main.

- [X] T020 Deploy prod manual (auto-deploy quebrado historicamente):
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready (~1min). Conferir via `vercel ls sulco --yes | head -3`.

- [X] T021 Smoke test pós-deploy: rodar cenários 1, 2, 3, 4, 5, 6, 8, 11 do [quickstart.md](./quickstart.md). Coletar output de `vercel logs sulco.vercel.app --follow` durante cada cenário; colar resultado consolidado. Confirmar:
  - Cenário 1 (BPM only): zero queries de scan ou recompute. **Sub-step pra SC-003**: anotar Vercel Function Duration desse Server Action no dashboard de Functions; esperado ≤200ms warm.
  - Cenário 2 (status): exatamente 1 UPDATE em `user_facets` (counters).
  - Cenário 3 (selected): exatamente 1 UPDATE em `user_facets` (tracks_selected_total).
  - Cenário 4 (moods): 1 SELECT JOIN moods + 1 UPDATE moods_json. **Confirmar A1**: enviar mesma lista de moods em ordem diferente NÃO dispara o recompute (`setEquals` em ação) — anotar nos logs que NENHUMA query de scan moods aparece.
  - Cenário 5 (shelf): 1 SELECT DISTINCT shelf_location + 1 UPDATE shelves_json.
  - Cenário 6 (notes): zero queries de delta.
  - Cenário 8 (load disco): zero `select "ai_provider", "ai_model" from users` separadamente. **Sub-step pra SC-008**: aguardar 5+ minutos sem nenhum acesso a `sulco.vercel.app` (Lambda fria), então fazer 1 hard refresh em `/disco/[id]`. No Vercel dashboard → Logs → clicar no request → ler "Function Duration". Esperado: ≤800ms (matem a SLA pós-Inc 26).
  - Cenário 11 (smoke): nenhum erro 500 em /, /disco/[id], /sets/[id]/montar, /status.

- [ ] T022 Smoke test cron (cenário 10 do quickstart): adulterar `records_active` via turso shell, disparar cron via `curl`, verificar correção. Conferir log do cron mostra `drift correction: N/N users recomputed`.

- [X] T023 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **025** — Recompute incremental + dedups remanescentes (Inc 27) · 2026-05-02 · specs/025-incremental-recompute/ · ...` com sumário (delta updates substituem recompute completo em writes; ~480 → ~30 queries por curadoria; -99% rows lidas; aiProvider/aiModel em CurrentUser cached; cron diário corrige drift). Atualizar entrada Inc 25 do BACKLOG indicando que parte foi absorvida (recompute em background via unstable_after foi substituído por delta direcionado — caminho diferente, mais agressivo).

## Dependencies

- **Phase 2 (T002, T003, T004)** ANTES de Phases 3-5 (helpers + tipos disponíveis pra Server Actions).
- **T005, T006, T007** independentes entre si (arquivos diferentes ou seções diferentes do mesmo arquivo). Podem ser sequenciais (todos modificam actions.ts).
- **T008, T009** independentes do resto da Phase 3 (apenas remoção de chamadas).
- **T010** depende de T005-T009 (limpa imports após todas as substituições).
- **Phase 4 (T011-T013)** independente de Phase 3 — pode rodar em paralelo, mas todos modificam actions.ts ou áreas próximas. Sequencial é mais simples.
- **Phase 5 (T014)** independente — modifica cron, isolado.
- **T016 (build)** depende de T002, T003, T005-T014 completos.
- **T017 (grep final)** depende de T010 (limpeza de imports).
- **T018 (commit)** depende de T016 + T017 verdes.
- **T020 (deploy)** depende de T019 (merge) + push.
- **T021/T022 (smoke)** depende de T020 (deploy ativo).
- **T023 (BACKLOG)** independe de smoke; pode rodar em paralelo.

## Parallelization examples

Tasks `[P]` (independentes):

- T002 [P] — auth.ts (CurrentUser type)
- T003 [P] — user-facets.ts (helpers novos)
- T004 [P] — auditoria revalidatePath

Sequenciais (mesmo arquivo: actions.ts):

- T005 → T006 → T007 → T008 → T009 → T010 (cadeia em actions.ts)
- T011 → T012 → T013 (cadeia em actions.ts/disco page)

## MVP Scope (sugerido)

**MVP = US1 (Phase 3 inteira, T005-T010)** — ataca o gargalo principal (~99% das reads de write). Deploy isolado já entrega ganho gigantesco.

US2 (Phase 4) é micro-otimização (1 query/render economizada) — vale, mas não bloqueia MVP.

US3 (Phase 5) é defensivo (corrige drift) — pode rodar 1 dia depois do MVP. Sem ele, drift acumula mas não quebra app.

Recomendo shipar tudo num único release (~3-4h) dado complementaridade. Mas se preferir incremental:
- v1: US1 (T005-T010 + T016-T020) — ~2h
- v2: US2 + US3 (T011-T014 + smoke) — ~1.5h

## Implementation strategy

Sequência ótima de execução:

1. **T001** — confirmar status (instantâneo)
2. **T002** — auth.ts CurrentUser fields (10min)
3. **T003** — user-facets.ts helpers novos (30min — a parte mais densa)
4. **T004** — auditoria revalidatePath (5min)
5. **T005** — updateRecordStatus delta (15min)
6. **T006** — updateTrackCuration delta (20min — mais lógica condicional)
7. **T007** — updateRecordAuthorFields delta (10min)
8. **T008** — acknowledgeArchivedRecord skip (3min)
9. **T009** — acknowledgeAllArchived skip (3min)
10. **T010** — limpar imports actions.ts (5min)
11. **T011** — getUserAIConfigStatus refactor (5min)
12. **T012** — confirmar aiApiKeyEncrypted ainda separado (3min)
13. **T013** — confirmar disco page consumindo cached (5min)
14. **T014** — drift correction no cron (10min)
15. **T015** — aplicar limpeza T004 (5min)
16. **T016** — build local (3min)
17. **T017** — grep final (3min)
18. **T018** — commit (2min)
19. **T019** — merge main + push (5min)
20. **T020** — deploy prod manual (3min + 1min wait)
21. **T021** — smoke test prod (15min — múltiplos cenários)
22. **T022** — smoke cron (5min)
23. **T023** — BACKLOG entry (10min)

**Total estimado: ~3h**.

Após T021/T022 OK, instrumentação `[DB]` continua ligada pra futuras investigações. Pode desligar via `DB_DEBUG=0` quando preferir.
