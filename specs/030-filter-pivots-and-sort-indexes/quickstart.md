# Quickstart — Inc 35 Filter pivots + sort indexes

**Feature**: 030-filter-pivots-and-sort-indexes
**Audience**: Mantenedor (validação manual via Vercel logs `[DB]` + dashboard Turso + EXPLAIN QUERY PLAN)

---

## Pré-requisitos

- Inc 32/33/34 deployados em prod.
- Migration aplicada em prod (4 CREATE TABLE + 6 CREATE INDEX) **antes** do code deploy.
- Backfill rodado em prod **antes** do code deploy.
- Inc 35 deployado em prod.
- Instrumentação `[DB]` ativa.

---

## Cenário 0 — Migration + backfill em prod (pré-deploy)

**Passos**:

1. Aplicar migration via `turso db shell sulco-prod` (10 statements):
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

2. Verificar:
   ```sql
   SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'record_%' OR name LIKE 'track_%';
   -- esperado: 4 rows
   SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx';
   -- esperado: 6 rows novos (+ índices pré-existentes)
   ```

3. Aplicar mesmo SQL local: `sqlite3 sulco.db < migration.sql`.

4. Rodar backfill local:
   ```bash
   node scripts/_backfill-pivot-tables.mjs
   ```

5. Verificar local:
   ```bash
   sqlite3 sulco.db "SELECT COUNT(*) FROM record_genres; SELECT COUNT(*) FROM record_styles; SELECT COUNT(*) FROM track_moods; SELECT COUNT(*) FROM track_contexts;"
   ```

6. Rodar backfill em prod:
   ```bash
   DATABASE_URL=libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io \
   DATABASE_AUTH_TOKEN=<token> \
   node scripts/_backfill-pivot-tables.mjs
   ```

7. Gate prod:
   ```sql
   SELECT 'record_genres' AS t, COUNT(*) FROM record_genres
   UNION ALL SELECT 'record_styles', COUNT(*) FROM record_styles
   UNION ALL SELECT 'track_moods', COUNT(*) FROM track_moods
   UNION ALL SELECT 'track_contexts', COUNT(*) FROM track_contexts;
   ```
   Esperado: 4 rows com COUNT > 0 cada.

---

## Cenário 1 — EXPLAIN filtro de gênero usa novo index (US1, FR-011)

**Passos**:
```bash
turso db shell sulco-prod "EXPLAIN QUERY PLAN SELECT id, artist, title FROM records WHERE user_id = 2 AND archived = 0 AND id IN (SELECT record_id FROM record_genres WHERE genre IN ('Rock')) ORDER BY imported_at DESC LIMIT 50;"
```

**Esperado**:
- `SEARCH records USING INDEX records_user_archived_imported_idx` (novo index ORDER BY)
- `LIST SUBQUERY` ou `SEARCH record_genres USING INDEX record_genres_genre_idx`
- **Sem** `SCAN json_each VIRTUAL TABLE`
- **Sem** `USE TEMP B-TREE FOR ORDER BY` (ORDER BY agora usa index direto)

---

## Cenário 2 — EXPLAIN listagem default sem TEMP B-TREE (US3, FR-012)

**Passos**:
```bash
turso db shell sulco-prod "EXPLAIN QUERY PLAN SELECT id, artist, title FROM records WHERE user_id = 2 AND archived = 0 ORDER BY imported_at DESC LIMIT 50;"
```

**Esperado**:
- `SEARCH records USING INDEX records_user_archived_imported_idx`
- **Sem** `USE TEMP B-TREE FOR ORDER BY`

---

## Cenário 3 — EXPLAIN filtro mood em montar (US2, FR-011)

**Passos**:
```bash
turso db shell sulco-prod "EXPLAIN QUERY PLAN SELECT tracks.id FROM tracks INNER JOIN records ON records.id = tracks.record_id WHERE records.user_id = 2 AND records.archived = 0 AND records.status = 'active' AND tracks.selected = 1 AND tracks.id IN (SELECT track_id FROM track_moods WHERE mood IN ('solar')) LIMIT 1000;"
```

**Esperado**:
- `SEARCH track_moods USING INDEX track_moods_mood_idx`
- **Sem** `SCAN json_each VIRTUAL TABLE`

---

## Cenário 4 — Load `/?genre=Rock` consome ~30-100 rows lidas (US1, SC-001)

**Passos**:
1. Anotar contador "Rows Read" no dashboard Turso ANTES.
2. Hard refresh em `sulco.vercel.app/?genre=Rock` 5×.
3. Aguardar 30s pra dashboard atualizar.
4. Anotar contador DEPOIS.

**Esperado**:
- Delta total ≤ 500 rows (5 loads × ~100 rows = ~500).
- Pré-Inc 35: 5 × ~10-15k = ~50-75k rows.

---

## Cenário 5 — Load `/sets/[id]/montar?mood=solar` ~50-100 rows lidas (US2, SC-003)

**Passos**:
1. Anotar contador.
2. Hard refresh em `sulco.vercel.app/sets/[id]/montar?mood=solar` 5×.
3. Anotar contador.

**Esperado**: delta ≤ 500 rows.

---

## Cenário 6 — Paridade visual pós-deploy (US1-5, SC-007)

**Passos**:
1. Antes do deploy: snapshot dos discos retornados em `/?genre=Rock`, `/?style=Soul`, `/sets/[id]/montar?mood=solar`.
2. Após deploy: re-abrir as mesmas URLs.
3. Comparar listas.

**Esperado**: conjuntos idênticos. Ordem pode mudar levemente (mesma chave de ORDER BY mas tie-breaking interno pode variar).

---

## Cenário 7 — Edição de mood persiste com pivot atualizado (US4, FR-009)

**Passos**:
1. Em `/disco/[ID]`, abrir picker de mood numa track.
2. Adicionar 1 mood novo + remover 1 mood existente.
3. Aguardar persist (auto-save).
4. Conferir nos logs `[DB]`:

**Esperado**:
- 1× SELECT prev (track moods/contexts).
- 1× UPDATE tracks.
- 1× UPSERT user_vocab (Inc 33).
- 1× UPDATE user_vocab decrement (Inc 33).
- 1× DELETE user_vocab cleanup (Inc 33).
- **1× DELETE track_moods removed (Inc 35)**.
- **1× INSERT track_moods added (Inc 35)**.
- Total ~7-8 ops, ≤300ms percebidos.

5. Aplicar filtro `?mood=<mood-novo>` em /sets/[id]/montar — track adicionada deve aparecer.

---

## Cenário 8 — Sync incremental atualiza pivot (US5, FR-007)

**Setup**: opcional, requer disparar sync manual ou adicionar disco via Discogs externo.

**Passos**:
1. Antes do sync: anotar entries em `record_genres` para algum record:
   ```sql
   SELECT genre FROM record_genres WHERE record_id = X;
   ```
2. Disparar sync manual via `/status` ou cron.
3. Após sync: re-conferir `record_genres`.

**Esperado**:
- Se metadata Discogs mudou (ex: gênero adicionado), entry nova aparece.
- Se gênero foi removido, entry some.
- Records novos têm entries criadas automaticamente.

---

## Cenário 9 — Smoke test fluxos principais (US1-5, SC-007)

**Passos** (em sequência):
1. `/` (default) — listagem + pickers OK.
2. `/?genre=Rock` — filtro funciona.
3. `/?genre=Rock&style=Soul` — filtro composto funciona.
4. `/?q=joao&genre=Rock&bomba=only` — filtro composto + busca textual funciona.
5. `/sets/[id]/montar` — pickers + candidatos OK.
6. `/sets/[id]/montar?mood=solar` — filtro mood funciona.
7. `/disco/[id]` — abrir disco, edição de mood persiste.
8. `/status` — banner archived OK; lista de archived ordenada.
9. **Mobile (viewport ≤640px)**: testar `/` + `/sets/[id]/montar` em mobile, pickers de filtros funcionam (Princípio V).

**Esperado**: nenhum erro 500/JS, nenhum picker vazio, todas as listas idênticas a pré-deploy.

---

## Cenário 10 — Medição global de impacto (SC-005, SC-008)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Sessão típica: 10 ações de filtragem variadas em `/` + 5 em `/montar` + edições de mood.
2. Anotar contador DEPOIS.

**Esperado**:
- Delta total ≤ 1.000 rows (vs ~150-200k baseline).
- Cota mensal: <50k reads/dia projetando 5-10 amigos.

---

## Encerramento

Cobertura mínima: cenários 0 (migration+backfill), 1+2+3 (EXPLAINs), 4+5 (medição rows lidas), 7 (edição), 9 (smoke).

Pós-validação OK:
- Inc 35 mata os 4 gargalos materiais identificados via EXPLAIN.
- Próximas features voltam pra UX (Inc 30/31/29 backlog).
- FTS5 (busca textual) fica como Inc 36 se ainda valer.

Se cenário 1 falhar (ainda mostra `SCAN json_each`):
- Verificar que `buildCollectionFilters` em collection.ts foi refatorado.
- Verificar que `queryCandidates` em montar.ts foi refatorado.

Se cenário 2 falhar (ainda mostra `TEMP B-TREE`):
- Verificar que `records_user_archived_imported_idx` foi criado em prod.
- Verificar que ORDER BY na query é exatamente `imported_at DESC`.

Se cenário 7 falhar (mood adicionado não aparece em filtro):
- Verificar hook em `updateTrackCuration` chama `applyPivotDelta(trackMoods, ...)`.
- Verificar via SQL: `SELECT * FROM track_moods WHERE track_id = X` retorna entry esperada.

Reversão se necessário:
```bash
git revert <commit-inc-35>
turso db shell sulco-prod "DROP INDEX records_user_archived_archivedat_idx; DROP INDEX records_user_archived_imported_idx; DROP TABLE track_contexts; DROP TABLE track_moods; DROP TABLE record_styles; DROP TABLE record_genres;"
vercel --prod --yes
```
~5min total.
