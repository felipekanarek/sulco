# Tasks: Tabela `user_vocab` dedicada (Inc 33)

**Input**: Design documents from `specs/028-user-vocab-table/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso

**Modo de implementação**: cuidadoso. **Ordem crítica**: schema delta → backfill → deploy de código. Inverter quebra pickers em prod (`listVocab` retornaria 0 rows e chips de moods/contexts/genres/styles/shelves ficariam vazios em todas as telas).

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir `specs/028-user-vocab-table/` + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão. Branch `028-user-vocab-table` ativa.

## Phase 2: Foundational (schema delta + helpers core antes das US)

### Schema delta

- [X] T002 Adicionar `userVocab` a [src/db/schema.ts](../../src/db/schema.ts):
  ```ts
  export const userVocab = sqliteTable(
    'user_vocab',
    {
      userId: integer('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      kind: text('kind', {
        enum: ['genres', 'styles', 'moods', 'contexts', 'shelves'],
      }).notNull(),
      term: text('term').notNull(),
      refCount: integer('ref_count').notNull().default(0),
      updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.kind, t.term] }),
      userKindIdx: index('user_vocab_user_kind_idx').on(t.userId, t.kind),
    }),
  );

  export type UserVocabRow = typeof userVocab.$inferSelect;
  export type NewUserVocabRow = typeof userVocab.$inferInsert;
  ```
  Verificar imports `primaryKey` (já existe), `index` (já existe). Rodar `npm run build` pra confirmar tipos.

- [X] T003 Aplicar migration SQL em sqlite local (dev):
  ```bash
  sqlite3 sulco.db <<'SQL'
  CREATE TABLE user_vocab (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('genres','styles','moods','contexts','shelves')),
    term TEXT NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, kind, term)
  );
  CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
  SQL
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT name FROM sqlite_master WHERE type='table' AND name='user_vocab';"
  sqlite3 sulco.db "SELECT name FROM sqlite_master WHERE type='index' AND name='user_vocab_user_kind_idx';"
  ```

### Helpers core (`src/lib/queries/user-vocab.ts` — NOVO arquivo)

- [X] T004 Criar [src/lib/queries/user-vocab.ts](../../src/lib/queries/user-vocab.ts) com 3 helpers (`listVocab`, `applyVocabDelta`, `diffVocabArrays`) conforme [contracts/user-vocab-helpers.md](./contracts/user-vocab-helpers.md):
  - `'server-only'` no topo.
  - Imports: `cache` de `react`, `eq`, `and`, `sql` de `drizzle-orm`, `db` de `@/db`, `userVocab` de `@/db/schema`.
  - Type export `VocabKind = 'genres' | 'styles' | 'moods' | 'contexts' | 'shelves'`.
  - Type export `VocabEntry = { term: string; count: number }`.
  - Pure helper `diffVocabArrays(oldArr, newArr)` (Decisão 5 do research).
  - `listVocab` cached via `cache((userId, kind) => ...)`. SQL: `SELECT term, ref_count FROM user_vocab WHERE user_id = ? AND kind = ? ORDER BY ref_count DESC, lower(term) ASC`.
  - `applyVocabDelta` recebe `(userId, kind, added: string[], removed: string[])`. Filtra termos vazios via `.filter(t => t.trim().length > 0)`. Para cada `added`: drizzle UPSERT `db.insert(userVocab).values({...refCount: 1}).onConflictDoUpdate({target: [userVocab.userId, userVocab.kind, userVocab.term], set: {refCount: sql\`ref_count + 1\`, updatedAt: sql\`unixepoch()\`}})`. Para cada `removed`: UPDATE com `MAX(0, ref_count - 1)` via `sql\`MAX(0, ref_count - 1)\``. Após todos UPDATEs, 1 DELETE: `db.delete(userVocab).where(and(eq(userVocab.userId, userId), eq(userVocab.kind, kind), eq(userVocab.refCount, 0)))`.

- [X] T005 Build local: `npm run build`. Confirmar zero erros TS em schema.ts + user-vocab.ts.

### Script de backfill

- [X] T006 Criar `scripts/_backfill-user-vocab.mjs` (mesmo padrão Inc 24/27/32). Implementação descrita em [data-model.md](./data-model.md). Pontos críticos:
  - `for (const userId of allUserIds) { await db.transaction(...) }` — Decisão 14.
  - Filtrar termos vazios/whitespace: `if (typeof term !== 'string' || term.trim().length === 0) continue`.
  - 4 SELECTs por user: records (genres+styles), tracks JOIN records (moods+contexts), records distinct shelf, e contar com `Map`. Insert resultado.
  - Log progress: `console.log` por user + a cada 500 inserts.

- [X] T007 Rodar backfill em sqlite local:
  ```bash
  node scripts/_backfill-user-vocab.mjs
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT kind, COUNT(*) AS terms FROM user_vocab GROUP BY kind;"
  sqlite3 sulco.db "SELECT COUNT(*) FROM user_vocab WHERE ref_count = 0;"
  # esperado: 0
  ```

## Phase 3: User Story 1 — DJ edita vocabulário sem custo proibitivo (P1)

**Goal**: substituir `recomputeVocabularyOnly` e `recomputeShelvesOnly` por `applyVocabDelta` direcionado em writes de track e record.

**Independent test**: cenários 1 e 2 do [quickstart.md](./quickstart.md) — edição de moods/shelf consome ≤10 rows.

- [X] T008 [US1] Refatorar `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Antes do UPDATE, carregar `oldMoods`/`oldContexts` da track (pode reusar SELECT existente que já lê estado atual; checar).
  - Substituir chamada a `recomputeVocabularyOnly(user.id)` por:
    ```ts
    import { applyVocabDelta, diffVocabArrays } from '@/lib/queries/user-vocab';
    // ...
    const moodsDiff = diffVocabArrays(oldMoods, newMoods);
    const contextsDiff = diffVocabArrays(oldContexts, newContexts);
    await applyVocabDelta(user.id, 'moods', moodsDiff.added, moodsDiff.removed);
    await applyVocabDelta(user.id, 'contexts', contextsDiff.added, contextsDiff.removed);
    ```
  - Manter `applyDeltaForWrite` (Inc 27) que cuida de outros campos (status, selected etc.) intacto. Apenas substituir o ramo de moods/contexts.
  - Build local pra confirmar.

- [X] T009 [US1] Refatorar `updateRecordAuthorFields` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Antes do UPDATE, carregar `oldShelf` do record (pode reusar SELECT existente).
  - Substituir chamada a `recomputeShelvesOnly(user.id)` por:
    ```ts
    if (oldShelf !== newShelf) {
      const added = newShelf ? [newShelf] : [];
      const removed = oldShelf ? [oldShelf] : [];
      await applyVocabDelta(user.id, 'shelves', added, removed);
    }
    ```
  - Manter outros side-effects intactos.

- [X] T010 [US1] Auditar Server Actions remanescentes que ainda chamam `recomputeVocabularyOnly`/`recomputeShelvesOnly`:
  ```bash
  grep -rn "recomputeVocabularyOnly\|recomputeShelvesOnly" src/
  ```
  Esperado pós-T008/T009: zero ocorrências em actions.ts. Se aparecer em outro arquivo (ex: `applyDiscogsUpdate`), aguardar T012.

## Phase 4: User Story 2 — Filtros de chips refletem vocab em uso (P1)

**Goal**: migrar 5 callers de leitura para `listVocab`, preservando assinatura externa.

**Independent test**: cenário 4 do quickstart — pickers em /sets/[id]/montar e / mostram termos em uso, ordenados por frequência.

- [X] T011 [US2] Refatorar callers de leitura em batch:
  - `listUserGenres` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts): `import { listVocab } from '@/lib/queries/user-vocab'` + `const entries = await listVocab(userId, 'genres'); return entries.map((e) => ({ value: e.term, count: e.count }));`
  - `listUserStyles` idem com `'styles'`.
  - `listUserShelves` retorna `string[]`: `return entries.map((e) => e.term);`
  - `listSelectedVocab(userId, kind)` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts): `return entries.map((e) => e.term)` (Decisão 11 — semântica oficializada).
  - `listUserVocabulary` em [src/lib/actions.ts](../../src/lib/actions.ts): chama `listVocab` para o kind apropriado, retorna formato esperado pelos chip pickers.
  - **Importante**: NÃO mexer em `getUserFacets` ainda — colunas `*Json` em `user_facets` permanecem como fallback até Inc 34. `recomputeFacets` continua exportado.
  - Build local + grep `listUserGenres\|listUserStyles\|listUserShelves\|listSelectedVocab\|listUserVocabulary` em todos os callers pra confirmar nenhum quebrou.
  - **Validação visual local** (cobre semântica nova de `listSelectedVocab` — Decisão 11): `npm run dev`, abrir `http://localhost:3000/sets/[id]/montar` em qualquer set existente, verificar que pickers de moods e contexts renderizam com lista (não vazia) e ordem por frequência. Confirmar paridade visual rough com pré-Inc 33 (mesmos termos aparecem; ordem pode mudar levemente).

## Phase 5: User Story 3 — Sync e archive mantêm vocab consistente (P2)

**Goal**: hooks em sync (genres/styles) + archive/restore (todas as 5 dimensões) mantém vocab refletindo estado real.

**Independent test**: cenário 3 do quickstart — archive consome ≤30 rows; sync atualiza vocab automaticamente.

- [X] T012 [US3] Adicionar hooks em `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts):
  - **Path INSERT (record novo)**: increment **apenas quando `created=true`** (após o ramo `if (inserted.length > 0)`). Evita duplicar quando `onConflictDoNothing` rola pra outro worker que ganhou a race:
    ```ts
    if (inserted.length > 0) {
      recordId = inserted[0].id;
      created = true;
      await applyVocabDelta(userId, 'genres', release.genres, []);
      await applyVocabDelta(userId, 'styles', release.styles, []);
    } else {
      // race lost — outro worker já incrementou vocab; não fazer nada
    }
    ```
  - **Path UPDATE (record existente)**: `existing` query atual já carrega `id` e `archived`. Estender pra carregar `genres` e `styles` antigos:
    ```ts
    const existing = await db
      .select({ id: records.id, archived: records.archived, oldGenres: records.genres, oldStyles: records.styles })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.discogsId, release.id)))
      .limit(1);
    ```
  - Após o UPDATE, computar diff e aplicar:
    ```ts
    const oldG = (existing[0].oldGenres ?? []) as string[];
    const oldS = (existing[0].oldStyles ?? []) as string[];
    const gDiff = diffVocabArrays(oldG, release.genres);
    const sDiff = diffVocabArrays(oldS, release.styles);
    await applyVocabDelta(userId, 'genres', gDiff.added, gDiff.removed);
    await applyVocabDelta(userId, 'styles', sDiff.added, sDiff.removed);
    ```
  - **Reaparição** (`wasArchived` true → false): vocab deve ser re-incrementado pra TODAS as 5 dimensões. Implementação: chamar helper bulk descrito em T013 com `add=true`.
  - moods/contexts NÃO são tocados aqui (são AUTHOR — Decisão 7 do research).

- [X] T013 [US3] Implementar bulk hook de archive/restore em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Localizar Server Action `archiveRecord` (ou caminho equivalente — checar via `grep -n "archived: true\|archive" src/lib/actions.ts | head`).
  - Antes do UPDATE archived=true: SELECT genres+styles+shelf do record + SELECT moods+contexts de TODAS as tracks do record.
  - Após o UPDATE: bulk decrement via 5 chamadas a `applyVocabDelta` (genres, styles, moods flatMap, contexts flatMap, shelves opcional).
  - **Restore** (Server Action de des-arquivar manualmente, se existir, OU caminho de reaparição em `applyDiscogsUpdate`): inverso — `added=...` em vez de `removed=...`. Centralizar lógica num helper privado se ficar duplicada.

- [X] T014 [US3] Auditar todos os caminhos de write em moods/contexts/shelf/genres/styles:
  ```bash
  grep -rn "tracks\.moods\|tracks\.contexts\|records\.shelfLocation\|records\.genres\|records\.styles" src/lib/ | grep -v "queries/" | head -30
  ```
  Esperado: apenas em actions.ts (T008+T009+T013) e apply-update.ts (T012). Se aparecer em outro lugar (ex: import.ts, sync handlers), adicionar hook lá também.

## Phase 6: User Story 4 — Drift correction via cron diário (P3)

**Goal**: `recomputeFacets` ganha sub-step de re-popular `user_vocab` do zero por user.

**Independent test**: cenário 5 do quickstart — drift introduzido manualmente é corrigido após cron rodar.

- [X] T015 [US4] Estender `recomputeFacets(userId)` em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - Após a lógica existente que re-computa `user_facets` (manter intacta — colunas JSON ainda existem como fallback até Inc 34), adicionar bloco `db.transaction` que faz:
    ```ts
    await tx.delete(userVocab).where(eq(userVocab.userId, userId));
    // ... re-popular igual ao backfill (genres/styles via records, moods/contexts via tracks JOIN, shelves via DISTINCT) ...
    ```
  - **Confirmar que SELECT base usa `WHERE archived = 0`** em todos os 3 ramos (records pra genres/styles+shelves, tracks JOIN records pra moods/contexts) — FR-013 exige estado autoritativo (apenas não-arquivados contam pro vocab). Espelhar exatamente o filtro do backfill (T006).
  - Reusar lógica do backfill — refatorar pra função helper privada `_repopulateVocab(tx, userId)` se ficar grande.
  - Build local pra confirmar.

- [X] T016 [US4] Remover helpers redundantes em [src/lib/queries/user-facets.ts](../../src/lib/queries/user-facets.ts):
  - DELETAR funções: `recomputeVocabularyOnly`, `recomputeShelvesOnly`, `aggregateFacet`, `aggregateVocabulary`.
  - Verificar `applyDeltaForWrite` (Inc 27) — manter, mas pode chamar diferente. Se `applyDeltaForWrite` chamava `recomputeVocabularyOnly`/`recomputeShelvesOnly`, remover essas chamadas (já substituídas em T008/T009).
  - Manter `applyRecordStatusDelta`, `applyTrackSelectedDelta` (Inc 27 — não tocam vocab).
  - Build local.

## Phase 7: Polish — build + commit + deploy + smoke

- [X] T017 Build local final: `npm run build`. Confirmar zero erros TypeScript em schema.ts, user-vocab.ts, user-facets.ts, collection.ts, montar.ts, actions.ts, apply-update.ts.

- [X] T018 Verificar grep final:
  - `grep -rn "recomputeVocabularyOnly\|recomputeShelvesOnly\|aggregateFacet\|aggregateVocabulary" src/` — esperado: 0 ocorrências.
  - `grep -rn "applyVocabDelta\|listVocab\|diffVocabArrays" src/` — esperado: definição em user-vocab.ts + usos em actions.ts (3+: updateTrackCuration, updateRecordAuthorFields, archiveRecord) + apply-update.ts (2+: INSERT path + UPDATE path) + collection.ts (3: listUserGenres/Styles/Shelves) + montar.ts (1: listSelectedVocab).
  - `grep -rn "user_facets\.\(moods_json\|contexts_json\|genres_json\|styles_json\|shelves_json\)" src/` — esperado: zero ocorrências em código ativo (colunas existem no banco mas não são mais lidas).

- [X] T019 Commit em branch `028-user-vocab-table` com mensagem `feat(028): tabela user_vocab dedicada (Inc 33)`. Push branch.

- [X] T020 Merge `028-user-vocab-table` → `main` com `--no-ff`. **NÃO PUSHE AINDA** se backfill prod (T022) ainda não rodou. Verifica em ordem.

- [X] T021 [US3] Aplicar migration em prod via `turso db shell sulco-prod`:
  ```sql
  CREATE TABLE user_vocab (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('genres','styles','moods','contexts','shelves')),
    term TEXT NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, kind, term)
  );
  CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
  ```
  Verificar:
  ```sql
  SELECT name FROM sqlite_master WHERE type='table' AND name='user_vocab';
  -- 1 row
  SELECT name FROM sqlite_master WHERE type='index' AND name='user_vocab_user_kind_idx';
  -- 1 row
  ```

- [X] T022 [US3] Rodar backfill em prod (mesmo padrão Inc 32 — usar token efêmero turso CLI ou env vars):
  ```bash
  DATABASE_URL=libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io \
  DATABASE_AUTH_TOKEN=<token> \
  node scripts/_backfill-user-vocab.mjs
  ```
  Verificar via turso shell:
  ```sql
  SELECT user_id, kind, COUNT(*) AS terms FROM user_vocab GROUP BY user_id, kind;
  -- contagens > 0 por (user, kind)
  SELECT COUNT(*) FROM user_vocab WHERE ref_count = 0;
  -- esperado: 0
  ```

- [X] T023 **Gate verificável antes do push** — executar comando explícito:
  ```bash
  turso db shell sulco-prod "SELECT kind, COUNT(*) AS terms FROM user_vocab GROUP BY kind"
  ```
  - **Se retornar 5 linhas (uma por kind) com COUNT > 0** → pré-condições OK, prosseguir: `git push origin main`.
  - **Se retornar < 5 linhas ou COUNT = 0 em algum kind** → ABORTAR push. Voltar a T022. Re-checar.
  
  **Por que crítico**: se code deploy entra antes do backfill completo, `listVocab` retorna 0 em algum kind e pickers ficam vazios em prod. Regressão UX grave.

- [X] T024 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready (~1min). Confirmar via `vercel ls sulco --yes | head -3`.

- [X] T025 Smoke test pós-deploy: rodar cenários 1, 2, 3, 4, 6, 8 do [quickstart.md](./quickstart.md). Coletar output de `vercel logs sulco.vercel.app --follow > /tmp/inc33-smoke.log 2>&1` durante cada cenário.
  - Cenário 1 (edição moods): ≤10 rows lidas, 0 SELECTs de scan ~10k tracks.
  - Cenário 2 (edição shelf): ≤10 rows lidas, 0 SELECTs de scan ~2.5k records.
  - Cenário 3 (archive): ≤30 rows lidas, 0 chamadas a recomputeFacets síncrono.
  - Cenário 4 (pickers): listas mostram termos em uso, ordenadas por frequência.
  - Cenário 6 (paridade pós-deploy): contagens em `user_vocab` batem com `json_array_length(*_json)` em `user_facets` (paridade ±1 aceito).
  - Cenário 8 (smoke geral): pickers em /, /sets/[id]/montar, /disco/[id] todos populados; mobile testado em viewport ≤640px (Princípio V).

- [X] T026 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **028** — Tabela user_vocab dedicada (Inc 33) · 2026-05-XX · specs/028-user-vocab-table/ · ...` com sumário (tabela `user_vocab` com counters incrementais por termo + 3 helpers + 4 hooks de write + migração de 5 callers de leitura + recomputeFacets ganha sub-step + backfill + cron drift correction; redução ~99% em reads de write paths). Remover Inc 33 da seção `🟢 Próximos`. Promover Inc 32 → Inc 28 SPECKIT marker pra "Prior active" e atualizar Current active feature em CLAUDE.md (ou deixar vazio se nada ativo logo após).

## Dependencies

- **T002 (schema TS)** ANTES de T003 (aplicar SQL local).
- **T003 (sqlite local migration)** ANTES de T004 (helper) — helper importa `userVocab` table.
- **T004 (helpers core)** ANTES de TODA Phase 3-5 (US1, US2, US3 importam `applyVocabDelta`/`listVocab`/`diffVocabArrays`).
- **T005 (build)** valida T002+T004.
- **T006 (script backfill)** ANTES de T007 (rodar local) e T022 (rodar prod).
- **T007 (backfill local)** valida script antes de prod.
- **T008 → T009 → T010**: cadeia em actions.ts (mesmo arquivo, mas seções diferentes — podem ir em sequência rápida).
- **T011 (callers de leitura)**: depende só de T004 (helper). Pode rodar em paralelo a T008-T010 se branches de actions.ts não conflitarem (mesmo arquivo, rodar sequencial pra evitar merge complexo).
- **T012 (hook em apply-update.ts)**: depende de T004. Pode rodar em paralelo a T011.
- **T013 (archive bulk)**: depende de T004. Sequencial a T008-T010 (mesmo arquivo actions.ts).
- **T014 (audit writes)**: depende de T008+T009+T012+T013.
- **T015 (recomputeFacets)**: depende de T004. Pode rodar em paralelo a Phase 3-5.
- **T016 (delete redundantes)**: depende de T015 (não pode deletar antes de migrar callers).
- **T017 (build final)** depende de T002-T016.
- **T018 (grep)** depende de T017.
- **T019 (commit)** depende de T017+T018.
- **T020 (merge main local)** depende de T019.
- **T021 (migration prod)** ANTES de T022 (backfill prod).
- **T022 (backfill prod)** ANTES de T023 (gate). **CRÍTICO**.
- **T023 (gate)** depende de T020+T021+T022.
- **T024 (deploy)** depende de T023.
- **T025 (smoke)** depende de T024.
- **T026 (BACKLOG)** depende de T025 OK.

## Parallelization examples

Tasks `[P]` (independentes — mesmos arquivos NÃO paraleliza):

- T002 [P] — schema.ts
- T006 [P] — script backfill (não toca código)
- T011 [P] — collection.ts/montar.ts/actions.ts (parte de leitura) — pode rodar com T012
- T012 [P] — apply-update.ts
- T015 [P] — user-facets.ts

Sequenciais (mesmo arquivo ou ordem importa):

- T003 → T007 (sqlite local migration → backfill local)
- T008 → T009 → T010 → T013 → T014 (cadeia em actions.ts)
- T015 → T016 (extender recomputeFacets antes de remover helpers redundantes)
- T021 → T022 → T023 → T024 → T025 (migration prod → backfill prod → gate → deploy → smoke)

## MVP Scope (sugerido)

**MVP = US1 (T008+T009) + US2 (T011) + US3 (T012+T013) + Polish T017-T025**:
- US1+US2+US3 todos necessários pra deploy seguro (sem US3 de archive, archive vai bug em prod).
- US4 (T015+T016) é independente do hot path mas necessário pra cleanup completo. Pode shipar junto.

Recomendo shipar tudo em um único release. Esforço total ~5-6h.

## Implementation strategy

Sequência ótima:

1. **T001-T003** (schema + migration local, ~10min)
2. **T004** (helper core, ~30min)
3. **T005** (build, 3min)
4. **T006-T007** (script + backfill local, ~25min)
5. **T008-T010** (refator updateTrackCuration + updateRecordAuthorFields, ~45min)
6. **T011** (callers de leitura, ~30min)
7. **T012** (hook apply-update.ts, ~30min)
8. **T013-T014** (archive bulk + audit, ~30min)
9. **T015-T016** (recomputeFacets + delete redundantes, ~30min)
10. **T017-T018** (build final + greps, ~5min)
11. **T019-T020** (commit + merge local, ~5min)
12. **T021-T022** (migration prod + backfill prod, ~5min)
13. **T023** (gate, 1min)
14. **T024** (deploy, ~3min)
15. **T025** (smoke, ~20min)
16. **T026** (BACKLOG, ~5min)

**Total estimado: ~5h30**.

Após T025 OK, instrumentação `[DB]` continua ligada pra confirmar redução em curadoria intensiva. Inc 34 (drop colunas `*Json` em `user_facets`) é o próximo passo natural.
