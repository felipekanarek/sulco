# Tasks: Cleanup pós-vocab — drop de colunas mortas (Inc 34)

**Input**: Design documents from `specs/029-drop-user-facets-json/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]`

**Modo de implementação**: low-risk cleanup. **Ordem crítica inversa do Inc 33**: code deploy ANTES de migration prod (código novo não depende das colunas; tabela velha tem colunas extras ignoradas).

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir `specs/029-drop-user-facets-json/` + spec + plan + research + data-model + quickstart já criados nesta sessão. Branch `029-drop-user-facets-json` ativa.

## Phase 2: Foundational (audit pre-mudança)

- [X] T002 Auditar callers que ainda acessam campos removidos do tipo `UserFacets`:
  ```bash
  grep -rn "getUserFacets" src/ | head -20
  grep -rn "\.genres\b\|\.styles\b\|\.moods\b\|\.contexts\b\|\.shelves\b" src/lib/queries/ src/lib/actions.ts | head -30
  ```
  Esperado pós-Inc 33: callers de `getUserFacets` acessam APENAS counters (`recordsTotal`, `recordsActive`, `recordsUnrated`, `recordsDiscarded`, `tracksSelectedTotal`, `updatedAt`) ou ID. Se algum caller acessar `.genres`/`.styles`/`.moods`/`.contexts`/`.shelves`, **migrar pra `listVocab` ANTES de prosseguir** (não deixar pra Inc 34 corrigir post-build-error).

- [X] T003 Auditar callers de `parseJsonArray`, `aggregateFacet`, `aggregateVocabulary`, `aggregateShelves`:
  ```bash
  grep -rn "parseJsonArray\|aggregateFacet\|aggregateVocabulary\|aggregateShelves" src/
  ```
  Esperado: todos os 4 helpers usados APENAS dentro de `src/lib/queries/user-facets.ts` (próprio módulo). Se houver caller externo, migrar/aceitar.

## Phase 3: User Story 1 — Schema enxuto sem ruído (P1)

**Goal**: remover as 5 colunas JSON do schema TS + tipo `UserFacets` + getUserFacets.

**Independent test**: cenário 5 do quickstart — `grep` retorna zero ocorrências de `genresJson|stylesJson|moodsJson|contextsJson|shelvesJson` em código ativo.

- [X] T004 [US1] Remover 5 colunas JSON da tabela `userFacets` em [src/db/schema.ts](../../src/db/schema.ts):
  - DELETAR linhas:
    ```ts
    genresJson: text('genres_json').notNull().default('[]'),
    stylesJson: text('styles_json').notNull().default('[]'),
    moodsJson: text('moods_json').notNull().default('[]'),
    contextsJson: text('contexts_json').notNull().default('[]'),
    shelvesJson: text('shelves_json').notNull().default('[]'),
    ```
  - PRESERVAR: `userId`, `recordsTotal`, `recordsActive`, `recordsUnrated`, `recordsDiscarded`, `tracksSelectedTotal`, `updatedAt`.
  - Comentário no header da tabela ajustado: "Counters denormalizados de records/tracks. Vocabulário (genres/styles/moods/contexts/shelves) vive em `user_vocab` (Inc 33)."

- [X] T005 [US1] Ajustar tipo `UserFacets` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  ```ts
  export type UserFacets = {
    userId: number;
    recordsTotal: number;
    recordsActive: number;
    recordsUnrated: number;
    recordsDiscarded: number;
    tracksSelectedTotal: number;
    updatedAt: Date;
  };
  ```
  Remover campos: `genres`, `styles`, `moods`, `contexts`, `shelves` (5 campos).

- [X] T006 [US1] Ajustar `getUserFacets` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - Remover do return da row `parseJsonArray<FacetCount>(row.genresJson, [])`, `parseJsonArray<FacetCount>(row.stylesJson, [])`, `parseJsonArray<string>(row.moodsJson, [])`, `parseJsonArray<string>(row.contextsJson, [])`, `parseJsonArray<string>(row.shelvesJson, [])`.
  - Remover do return do "row null" (defaults): `genres: [], styles: [], moods: [], contexts: [], shelves: []`.
  - Resultado final é shape do tipo enxuto T005.

- [X] T007 [US1] Verificar `parseJsonArray` — se único caller eram os 5 fields removidos, deletar helper:
  ```bash
  grep -rn "parseJsonArray" src/
  ```
  Se zero callers → DELETAR a função `parseJsonArray<T>` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts). Senão manter.

## Phase 4: User Story 2 — Sistema continua funcional (P1)

**Goal**: ajustar `recomputeFacets` pra escrever apenas counters preservados; deletar 3 helpers privados redundantes.

**Independent test**: build TS limpo + smoke pós-deploy (cenários 1+2+3 do quickstart).

- [X] T008 [US2] Refatorar `recomputeFacets(userId)` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - **Promise.all reduzido**: remover `aggregateFacet(userId, records.genres)`, `aggregateFacet(userId, records.styles)`, `aggregateVocabulary(userId, tracks.moods)`, `aggregateVocabulary(userId, tracks.contexts)`, `aggregateShelves(userId)`. Manter apenas:
    ```ts
    const [counts, tracksSelectedTotal] = await Promise.all([
      aggregateCounts(userId),
      aggregateTracksSelected(userId),
    ]);
    ```
  - **INSERT enxuto**: remover dos `.values({...})` os 5 campos `genresJson`, `stylesJson`, `moodsJson`, `contextsJson`, `shelvesJson` (com seus `JSON.stringify(...)`).
  - **onConflictDoUpdate enxuto**: remover dos `.set({...})` os 5 fields `genresJson: sql\`excluded.genres_json\`` etc.
  - Resultado: INSERT com 6 fields (userId, 4 record counters, tracksSelectedTotal, updatedAt). onConflictDoUpdate com 6 fields.
  - **`_repopulateVocab(userId)` chamado depois** — perde args (chama sem passar agregações). Ajustar assinatura em T009.

- [X] T009 [US2] Ajustar assinatura de `_repopulateVocab` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - Antes: `_repopulateVocab(userId, genresAgg, stylesAgg, _moodsAgg, _contextsAgg, _shelvesAgg)` (Inc 33 deixou underscored params dead).
  - Depois: `_repopulateVocab(userId)` apenas. Lógica interna já é self-contained — re-agrega via `_aggregateVocabCounts` + `_aggregateShelfCounts` + SELECTs internos pra genres/styles. Verificar e adicionar SELECTs pra genres/styles se ainda recebia agregações via param:
    ```ts
    // Genres + styles via SELECT direto records archived=false
    const recordsRows = await db
      .select({ genres: records.genres, styles: records.styles })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.archived, false)));
    const genresMap = new Map<string, number>();
    const stylesMap = new Map<string, number>();
    for (const r of recordsRows) {
      for (const g of (r.genres ?? []) as string[]) {
        if (g.trim().length > 0) genresMap.set(g, (genresMap.get(g) ?? 0) + 1);
      }
      for (const s of (r.styles ?? []) as string[]) {
        if (s.trim().length > 0) stylesMap.set(s, (stylesMap.get(s) ?? 0) + 1);
      }
    }
    ```
    Substituir os loops `for (const g of genresAgg) { ... }` e `for (const s of stylesAgg) { ... }` pra iterar `genresMap`/`stylesMap`.
  - Remover params `_moodsAgg`, `_contextsAgg`, `_shelvesAgg` (já eram dead).

- [X] T010 [US2] Deletar helpers privados em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - `aggregateFacet(userId, column)` — DELETAR (era usado só em recomputeFacets pre-T008).
  - `aggregateVocabulary(userId, column)` — DELETAR.
  - `aggregateShelves(userId)` — DELETAR.
  - **Preservar**: `_aggregateVocabCounts`, `_aggregateShelfCounts`, `aggregateCounts`, `aggregateTracksSelected`, `applyRecordStatusDelta`, `applyTrackSelectedDelta`, `applyDeltaForWrite`.
  - Ajustar comment do bloco "/* -------- Internas (queries pesadas) -------- */" se ficar pequeno.
  - Ajustar comment header do módulo (linhas 7-30) removendo refs aos 3 helpers deletados.

- [X] T011 [US2] Build local: `npm run build`. Confirmar zero erros TS.
  - Se erro `Property 'genres' does not exist on type 'UserFacets'` aparecer → caller esquecido (T002 deveria ter pegado). Migrar pra `listVocab` antes de prosseguir.

## Phase 5: User Story 3 — Recomputação simplificada (P2)

**Goal**: cobertura via cenário 4 do quickstart (`recomputeFacets` consome ~5 SELECTs a menos).

**Independent test**: dispatchar cron diário e medir delta de `[DB]` lines.

- [X] T012 [US3] Smoke local: rodar dev server, abrir `/`, verificar pickers populados via `listVocab`. Verificar nos logs que NENHUMA query toca `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves` (helpers não existem mais).

## Phase 6: Polish — build + commit + deploy + migration prod + smoke

- [X] T013 Build local final: `npm run build`. Zero erros TS.

- [X] T014 Greps finais:
  ```bash
  grep -rn "genresJson\|stylesJson\|moodsJson\|contextsJson\|shelvesJson" src/
  ```
  Esperado: zero ocorrências em código ativo (apenas comentários históricos aceitáveis se claros).
  ```bash
  grep -rn "aggregateFacet\|aggregateVocabulary\|aggregateShelves" src/
  ```
  Esperado: zero ocorrências.

- [X] T015 Aplicar migration SQL em sqlite local (dev):
  ```bash
  sqlite3 sulco.db <<'SQL'
  ALTER TABLE user_facets DROP COLUMN genres_json;
  ALTER TABLE user_facets DROP COLUMN styles_json;
  ALTER TABLE user_facets DROP COLUMN moods_json;
  ALTER TABLE user_facets DROP COLUMN contexts_json;
  ALTER TABLE user_facets DROP COLUMN shelves_json;
  SQL
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "PRAGMA table_info(user_facets);"
  ```
  Esperado: 7 colunas (userId, 4 records counters, tracksSelectedTotal, updatedAt). Zero `_json`.

- [ ] T016 Commit em branch `029-drop-user-facets-json` com mensagem `feat(029): drop colunas *Json em user_facets (Inc 34)`. Push branch.

- [ ] T017 Merge `029-drop-user-facets-json` → `main` com `--no-ff`. Push main.

- [ ] T018 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready (~1min). Confirmar via `vercel ls sulco --yes | head -3`.

- [ ] T019 Aplicar migration em prod via `turso db shell sulco-prod` **APÓS deploy estável**:
  ```sql
  ALTER TABLE user_facets DROP COLUMN genres_json;
  ALTER TABLE user_facets DROP COLUMN styles_json;
  ALTER TABLE user_facets DROP COLUMN moods_json;
  ALTER TABLE user_facets DROP COLUMN contexts_json;
  ALTER TABLE user_facets DROP COLUMN shelves_json;
  ```
  Verificar:
  ```sql
  SELECT name FROM pragma_table_info('user_facets');
  ```
  Esperado: 7 colunas (sem `_json`).

- [ ] T020 Smoke test pós-deploy: rodar cenários 1, 2, 3, 7 do [quickstart.md](./quickstart.md). Coletar `vercel logs sulco.vercel.app --follow > /tmp/inc34-smoke.log 2>&1`.
  - Cenário 1: `/` carrega, pickers populados, contadores OK.
  - Cenário 2: `/sets/[id]/montar` carrega, pickers de moods/contexts populados.
  - Cenário 3: edição de mood persiste (Inc 33 path intacto).
  - Cenário 7: smoke geral em todas as rotas autenticadas + mobile (≤640px) sem erro.

- [ ] T021 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **029** — Drop colunas *Json em user_facets (Inc 34) · 2026-05-XX · specs/029-drop-user-facets-json/ · ...` com sumário (5 colunas removidas + tipo enxugado + 3 helpers deletados + recomputeFacets simplificado; zero impacto observable; reversível por revert + ALTER TABLE ADD COLUMN). Remover Inc 34 da seção `🟢 Próximos`. Atualizar header `**Última atualização**`.

## Dependencies

- **T001** instantâneo.
- **T002 → T003** (audit antes de mexer) ANTES de T004-T010.
- **T004 (schema delta)** ANTES de T005 (tipo TS — usa schema).
- **T005 → T006**: tipo + getUserFacets (mesmo arquivo, sequencial).
- **T007 (parseJsonArray check)** depende de T006 — verifica callers pós-mudança.
- **T008 (recomputeFacets simplificado)** depende de T004 (schema fields removidos).
- **T009 (`_repopulateVocab` assinatura)** depende de T008 — caller passa menos args.
- **T010 (deletar helpers)** depende de T008 — apenas após removidas as chamadas.
- **T011 (build)** depende de T004-T010.
- **T012 (smoke local)** depende de T011.
- **T013 (build final)** redundância de T011, depois de T012.
- **T014 (greps)** depende de T010+T013.
- **T015 (migration local)** depende de T013 — pode rodar em paralelo com T016.
- **T016 (commit)** depende de T013+T014.
- **T017 (merge main)** depende de T016.
- **T018 (deploy prod)** depende de T017.
- **T019 (migration prod)** depende de T018 — **CRÍTICO** rodar APÓS deploy.
- **T020 (smoke prod)** depende de T019.
- **T021 (BACKLOG)** depende de T020 OK.

## Parallelization examples

Tasks `[P]` (independentes):

- T002 [P] — audit grep (não toca código)
- T015 [P] — migration sqlite local (não toca código TS)

Sequenciais (mesmo arquivo `user-facets.ts`):

- T005 → T006 → T007 → T008 → T009 → T010 (cadeia em user-facets.ts)
- T004 antes de T005 (schema → tipo)
- T011 build após T010
- T018 → T019 → T020 (deploy → migration → smoke)

## MVP Scope (sugerido)

**MVP = US1 + US2** (T004-T011) + **Polish T013-T020**:
- US1 (schema delta) e US2 (recomputeFacets) são tightly coupled — ambos precisam ir juntos pra build TS passar.
- US3 (recomputação simplificada) é métrica de melhoria, não funcional — verificada via cenário 4 do quickstart pós-deploy.

Tudo num único release. Esforço ~30-45min total.

## Implementation strategy

Sequência ótima:

1. **T001** (instantâneo)
2. **T002-T003** (audit greps, ~5min)
3. **T004** (schema delta, 2min)
4. **T005-T006** (tipo + getUserFacets, 5min)
5. **T007** (parseJsonArray check + maybe delete, 2min)
6. **T008-T010** (recomputeFacets + _repopulateVocab + delete 3 helpers, 10min)
7. **T011-T012** (build + smoke local, 3min)
8. **T013-T014** (build final + greps, 2min)
9. **T015** (migration sqlite local, 1min)
10. **T016-T017** (commit + merge main, 3min)
11. **T018** (deploy prod, ~3min + 1min wait)
12. **T019** (migration prod via turso shell, 2min)
13. **T020** (smoke prod, 5-10min)
14. **T021** (BACKLOG, 5min)

**Total estimado: ~45min**.

Após T020 OK, Inc 34 fecha o ciclo de cleanup pós-Inc 33. Próximas features voltam pra UX (Inc 30/31/29).

Reversibilidade trivial: `git revert` + 5 ALTER TABLE ADD COLUMN restaurando defaults vazios.
