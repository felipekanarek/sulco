# Quickstart — Inc 34: Drop colunas `*Json` em `user_facets`

**Feature**: 029-drop-user-facets-json
**Audience**: Mantenedor (smoke manual + verificação SQL)

## Pré-requisitos

- Inc 33 (`user_vocab`) deployado e validado em prod.
- Code deploy do Inc 34 aplicado.
- Migration prod (`ALTER TABLE DROP COLUMN × 5`) aplicada.
- Instrumentação `[DB]` ativa.

---

## Cenário 0 — Code deploy ANTES, migration depois

**Passos**:

1. Fazer commit + push + `vercel --prod --yes`.
2. Aguardar Ready (~1min).
3. Aplicar migration via `turso db shell sulco-prod`:
   ```sql
   ALTER TABLE user_facets DROP COLUMN genres_json;
   ALTER TABLE user_facets DROP COLUMN styles_json;
   ALTER TABLE user_facets DROP COLUMN moods_json;
   ALTER TABLE user_facets DROP COLUMN contexts_json;
   ALTER TABLE user_facets DROP COLUMN shelves_json;
   ```
4. Aplicar mesmo SQL local: `sqlite3 sulco.db < migration.sql`.
5. Verificar:
   ```bash
   sqlite3 sulco.db "PRAGMA table_info(user_facets);"
   ```
   Esperado: 7 colunas (user_id, records_total, records_active, records_unrated, records_discarded, tracks_selected_total, updated_at). Zero colunas com sufixo `_json`.

---

## Cenário 1 — `/` carrega normalmente (US2, SC-003)

**Passos**:
1. Browser: hard refresh em `sulco.vercel.app/`.
2. Verificar visualmente: pickers de gêneros/estilos populados; lista de discos renderiza; contador de coleção (total/ativos/etc.) aparece.

**Esperado**:
- Mesmos termos no picker que antes do deploy (paridade com Inc 33 `listVocab`).
- Contadores corretos.
- Zero erros 500 ou JS.

**Falha**: se algum picker vazio → caller não migrado pra `listVocab` (Inc 33 incompleto). Investigar via grep.

---

## Cenário 2 — `/sets/[id]/montar` carrega normalmente

**Passos**:
1. Abrir set existente em `/sets/[id]/montar`.
2. Verificar pickers de moods e contexts populados (via `listSelectedVocab` → `listVocab`).
3. Aplicar filtro mood, verificar lista atualiza.

**Esperado**: filtros funcionam, listas idênticas ao pré-deploy.

---

## Cenário 3 — Edição persiste (US2)

**Passos**:
1. Em `/disco/[id]`, editar mood numa track.
2. Verificar nos logs `[DB]`: ~4 rows write path + 1 UPSERT em `user_vocab`.
3. Re-abrir picker — mood novo aparece.

**Esperado**: caminho do Inc 33 intacto (não foi tocado pelo Inc 34).

---

## Cenário 4 — `recomputeFacets` mais barato (US3, SC-005)

**Setup**: instrumentação `[DB]` ativa.

**Passos**:
1. Disparar cron diário manualmente:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://sulco.vercel.app/api/cron/sync-daily
   ```
2. Coletar logs `[DB]` durante execução.

**Esperado**:
- 2 SELECTs de counters (`aggregateCounts` + `aggregateTracksSelected`) — antes eram 7 SELECTs.
- Re-população de `user_vocab` (~3 SELECTs adicionais via `_repopulateVocab`).
- TOTAL: ~5 SELECTs em `recomputeFacets` vs ~10 antes do Inc 34.
- INSERT em `user_facets` com 6 fields (não mais 12).

**Falha**: se aparecer query de `aggregateFacet`/`aggregateVocabulary`/`aggregateShelves` → helpers não removidos. Investigar.

---

## Cenário 5 — Schema enxuto (US1, SC-001/SC-002)

**Passos**:
1. `grep -rn "genresJson\|stylesJson\|moodsJson\|contextsJson\|shelvesJson" src/`
2. `grep -rn "aggregateFacet\|aggregateVocabulary\|aggregateShelves" src/`

**Esperado**:
- Primeiro grep: zero ocorrências em código ativo. Pode aparecer em comentários/doc strings descrevendo histórico (aceitável se claramente histórico).
- Segundo grep: zero ocorrências (3 helpers deletados).

---

## Cenário 6 — Build TS limpo (SC-004)

**Passos**:
```bash
npm run build
```

**Esperado**: zero erros TS. Tipo `UserFacets` enxugou; nenhum caller acessava os 5 campos removidos.

**Falha**: se compilar falhar com `Property 'genres' does not exist on type 'UserFacets'` → caller esquecido. Migrar pra `listVocab` antes do deploy.

---

## Cenário 7 — Smoke geral

**Passos** (em sequência):
1. `/` (sem busca) — picker genres/styles + contador OK.
2. `/?q=joao` — busca funciona.
3. `/sets/[id]/montar` — pickers moods/contexts OK.
4. `/disco/[id]` — chip pickers OK; edição de mood persiste.
5. `/status` — banner archived OK; contadores OK.
6. Mobile (viewport ≤640px) em qualquer rota — Princípio V preservado.

**Esperado**: nenhum erro 500/JS/picker vazio.

---

## Encerramento

Cobertura mínima: cenários 0 (deploy + migration), 1+2 (smoke pickers), 6 (build TS), 7 (smoke geral).

Pós-validação OK:
- Inc 34 fecha o ciclo de cleanup pós-Inc 33. Próximas features voltam pra UX (Inc 30/31/29).
- Reads/dia continuam baixos. Cron diário ~5 SELECTs a menos por user.

Se algum cenário falhar:
- Verificar via grep que helpers mortos foram removidos.
- Verificar que `getUserFacets` callers não acessam mais os 5 campos.
- Reversão: `git revert` + `ALTER TABLE user_facets ADD COLUMN ... DEFAULT '[]'` × 5.
