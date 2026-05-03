# Quickstart — Inc 33: Tabela `user_vocab` dedicada

**Feature**: 028-user-vocab-table
**Audience**: Mantenedor (validação manual via Vercel logs `[DB]` + dashboard Turso + SQL shell)

---

## Pré-requisitos

- Migration aplicada em prod (CREATE TABLE + CREATE INDEX) **antes** do code deploy.
- Backfill rodado em prod **antes** do code deploy.
- Inc 33 deployado em prod.
- Instrumentação `[DB]` ainda ativa (env var `DB_DEBUG` ≠ `"0"`).

---

## Cenário 0 — Migration + backfill em prod (pré-deploy)

**Passos**:

1. Aplicar migration via `turso db shell sulco-prod`:
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

2. Verificar criação:
   ```sql
   SELECT name FROM sqlite_master WHERE type='table' AND name='user_vocab';
   -- esperado: 1 row
   SELECT name FROM sqlite_master WHERE type='index' AND name='user_vocab_user_kind_idx';
   -- esperado: 1 row
   ```

3. Snapshot de paridade (antes do backfill, para conferência pós-deploy no cenário 6):
   ```sql
   SELECT user_id, json_array_length(moods_json) AS old_moods,
                   json_array_length(contexts_json) AS old_contexts,
                   json_array_length(genres_json) AS old_genres,
                   json_array_length(styles_json) AS old_styles,
                   json_array_length(shelves_json) AS old_shelves
   FROM user_facets;
   ```
   Anotar valores por user.

4. Rodar backfill local (sqlite):
   ```bash
   node scripts/_backfill-user-vocab.mjs
   ```

5. Verificar local:
   ```bash
   sqlite3 sulco.db "SELECT kind, COUNT(*) FROM user_vocab GROUP BY kind;"
   ```

6. Rodar backfill em prod:
   ```bash
   DATABASE_URL=libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io \
   DATABASE_AUTH_TOKEN=<token-prod> \
   node scripts/_backfill-user-vocab.mjs
   ```

7. Verificar pós-backfill em prod:
   ```sql
   SELECT user_id, kind, COUNT(*) AS terms FROM user_vocab GROUP BY user_id, kind;
   -- comparar contagens com snapshot do passo 3
   SELECT COUNT(*) FROM user_vocab WHERE ref_count = 0;
   -- esperado: 0
   ```

**Esperado**:
- Tabela criada, index criado, todos os 5 kinds populados pra cada user.
- Contagens equivalentes ao snapshot pré-backfill (paridade ±1 aceito por race em json_each lookup, mas idealmente exato).

---

## Cenário 1 — Edição de moods consome ≤10 rows (US1, SC-001)

**Passos**:
1. Terminal: `vercel logs sulco.vercel.app --follow > /tmp/inc33-c1.log 2>&1`
2. Browser: abrir `sulco.vercel.app/disco/[ID]` de um disco com tracks.
3. Em uma track, abrir picker de moods, adicionar 1 mood novo + remover 1 mood existente.
4. Aguardar Save (auto-save).
5. Ctrl+C no terminal.

**Esperado nos logs**:
- 1× SELECT `tracks WHERE id=?` (carregar moods/contexts antigos pra diff) — 1 row.
- 1× UPDATE `tracks SET moods=?, contexts=?` — 1 row affected.
- ~2× INSERT/UPDATE `user_vocab` (1 increment do termo novo + 1 decrement do removido).
- 0-1× DELETE `user_vocab WHERE ref_count=0` (cleanup).
- Outros loads esperados: 1× users (cached), 1× user_facets (cached) durante render do RSC pós-action.
- **TOTAL ≤ 10 rows lidos**.
- **ZERO ocorrências** de SELECT `tracks INNER JOIN records` retornando ~10k rows.

**Falha**: se aparecer query de scan de ~10k tracks → caminho antigo (`recomputeVocabularyOnly`) ainda ativo. T-XX não completou.

---

## Cenário 2 — Edição de shelfLocation consome ≤10 rows (US1, SC-002)

**Passos**:
1. Em `/disco/[ID]`, mudar prateleira via `<ShelfPicker>` (ex: "E1" → "E2").
2. Aguardar persist.
3. Conferir logs.

**Esperado**:
- 1× SELECT `records WHERE id=?` (carregar shelf antigo).
- 1× UPDATE `records SET shelf_location=?`.
- 1× UPDATE `user_vocab` decrement "E1" + 1× UPSERT `user_vocab` increment "E2".
- 0-1× DELETE cleanup.
- **TOTAL ≤ 10 rows**.
- **ZERO** SELECT DISTINCT scan em records.

---

## Cenário 3 — Archive consome ≤30 rows (US3, SC-003)

**Passos**:
1. Em prod, escolher 1 record com 5+ moods + 2 genres + 1 shelf preenchido.
2. Disparar archive (via `/status` ou ação manual).
3. Conferir logs.

**Esperado**:
- 1× SELECT `records WHERE id=?` (carregar genres/styles/shelf).
- 1× SELECT `tracks WHERE record_id=?` (carregar moods/contexts).
- 1× UPDATE `records SET archived=true`.
- N decrements + 1 cleanup em `user_vocab` (N = soma de termos do record + tracks).
- **TOTAL ≤ 30 rows lidos** (mesmo com record robusto).
- **ZERO** chamada a `recomputeFacets` síncrona.

---

## Cenário 4 — Pickers refletem vocab em uso (US2, SC-006)

**Passos**:
1. Antes: snapshot dos termos em pickers (em `/sets/[id]/montar`, anotar moods/contexts disponíveis).
2. Após deploy: re-abrir os pickers.
3. Comparar.

**Esperado**:
- Conjunto idêntico (paridade visual 100%) pra usuários que não fizeram edições no intervalo.
- Ordem por frequência DESC (mais usados primeiro) — pode mudar levemente vs Inc 28 (que ordenava por `ref_count` derivado).

---

## Cenário 5 — Cron diário corrige drift (US4, SC-007)

**Setup**: introduzir drift manual via SQL.

**Passos**:
1. Em prod, executar:
   ```sql
   UPDATE user_vocab SET ref_count = 999 WHERE user_id = 1 AND kind = 'moods' AND term = 'solar';
   ```
2. Confirmar drift:
   ```sql
   SELECT term, ref_count FROM user_vocab WHERE user_id = 1 AND kind = 'moods' AND term = 'solar';
   -- ref_count=999
   ```
3. Disparar cron manualmente (ou aguardar 24h):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://sulco.vercel.app/api/cron/sync-daily
   ```
4. Re-conferir:
   ```sql
   SELECT term, ref_count FROM user_vocab WHERE user_id = 1 AND kind = 'moods' AND term = 'solar';
   -- esperado: ref_count = valor real (provavelmente <50)
   ```

**Esperado**: ref_count corrigido em ≤30s após cron rodar.

---

## Cenário 6 — Paridade pós-deploy (smoke crítico, SC-006)

**Passos**:
1. Comparar lista de termos em cada kind, antes (cenário 0 snapshot) vs depois (post-deploy):
   ```sql
   SELECT kind, COUNT(*) FROM user_vocab WHERE user_id = ? GROUP BY kind;
   ```
2. Comparar com `json_array_length(*_json)` em `user_facets`.

**Esperado**:
- Contagens batem por user × kind (±1 aceito por edge cases).
- Picker em `/sets/[id]/montar` mostra mesma lista que antes do deploy.

---

## Cenário 7 — Curadoria intensiva: 30 toggles consomem ≤500 rows (SC-004)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Sessão típica: 30 toggles de moods/contexts em 10 discos diferentes.
2. Anotar contador depois.

**Esperado**:
- Delta de rows lidas ≤ 500 (vs ~300.000 antes do Inc 33).

---

## Cenário 8 — Smoke test fluxos principais (SC-005)

**Passos** (em sequência):
1. `/` (listagem default) — pickers de genres/styles/shelves carregam. ✓
2. `/?genre=Rock` — filtro funciona, lista atualiza. ✓
3. `/sets/[id]/montar` — pickers de moods/contexts carregam, filtros funcionam. ✓
4. `/disco/[id]` — chip pickers de moods/contexts carregam, edição persiste. ✓
5. Ações de archive + restore via /status — vocab atualiza imediatamente. ✓
6. **Mobile (viewport ≤640px)** em `/sets/[id]/montar`: bottom sheet de moods carrega, lista mostra termos em uso. (Princípio V — verificar tap targets ≥44px preservados.)

**Esperado**: nenhum picker vazio, nenhum erro 500/JS.

---

## Cenário 9 — Medição global de impacto (SC-008)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES (1× snapshot).

**Passos**:
1. 24h de uso normal (curadoria + montar set + sync diário).
2. Conferir contador depois.

**Esperado**:
- Delta de rows ≤ 50k em 24h (vs ~500k-2M antes do Inc 33 em curadoria intensa).
- Cota mensal Turso (500M reads) sustentada por 5-10 amigos no free tier.

---

## Encerramento

Cobertura mínima: cenários 0 (migration+backfill), 1 (moods edit), 2 (shelf edit), 3 (archive), 4 (paridade pickers), 6 (paridade pós-deploy), 8 (smoke).

Pós-validação OK:
- Inc 34 (drop colunas `*Json` em `user_facets`) é o próximo passo (~30min cleanup separado).

Se cenário 1/2/3 falhar (ainda aparecem queries de scan ~10k):
- Verificar se `recomputeVocabularyOnly`/`recomputeShelvesOnly` foram REMOVIDOS (não só comentados).
- Verificar se hooks novos em `applyVocabDelta` foram adicionados nos Server Actions corretos.
- Verificar se backfill rodou em prod (`SELECT COUNT(*) FROM user_vocab`).
