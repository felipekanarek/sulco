# Tasks: Search text materializado em records (Inc 32)

**Input**: Design documents from `specs/027-search-text-materialized/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Tests**: validação manual via quickstart + medição via Vercel logs `[DB]` + dashboard Turso

**Modo de implementação**: cuidadoso. **Ordem crítica**: schema delta → backfill → deploy de código. Inverter quebra busca em prod (LIKE casa contra `''`).

## Phase 1: Setup

- [X] T001 Confirmar status — feature dir `specs/027-search-text-materialized/` + spec + plan + research + data-model + contracts + quickstart já criados nesta sessão. Branch `027-search-text-materialized` ativa.

## Phase 2: Foundational (helpers + schema delta antes das US)

### Helper de normalização

- [X] T002 Adicionar helper `computeRecordSearchText(artist, title, label)` em [src/lib/text.ts](../../src/lib/text.ts), conforme [contracts/search-text-helper.md](./contracts/search-text-helper.md):
  ```ts
  export function computeRecordSearchText(
    artist: string,
    title: string,
    label: string | null,
  ): string {
    return normalizeText([artist, title, label ?? ''].join(' '));
  }
  ```
  Importa `normalizeText` já existente. Mantém `normalizeText` intacto. Build local pra confirmar tipos.

### Schema delta

- [X] T003 Adicionar `searchText` à tabela `records` em [src/db/schema.ts](../../src/db/schema.ts):
  - Adicionar field: `searchText: text('search_text').notNull().default('')`.
  - Adicionar index na lista de indexes da table: `recordsUserSearchTextIdx: index('records_user_search_text_idx').on(t.userId, t.searchText)`.
  - Build local pra confirmar tipo (campo agora aparece em `records.$inferSelect`/`$inferInsert`).

- [X] T004 Aplicar migration SQL em sqlite local (dev):
  ```bash
  sqlite3 sulco.db <<'SQL'
  ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
  CREATE INDEX records_user_search_text_idx ON records(user_id, search_text);
  SQL
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "PRAGMA table_info(records);" | grep search_text
  sqlite3 sulco.db ".indexes records" | grep search_text
  ```

### Script de backfill

- [X] T005 Criar `scripts/_backfill-search-text.mjs` (mesmo padrão Inc 24/27/28):
  ```js
  import { createClient } from '@libsql/client';
  import path from 'node:path';

  const envUrl = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const url = envUrl && envUrl.length > 0
    ? envUrl
    : `file:${path.join(process.cwd(), 'sulco.db')}`;
  const db = createClient(authToken ? { url, authToken } : { url });

  console.log(`[backfill] DB: ${url.startsWith('libsql') ? 'turso' : 'sqlite local'}`);

  // Re-implementação inline da normalizeText (script Node não importa de TS)
  function normalize(s) {
    return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }
  function compute(artist, title, label) {
    return normalize([artist, title, label ?? ''].join(' '));
  }

  const rows = (await db.execute('SELECT id, artist, title, label FROM records')).rows;
  console.log(`[backfill] ${rows.length} records encontrados`);
  let updated = 0;
  for (const r of rows) {
    const searchText = compute(String(r.artist), String(r.title), r.label == null ? null : String(r.label));
    await db.execute({
      sql: 'UPDATE records SET search_text = ? WHERE id = ?',
      args: [searchText, Number(r.id)],
    });
    updated += 1;
    if (updated % 500 === 0) console.log(`✓ ${updated}/${rows.length}`);
  }
  console.log(`[backfill] done: ${updated} records updated`);
  process.exit(0);
  ```

- [X] T006 Rodar backfill em sqlite local:
  ```bash
  node scripts/_backfill-search-text.mjs
  ```
  Verificar:
  ```bash
  sqlite3 sulco.db "SELECT COUNT(*) AS empty FROM records WHERE search_text = '';"
  # Esperado: 0
  sqlite3 sulco.db "SELECT id, artist, title, search_text FROM records LIMIT 3;"
  # Esperado: search_text populado
  ```

## Phase 3: User Story 1 — DJ busca eficiente (P1)

**Goal**: substituir JS post-filter por SQL LIKE contra `search_text`. Paginação SQL volta a funcionar com text filter.

**Independent test**: cenários 1, 2, 3, 4 do quickstart — load `/?q=joao` consome ≤ 50 rows; cobertura accent/case-insensitive preservada.

- [X] T007 [US1] Refatorar `buildCollectionFilters` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):
  - Importar `normalizeText` de `@/lib/text`.
  - Remover flag `omitText` da assinatura (ou manter `omitText: false` como default sem efeito; preferir remover).
  - Substituir o ramo de text filter por:
    ```ts
    if (q.text.length > 0) {
      const normalized = normalizeText(q.text);
      conds.push(sql`${records.searchText} LIKE ${`%${normalized}%`}`);
    }
    ```
  - **Não usar mais** `lower(${records.artist}) LIKE ?` etc. — eliminado pelo refactor.

- [X] T008 [US1] Refatorar `queryCollection` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts):
  - Remover branch condicional `hasTextFilter` que carregava tudo + JS slice.
  - Sempre fazer SQL com `LIMIT pageSize OFFSET offset`.
  - Remover `matchesNormalizedText` import + chamada JS post-query.
  - Build local pra confirmar zero erros.

- [X] T009 [US1] Refatorar `pickRandomUnratedRecord` em [src/lib/actions.ts](../../src/lib/actions.ts):
  - Remover branch condicional fast/slow path.
  - Sempre usar fast path SQL `ORDER BY RANDOM() LIMIT 1` — agora SQL filtra correto mesmo com text filter (Decisão 8 do research).
  - Remover JS post-filter + `Math.random()` JS path.
  - Build local pra confirmar zero erros.

- [X] T010 [US1] Auditar callers de `omitText` em [src/lib/queries/collection.ts](../../src/lib/queries/collection.ts) e quaisquer outros arquivos:
  ```bash
  grep -rn "omitText" src/
  ```
  Esperado: zero ocorrências pós-T007. Se aparecer em algum caller, remover argumento (a flag não existe mais).

## Phase 4: User Story 2 — Sync mantém atualizado (P2)

**Goal**: hooks em writes computam `search_text` ao gravar/atualizar records.

**Independent test**: cenário 5 do quickstart — sync incremental atualiza `search_text` automaticamente.

- [X] T011 [US2] Adicionar hook em `applyDiscogsUpdate` em [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts):
  - Importar `computeRecordSearchText` de `@/lib/text`.
  - Localizar ponto onde payload de INSERT/UPDATE em records é montado (`db.insert(records).values({...})` ou `db.update(records).set({...})`).
  - Adicionar `searchText: computeRecordSearchText(artist, title, label)` ao payload.
  - Confirmar que mesmo helper é usado tanto no INSERT quanto no UPDATE (evitar drift).
  - Build local + grep `searchText` pra confirmar 1+ ocorrência aqui.

- [X] T012 [US2] Adicionar hook em `runInitialImport` em [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts):
  - **Sub-step de verificação primeiro**:
    ```bash
    grep -n "applyDiscogsUpdate\|insert.*records\|db\.insert(records)" src/lib/discogs/import.ts
    ```
  - Se `runInitialImport` chama `applyDiscogsUpdate` no loop → T011 cobre, T012 vira **apenas verificação** (sem mudança de código).
  - Se `runInitialImport` faz INSERT direto em `records` (sem passar por `applyDiscogsUpdate`) → adicionar hook explícito: importar `computeRecordSearchText` e incluir `searchText: computeRecordSearchText(artist, title, label)` no payload.

- [X] T013 [US2] Verificar que NÃO há outros caminhos de write em `records.artist`/`title`/`label`:
  ```bash
  grep -rn "records\.artist\|records\.title\|records\.label" src/lib/
  ```
  Esperado: apenas leitura em queries + writes em sync paths já cobertos por T011/T012. Se houver algum outro write (pouco provável), adicionar hook lá também.

## Phase 5: User Story 3 — Backfill popula existentes (P2)

**Goal**: rodar script de backfill em prod com env de produção. Garantir 100% records têm `search_text` populado antes do code deploy.

**Independent test**: cenário 6 + sub-step do cenário 0 do quickstart — pós-backfill, `SELECT COUNT(*) WHERE search_text = ''` retorna 0.

- [X] T014 [US3] Aplicar migration em prod via `turso db shell sulco-prod`:
  ```sql
  ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
  CREATE INDEX records_user_search_text_idx ON records(user_id, search_text);
  ```
  Verificar:
  ```sql
  PRAGMA table_info(records);
  -- search_text deve aparecer
  SELECT name FROM sqlite_master WHERE type='index' AND name='records_user_search_text_idx';
  -- deve retornar 1 row
  ```

- [X] T015 [US3] Rodar backfill em prod (com env Vercel ou turso CLI tokens):
  ```bash
  DATABASE_URL=libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io \
  DATABASE_AUTH_TOKEN=<token> \
  node scripts/_backfill-search-text.mjs
  ```
  Verificar via turso shell:
  ```sql
  SELECT COUNT(*) AS empty FROM records WHERE search_text = '';
  -- esperado: 0
  SELECT id, artist, title, search_text FROM records LIMIT 5;
  -- esperado: search_text populado e normalizado
  ```

## Phase 6: Polish — build + commit + deploy + smoke

- [X] T016 Build local final: `npm run build`. Confirmar zero erros TypeScript em todos os arquivos modificados (schema.ts, text.ts, collection.ts, actions.ts, apply-update.ts, import.ts).

- [X] T017 Verificar grep final:
  - `grep -rn "matchesNormalizedText" src/` — esperado: zero (helper era usado só em queryCollection JS path; pode permanecer em src/lib/text.ts como helper exportado, mas sem callers em queries).
  - `grep -rn "omitText" src/` — esperado: zero.
  - `grep -rn "computeRecordSearchText" src/` — esperado: 1× definição em text.ts + ≥2× usos em apply-update.ts/import.ts.

- [X] T018 Commit em branch `027-search-text-materialized` com mensagem `feat(027): search text materializado em records (Inc 32)`. Push branch.

- [X] T019 Merge `027-search-text-materialized` → `main` com `--no-ff`. **NÃO PUSHE AINDA** se backfill prod (T015) ainda não rodou. Verifica em ordem.

- [X] T020 **Gate verificável antes do push** — executar comando explícito:
  ```bash
  turso db shell sulco-prod "SELECT COUNT(*) AS empty FROM records WHERE search_text = ''"
  ```
  - **Se retornar `0`** → pré-condições OK, prosseguir: `git push origin main`.
  - **Se retornar > 0** → ABORTAR push. Voltar a T015 (rodar backfill prod). Re-checar.
  
  Pré-condições implícitas validadas pelo comando: T014 (migration prod aplicada — senão coluna não existe e SELECT falha) + T015 (backfill executado — senão count > 0).
  
  **Por que crítico**: se code deploy entra antes do backfill completo, queries `LIKE search_text` casam contra `''` (todos records pré-backfill), busca retorna 0. Regressão funcional grave em prod.

- [X] T021 Deploy prod manual:
  ```bash
  vercel --prod --yes
  ```
  Aguardar Ready (~1min). Confirmar via `vercel ls sulco --yes | head -3`.

- [X] T022 Smoke test pós-deploy: rodar cenários 1, 2, 3, 4, 8 do [quickstart.md](./quickstart.md). Coletar output de `vercel logs sulco.vercel.app --follow > /tmp/inc32-smoke.log 2>&1 &` durante cada cenário.
  - Cenário 1 (paginação SQL com text): query records retorna ≤ 50 rows (não 2588).
  - Cenário 2 (cobertura accent): `?q=acucar` encontra "Açúcar Amargo".
  - Cenário 3 (cobertura case): `?q=JOAO` encontra "João".
  - Cenário 4 (paginação): `?q=algo&page=2` retorna OFFSET 50.
  - Cenário 8 (smoke geral): nenhum erro 500/JS em `/`, `/disco/[id]`, `/sets/[id]/montar`, `/status`.

- [X] T023 BACKLOG release entry em [BACKLOG.md](../../BACKLOG.md): adicionar entrada `- **027** — Search text materializado em records (Inc 32) · 2026-05-02 · specs/027-search-text-materialized/ · ...` com sumário (coluna `search_text` materializada + index + hooks em sync; LIKE SQL substitui JS post-filter; paginação SQL volta a funcionar com text filter; load `/?q=` cai de ~2588 → ≤50 rows; cobertura accent/case preservada). Remover Inc 32 da seção `🟢 Próximos`.

## Dependencies

- **T002 (helper)** ANTES de T011/T012 (hooks importam o helper).
- **T003 (schema delta TS)** ANTES de T004 (aplicar SQL local).
- **T004 (sqlite local migration)** ANTES de T006 (backfill local).
- **T005 (script backfill)** ANTES de T006 (executar local) e T015 (executar prod).
- **T006 (backfill local)** valida script antes de prod.
- **T007 → T008 → T009 → T010**: cadeia de refatores em queries (collection.ts → actions.ts).
- **T011, T012, T013** (US2): independentes entre si após T002, mas todos modificam discogs/.
- **T014 (migration prod)** ANTES de T015 (backfill prod).
- **T015 (backfill prod)** ANTES de T020/T021 (push + deploy de código). **CRÍTICO**.
- **T016 (build)** depende de T002-T013 completos.
- **T017 (grep)** depende de T016.
- **T018 (commit)** depende de T016 + T017.
- **T019 (merge main local)** depende de T018.
- **T020 (push)** depende de T014 + T015 + T019.
- **T021 (deploy)** depende de T020.
- **T022 (smoke)** depende de T021.
- **T023 (BACKLOG)** independe de smoke; pode ser feito em paralelo, mas só commitado após T022 confirmar sucesso.

## Parallelization examples

Tasks `[P]` (independentes):

- T002 [P] — text.ts (helper novo)
- T003 [P] — schema.ts
- T005 [P] — script backfill

Sequenciais (mesmo arquivo ou ordem importa):

- T004 → T006 (sqlite local migration depois backfill)
- T007 → T008 → T009 → T010 (cadeia em collection.ts/actions.ts)
- T011 → T012 → T013 (cadeia em discogs/)
- T014 → T015 (migration prod → backfill prod)
- T015 → T020 → T021 → T022 (backfill prod → push → deploy → smoke)

## MVP Scope (sugerido)

**MVP = US1 (T007-T010) + US3 (T014-T015)**:
- US1 desbloqueia paginação SQL (ataca o gargalo identificado).
- US3 garante backfill em prod (sem ele, US1 quebra a busca).
- US2 (sync hooks) é necessário pra sync futuro **funcionar**, mas pode ser feito junto sem custo.

Recomendo shipar tudo num único release dado tamanho.

## Implementation strategy

Sequência ótima:

1. **T001** (instantâneo)
2. **T002** (helper, 5min)
3. **T003** (schema TS, 3min)
4. **T004** (sqlite local migration, 1min)
5. **T005** (script backfill, 15min)
6. **T006** (rodar backfill local, 1min)
7. **T007 → T008 → T009 → T010** (refator queries collection + actions, 30min)
8. **T011 → T012 → T013** (hooks discogs, 20min)
9. **T016** (build, 3min)
10. **T017** (grep final, 3min)
11. **T018** (commit branch, 2min)
12. **T014** (migration prod via turso shell, 2min)
13. **T015** (backfill prod, 2min — depende de ~2.6k records, ~1 min execução)
14. **T019** (merge main local, 1min)
15. **T020** (push, 1min)
16. **T021** (deploy prod, 3min + 1min wait)
17. **T022** (smoke test prod, 15min)
18. **T023** (BACKLOG entry, 5min)

**Total estimado: ~2h**.

Após T022 OK, instrumentação `[DB]` continua ligada pra futuras investigações. Pode desligar via `DB_DEBUG=0` quando preferir.
