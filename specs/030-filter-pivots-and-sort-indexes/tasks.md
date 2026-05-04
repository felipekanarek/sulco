# Tasks: Filtros multi-select via index + sort indexado (Inc 35)

**Input**: Design documents from `specs/030-filter-pivots-and-sort-indexes/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso + EXPLAIN QUERY PLAN

**Modo de implementação**: cuidadoso — path quente (`updateTrackCuration`) afetado. **Ordem crítica**: migration prod + backfill prod ANTES do code deploy.

## Phase 1: Setup

- [ ] T001 Confirmar status — feature dir `specs/030-filter-pivots-and-sort-indexes/` + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão. Branch `030-filter-pivots-and-sort-indexes` ativa.

## Phase 2: Foundational (schema + helper antes das US)

### Schema delta

- [ ] T002 Adicionar 4 tabelas pivot + 2 indexes ORDER BY em [src/db/schema.ts](../../src/db/schema.ts):
  - **4 tabelas novas** (após `userVocab`, antes de `playlists`):
    ```ts
    export const recordGenres = sqliteTable('record_genres', {
      recordId: integer('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
      genre: text('genre').notNull(),
    }, (t) => ({
      pk: primaryKey({ columns: [t.recordId, t.genre] }),
      genreIdx: index('record_genres_genre_idx').on(t.genre, t.recordId),
    }));
    export type RecordGenreRow = typeof recordGenres.$inferSelect;

    export const recordStyles = sqliteTable('record_styles', {
      recordId: integer('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
      style: text('style').notNull(),
    }, (t) => ({
      pk: primaryKey({ columns: [t.recordId, t.style] }),
      styleIdx: index('record_styles_style_idx').on(t.style, t.recordId),
    }));

    export const trackMoods = sqliteTable('track_moods', {
      trackId: integer('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
      mood: text('mood').notNull(),
    }, (t) => ({
      pk: primaryKey({ columns: [t.trackId, t.mood] }),
      moodIdx: index('track_moods_mood_idx').on(t.mood, t.trackId),
    }));

    export const trackContexts = sqliteTable('track_contexts', {
      trackId: integer('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
      context: text('context').notNull(),
    }, (t) => ({
      pk: primaryKey({ columns: [t.trackId, t.context] }),
      contextIdx: index('track_contexts_context_idx').on(t.context, t.trackId),
    }));
    ```
  - **2 indexes ORDER BY na tabela `records`** (adicionar ao block `(t) => ({...})` da definição existente):
    ```ts
    userArchivedImportedIdx: index('records_user_archived_imported_idx').on(
      t.userId, t.archived, sql`${t.importedAt} DESC`,
    ),
    userArchivedArchivedatIdx: index('records_user_archived_archivedat_idx').on(
      t.userId, t.archived, sql`${t.archivedAt} DESC`,
    ),
    ```
  - Importar `desc` se necessário, mas drizzle aceita `sql\`...DESC\`` direto em index().on().
  - Build local pra confirmar tipos.

- [ ] T003 Aplicar migration SQL em sqlite local (dev):
  ```bash
  sqlite3 sulco.db <<'SQL'
  CREATE TABLE record_genres (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, genre TEXT NOT NULL, PRIMARY KEY (record_id, genre));
  CREATE INDEX record_genres_genre_idx ON record_genres(genre, record_id);
  CREATE TABLE record_styles (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, style TEXT NOT NULL, PRIMARY KEY (record_id, style));
  CREATE INDEX record_styles_style_idx ON record_styles(style, record_id);
  CREATE TABLE track_moods (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, mood TEXT NOT NULL, PRIMARY KEY (track_id, mood));
  CREATE INDEX track_moods_mood_idx ON track_moods(mood, track_id);
  CREATE TABLE track_contexts (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, context TEXT NOT NULL, PRIMARY KEY (track_id, context));
  CREATE INDEX track_contexts_context_idx ON track_contexts(context, track_id);
  CREATE INDEX records_user_archived_imported_idx ON records(user_id, archived, imported_at DESC);
  CREATE INDEX records_user_archived_archivedat_idx ON records(user_id, archived, archived_at DESC);
  SQL
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'record_%' OR name LIKE 'track_%';"
  sqlite3 sulco.db "SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE 'record_%_idx' OR name LIKE 'track_%_idx' OR name LIKE 'records_user_archived_%');"
  ```
  Esperado: 4 tabelas + 6 indexes novos.

### Helper privado de delta

- [ ] T004 Criar [src/lib/pivot-helpers.ts](../../src/lib/pivot-helpers.ts) com `applyPivotDelta` conforme [contracts/pivot-helpers.md](./contracts/pivot-helpers.md):
  - `'server-only'` no topo.
  - Imports: `and`, `eq`, `inArray`, `sql` de `drizzle-orm`; `db` de `@/db`; `recordGenres, recordStyles, trackMoods, trackContexts` de `@/db/schema`.
  - Type: `PivotTable = typeof recordGenres | typeof recordStyles | typeof trackMoods | typeof trackContexts`.
  - Função `applyPivotDelta(table, fkColumn, valueColumn, fkId, added, removed)`:
    - Filtra empty/whitespace.
    - Se ambos vazios → no-op.
    - DELETE removidos via `db.delete(table).where(and(eq(table[fkColumn], fkId), inArray(table[valueColumn], cleanRemoved)))`.
    - INSERT added via `db.insert(table).values(values).onConflictDoNothing()`.
  - Pode usar `@ts-expect-error` localizado em 2 pontos pra dynamic column access — alternativa é 4 funções específicas (avaliar overhead na implementação).

### Script de backfill

- [ ] T005 Criar `scripts/_backfill-pivot-tables.mjs` (mesmo padrão Inc 24/27/32/33):
  - Conexão padrão (`DATABASE_URL` env ou file:./sulco.db).
  - Para cada record (todos):
    - SELECT genres, styles do record (parse JSON).
    - DELETE FROM record_genres WHERE record_id = ?.
    - DELETE FROM record_styles WHERE record_id = ?.
    - INSERT N entries em cada (filtrando vazios/whitespace).
  - Para cada track (todos):
    - SELECT moods, contexts da track.
    - DELETE FROM track_moods WHERE track_id = ?.
    - DELETE FROM track_contexts WHERE track_id = ?.
    - INSERT N entries em cada.
  - Log progress: `console.log` a cada 500 entities + total no fim.

- [ ] T006 Rodar backfill em sqlite local:
  ```bash
  node scripts/_backfill-pivot-tables.mjs
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT 'record_genres', COUNT(*) FROM record_genres UNION ALL SELECT 'record_styles', COUNT(*) FROM record_styles UNION ALL SELECT 'track_moods', COUNT(*) FROM track_moods UNION ALL SELECT 'track_contexts', COUNT(*) FROM track_contexts;"
  ```
  Esperado: 4 rows com COUNT > 0 cada.

## Phase 3: User Story 1 — Filtros gênero/estilo via index na home (P1)

**Goal**: substituir `EXISTS json_each(records.genres/styles)` por `IN (SELECT record_id FROM record_genres/styles WHERE ...)` em `buildCollectionFilters`.

**Independent test**: cenários 1 + 4 do quickstart — EXPLAIN mostra SEARCH usando novo index; load `/?genre=Rock` consome ≤100 rows lidas.

- [ ] T007 [US1] Refatorar `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):
  - Substituir o ramo `q.genres`:
    ```ts
    if (q.genres.length > 0) {
      conds.push(
        sql`${records.id} IN (SELECT record_id FROM record_genres WHERE genre IN ${q.genres})`,
      );
    }
    ```
  - Substituir o ramo `q.styles` idem (com `record_styles` e `style`).
  - Bomba (`tracks.is_bomb`) intacto — não muda.
  - Search text (Inc 32 — `LIKE search_text`) intacto.
  - Build local pra confirmar.

## Phase 4: User Story 2 — Filtros moods/contexts via index em /montar (P1)

**Goal**: substituir `EXISTS json_each(tracks.moods/contexts)` por `IN (SELECT track_id FROM track_moods/contexts WHERE ...)` em `queryCandidates`.

**Independent test**: cenários 3 + 5 do quickstart — EXPLAIN mostra SEARCH usando novo index; load `/sets/[id]/montar?mood=solar` ≤100 rows lidas.

- [ ] T008 [US2] Localizar e refatorar filtros em `queryCandidates` em [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts):
  - Buscar via grep `json_each.*moods\|json_each.*contexts` em montar.ts.
  - Substituir cada ocorrência por:
    ```ts
    if (filters.moods.length > 0) {
      conds.push(
        sql`${tracks.id} IN (SELECT track_id FROM track_moods WHERE mood IN ${filters.moods})`,
      );
    }
    if (filters.contexts.length > 0) {
      conds.push(
        sql`${tracks.id} IN (SELECT track_id FROM track_contexts WHERE context IN ${filters.contexts})`,
      );
    }
    ```
  - Build local pra confirmar.

## Phase 5: User Story 3 — Listagem default sem TEMP B-TREE (P2)

**Goal**: graças ao index `records_user_archived_imported_idx` criado em T002, queries default da home automaticamente usam-no. Tarefa apenas valida.

**Independent test**: cenário 2 do quickstart — EXPLAIN listagem default sem TEMP B-TREE.

- [ ] T009 [US3] Validar via EXPLAIN local (e depois prod em T020):
  ```bash
  sqlite3 sulco.db "EXPLAIN QUERY PLAN SELECT id, artist, title FROM records WHERE user_id = 1 AND archived = 0 ORDER BY imported_at DESC LIMIT 50;"
  ```
  Esperado: `SEARCH records USING INDEX records_user_archived_imported_idx`. **Sem** `USE TEMP B-TREE FOR ORDER BY`.

- [ ] T010 [US3] Validar via EXPLAIN local query de archived (cenário /status):
  ```bash
  sqlite3 sulco.db "EXPLAIN QUERY PLAN SELECT id, artist, title, archived_at FROM records WHERE user_id = 1 AND archived = 1 ORDER BY archived_at DESC;"
  ```
  Esperado: `SEARCH records USING INDEX records_user_archived_archivedat_idx`. Sem TEMP B-TREE.

## Phase 6: User Story 4 — Edições mantêm pivot consistente (P2)

**Goal**: hooks em `updateTrackCuration` (track moods/contexts) + `applyDiscogsUpdate` (record genres/styles) atualizam pivot incrementalmente.

**Independent test**: cenário 7 do quickstart — edição de mood adiciona DELETE+INSERT em pivot; novo mood aparece em filtro imediatamente.

- [ ] T011 [US4] Adicionar hook em `updateTrackCuration` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Importar:
    ```ts
    import { applyPivotDelta } from '@/lib/pivot-helpers';
    import { trackMoods, trackContexts } from '@/db/schema';
    ```
  - Após o UPDATE da track + applyVocabDelta (Inc 33), adicionar applyPivotDelta para moods/contexts:
    ```ts
    if (moodsChanged) {
      const { added, removed } = diffVocabArrays(prev.moods ?? [], payload.moods ?? []);
      await applyVocabDelta(user.id, 'moods', added, removed);  // Inc 33 (já existe)
      await applyPivotDelta(trackMoods, 'trackId', 'mood', parsed.data.trackId, added, removed);  // Inc 35 NOVO
    }
    if (contextsChanged) {
      const { added, removed } = diffVocabArrays(prev.contexts ?? [], payload.contexts ?? []);
      await applyVocabDelta(user.id, 'contexts', added, removed);
      await applyPivotDelta(trackContexts, 'trackId', 'context', parsed.data.trackId, added, removed);
    }
    ```
  - Try/catch defensivo (mesmo padrão Inc 33) — falha em pivot delta não rollba write principal.

## Phase 7: User Story 5 — Sync mantém pivot consistente (P3)

**Goal**: hooks em `applyDiscogsUpdate` mantém pivot de records (genres/styles) sincronizado.

**Independent test**: cenário 8 do quickstart — sync adiciona record com genres novos → pivot reflete.

- [ ] T012 [US5] Adicionar hook em `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts):
  - Importar:
    ```ts
    import { applyPivotDelta } from '@/lib/pivot-helpers';
    import { recordGenres, recordStyles } from '@/db/schema';
    ```
  - **Path INSERT** (record novo, ramo `created=true`):
    ```ts
    if (inserted.length > 0) {
      recordId = inserted[0].id;
      created = true;
      // Inc 33 (vocab) — já existe
      try {
        await applyVocabDelta(userId, 'genres', release.genres ?? [], []);
        await applyVocabDelta(userId, 'styles', release.styles ?? [], []);
      } catch (err) { ... }
      // Inc 35 (pivot) NOVO
      try {
        await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, release.genres ?? [], []);
        await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, release.styles ?? [], []);
      } catch (err) {
        console.error('[applyPivotDelta] erro pós-INSERT (sync):', err);
      }
    }
    ```
  - **Path UPDATE** (record existente). `existing[0]` já carrega `oldGenres`/`oldStyles` (Inc 33). Adicionar applyPivotDelta:
    ```ts
    if (wasArchived) {
      // Reaparição: re-INSERT estado completo (Inc 33 path replicado pra pivot).
      await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, release.genres ?? [], []);
      await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, release.styles ?? [], []);
      // Reaparição também precisa re-popular track_moods/track_contexts (Inc 35) das tracks do record.
      const trackRows = await db
        .select({ id: tracks.id, moods: tracks.moods, contexts: tracks.contexts })
        .from(tracks)
        .where(eq(tracks.recordId, recordId));
      for (const t of trackRows) {
        const ms = (t.moods ?? []) as string[];
        const cs = (t.contexts ?? []) as string[];
        if (ms.length > 0) await applyPivotDelta(trackMoods, 'trackId', 'mood', t.id, ms, []);
        if (cs.length > 0) await applyPivotDelta(trackContexts, 'trackId', 'context', t.id, cs, []);
      }
    } else {
      // Update normal: diff genres/styles.
      const gDiff = diffVocabArrays(oldGenres, release.genres ?? []);
      const sDiff = diffVocabArrays(oldStyles, release.styles ?? []);
      if (gDiff.added.length > 0 || gDiff.removed.length > 0) {
        await applyPivotDelta(recordGenres, 'recordId', 'genre', recordId, gDiff.added, gDiff.removed);
      }
      if (sDiff.added.length > 0 || sDiff.removed.length > 0) {
        await applyPivotDelta(recordStyles, 'recordId', 'style', recordId, sDiff.added, sDiff.removed);
      }
    }
    ```
  - Try/catch defensivo no bloco inteiro.
  - **Importante**: `tracks` recém-criadas via sync começam com `moods=[]`/`contexts=[]` (default schema). Não precisam de hook adicional (insert é cobertura natural pelo backfill se houver).

## Phase 8: Polish — build + commit + deploy + smoke

- [ ] T013 Build local final: `npm run build`. Confirmar zero erros TS em todos os arquivos modificados.

- [ ] T014 Verificar greps:
  - `grep -rn "json_each.*records\.genres\|json_each.*records\.styles\|json_each.*tracks\.moods\|json_each.*tracks\.contexts" src/` — esperado: zero ocorrências em código ativo.
  - `grep -rn "applyPivotDelta" src/` — esperado: definição em pivot-helpers.ts + 4+ usos em actions.ts/apply-update.ts.

- [ ] T015 Commit em branch `030-filter-pivots-and-sort-indexes` com mensagem `feat(030): pivot tables + sort indexes (Inc 35)`. Push branch.

- [ ] T016 Merge `030-filter-pivots-and-sort-indexes` → `main` com `--no-ff`. **NÃO PUSHE AINDA** se backfill prod (T018) ainda não rodou.

- [ ] T017 [US1] Aplicar migration em prod via `turso db shell sulco-prod` (10 statements):
  ```sql
  CREATE TABLE record_genres (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, genre TEXT NOT NULL, PRIMARY KEY (record_id, genre));
  CREATE INDEX record_genres_genre_idx ON record_genres(genre, record_id);
  CREATE TABLE record_styles (record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE, style TEXT NOT NULL, PRIMARY KEY (record_id, style));
  CREATE INDEX record_styles_style_idx ON record_styles(style, record_id);
  CREATE TABLE track_moods (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, mood TEXT NOT NULL, PRIMARY KEY (track_id, mood));
  CREATE INDEX track_moods_mood_idx ON track_moods(mood, track_id);
  CREATE TABLE track_contexts (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, context TEXT NOT NULL, PRIMARY KEY (track_id, context));
  CREATE INDEX track_contexts_context_idx ON track_contexts(context, track_id);
  CREATE INDEX records_user_archived_imported_idx ON records(user_id, archived, imported_at DESC);
  CREATE INDEX records_user_archived_archivedat_idx ON records(user_id, archived, archived_at DESC);
  ```

- [ ] T018 [US1] Rodar backfill em prod (mesmo padrão Inc 32-34: token efêmero turso CLI):
  ```bash
  turso db tokens create sulco-prod --expiration 1d > /tmp/turso_token_inc35.txt
  DATABASE_URL="libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io" \
  DATABASE_AUTH_TOKEN="$(cat /tmp/turso_token_inc35.txt)" \
  node scripts/_backfill-pivot-tables.mjs
  ```
  Aguardar conclusão (~3-5min).

- [ ] T019 **Gate verificável antes do push** — executar comando explícito:
  ```bash
  turso db shell sulco-prod "SELECT 'record_genres' AS t, COUNT(*) FROM record_genres UNION ALL SELECT 'record_styles', COUNT(*) FROM record_styles UNION ALL SELECT 'track_moods', COUNT(*) FROM track_moods UNION ALL SELECT 'track_contexts', COUNT(*) FROM track_contexts;"
  ```
  - **Se retornar 4 rows com COUNT > 0** → gate OK, prosseguir: `git push origin main`.
  - **Se retornar < 4 rows ou COUNT = 0 em algum** → ABORTAR push. Voltar a T018.

- [ ] T020 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready. Confirmar via `vercel ls sulco --yes | head -3`.

- [ ] T021 Validar EXPLAIN em prod (cenários 1, 2, 3 do quickstart):
  ```bash
  turso db shell sulco-prod "EXPLAIN QUERY PLAN SELECT id FROM records WHERE user_id = 2 AND archived = 0 AND id IN (SELECT record_id FROM record_genres WHERE genre IN ('Rock')) ORDER BY imported_at DESC LIMIT 50;"
  ```
  Esperado: `SEARCH records USING INDEX records_user_archived_imported_idx` + `LIST SUBQUERY` ou `SEARCH record_genres USING INDEX record_genres_genre_idx`. Sem `SCAN json_each` ou `TEMP B-TREE`.

- [ ] T022 Smoke test pós-deploy: rodar cenários 4, 5, 6, 7, 9 do [quickstart.md](./quickstart.md). Coletar `vercel logs sulco.vercel.app --follow > /tmp/inc35-smoke.log 2>&1`.
  - Cenário 4: load `/?genre=Rock` 5× consome ≤500 rows lidas total no dashboard Turso.
  - Cenário 5: load `/sets/[id]/montar?mood=solar` 5× consome ≤500 rows.
  - Cenário 6: paridade visual (mesmos discos retornados antes vs depois do deploy).
  - Cenário 7: edição de mood numa track persiste; novo mood aparece em filtro.
  - Cenário 9: smoke geral em todas rotas (/, /disco, /sets, /sets/[id], /montar, /status, /conta) + mobile.

- [ ] T023 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **030** — Pivot tables + sort indexes (Inc 35) · 2026-05-XX · specs/030-filter-pivots-and-sort-indexes/ · ...` com sumário (4 tabelas pivot + 2 indexes ORDER BY; substitui EXISTS json_each por IN subquery; ganho ~99% redução em filtros multi-select). Atualizar header `**Última atualização**`. Atualizar CLAUDE.md SPECKIT marker promovendo Inc 35 → "Prior active".

## Dependencies

- **T002 (schema TS)** ANTES de T003 (sqlite local migration) e T004 (helper importa schema).
- **T003 → T006** (sqlite local migration → backfill local).
- **T004 (helper)** ANTES de T007/T008/T011/T012 (callers importam helper).
- **T005 (script)** ANTES de T006 (rodar local) e T018 (rodar prod).
- **T007** (collection.ts) e **T008** (montar.ts): independentes, podem rodar em paralelo.
- **T011** (actions.ts) e **T012** (apply-update.ts): mesmo arquivo NÃO. actions.ts e apply-update.ts são arquivos diferentes — paralelizáveis. Sequenciais entre si por dependência de helper T004.
- **T013 (build)** depende de T002-T012.
- **T014 (greps)** depende de T013.
- **T015 (commit)** depende de T013+T014.
- **T016 (merge main local)** depende de T015.
- **T017 (migration prod)** ANTES de T018 (backfill prod).
- **T018 (backfill prod)** ANTES de T019 (gate). **CRÍTICO**.
- **T019 (gate)** depende de T016+T017+T018.
- **T020 (deploy)** depende de T019.
- **T021 (EXPLAIN prod)** depende de T020.
- **T022 (smoke)** depende de T020.
- **T023 (BACKLOG)** depende de T022 OK.

## Parallelization examples

Tasks `[P]` (independentes):

- T002 [P] — schema.ts
- T004 [P] — pivot-helpers.ts (depende só de T002)
- T005 [P] — script backfill
- T007 [P] [US1] — collection.ts
- T008 [P] [US2] — montar.ts (independente de T007)
- T011 [P] [US4] — actions.ts (independente de T012)
- T012 [P] [US5] — apply-update.ts (independente de T011)

Sequenciais (mesmo arquivo ou ordem importa):

- T003 → T006 (sqlite local migration → backfill local)
- T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 (commit → merge → migration → backfill → gate → deploy → EXPLAIN → smoke)

## MVP Scope (sugerido)

**MVP = US1 + US2 + US4 + US5** (T007 + T008 + T011 + T012) + Polish (T013-T022).

US3 (sort indexes) é gratuito — vem com T002 + T003. Validação via T009/T010 + EXPLAIN.

Tudo num único release. Esforço total ~5-6h.

## Implementation strategy

Sequência ótima:

1. **T001** (instantâneo)
2. **T002** (schema delta TS, ~10min)
3. **T003** (migration sqlite local, 1min)
4. **T004** (helper applyPivotDelta, ~30min)
5. **T005** (script backfill, ~25min)
6. **T006** (rodar backfill local, ~3min)
7. **T007** (refator collection.ts, ~10min)
8. **T008** (refator montar.ts, ~15min — buscar callers via grep)
9. **T009 + T010** (validar EXPLAINs locais, ~3min)
10. **T011** (hook em actions.ts updateTrackCuration, ~20min)
11. **T012** (hook em apply-update.ts, ~30min — incluindo lógica de reaparição)
12. **T013-T014** (build + greps, ~5min)
13. **T015** (commit + push branch, ~3min)
14. **T016** (merge main local, ~2min)
15. **T017** (migration prod, ~3min)
16. **T018** (backfill prod, ~3-5min)
17. **T019** (gate, 1min)
18. **T020** (deploy, ~3min)
19. **T021** (EXPLAIN prod, ~3min)
20. **T022** (smoke prod, ~15-20min)
21. **T023** (BACKLOG + CLAUDE.md, ~10min)

**Total estimado: ~5-6h**.

Após T022 OK, Inc 35 mata os 4 gargalos materiais identificados via EXPLAIN. Próxima feature pode voltar pra UX (Inc 30/31/29) ou continuar reads se algo aparecer (FTS5 = Inc 36).
