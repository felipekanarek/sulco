# Quickstart — Inc 24: Denormalização user_facets

**Feature**: 023-user-facets-denormalization
**Audience**: Felipe (validação manual + medição via dashboard Turso)

---

## Cenário 0 — Migration + backfill em PROD (pré-deploy)

**Passos**:

1. Aplicar migration SQL via `turso db shell sulco-prod`:
   ```sql
   CREATE TABLE IF NOT EXISTS user_facets (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     genres_json TEXT NOT NULL DEFAULT '[]',
     styles_json TEXT NOT NULL DEFAULT '[]',
     moods_json TEXT NOT NULL DEFAULT '[]',
     contexts_json TEXT NOT NULL DEFAULT '[]',
     shelves_json TEXT NOT NULL DEFAULT '[]',
     records_total INTEGER NOT NULL DEFAULT 0,
     records_active INTEGER NOT NULL DEFAULT 0,
     records_unrated INTEGER NOT NULL DEFAULT 0,
     records_discarded INTEGER NOT NULL DEFAULT 0,
     tracks_selected_total INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT (unixepoch())
   );

   SELECT name FROM sqlite_master WHERE type='table' AND name='user_facets';
   ```

2. Backfill (depois da migration, ANTES do deploy de código):
   ```bash
   DATABASE_URL=libsql://sulco-prod-... \
   DATABASE_AUTH_TOKEN=... \
   node scripts/_backfill-user-facets.mjs
   ```
3. Confirmar via SQL:
   ```sql
   SELECT user_id, records_total, records_active, json_array_length(genres_json) AS n_genres,
          json_array_length(shelves_json) AS n_shelves
   FROM user_facets;
   ```

**Esperado**:
- Tabela criada (1 row no `sqlite_master`).
- Backfill imprime `✓ user N` pra cada user existente.
- Query final mostra row populada com contadores e listas
  refletindo a coleção atual.

---

## Cenário 1 — Volume de reads cai >90% por load (US1, SC-001/SC-002)

**Setup**: anotar contador `Rows Read` no dashboard Turso ANTES.

**Passos**:
1. Hard refresh `/` (Cmd+Shift+R).
2. Aguardar 30s.
3. Conferir contador.
4. Cmd+R simples na home.
5. Conferir.

**Esperado**:
- 1ª carga (cache miss): ≤1.5k reads (antes ~50k).
- 2ª carga: similar ~1.5k (sem cache, mas SQL muito mais barato).
- Delta esperado por load: queryCollection paginado (~400) +
  getUserFacets (1) + auth (~5) + banners (~10) ≈ ~500 reads.

---

## Cenário 2 — `/sets/[id]/montar` (US1, SC-002)

**Passos**:
1. Anotar contador.
2. Abrir set existente em montar.
3. Conferir.

**Esperado**:
- Volume: queryCandidates (LIMIT 1000) ~1k + listUserVocabulary
  (1 SELECT da row) + auth + banners ≈ ~1.1k reads (vs ~12k antes
  por causa de listUserVocabulary).

---

## Cenário 3 — DJ ativa um disco e contadores refletem imediato (US2, SC-004)

**Passos**:
1. Anotar `recordsActive` SQL: `SELECT records_active FROM user_facets WHERE user_id=<USER_ID>;`.
2. Em `/`, ativar 1 disco unrated via `<RecordStatusActions>` (Inc 19).
3. Confirmar visualmente que voltou pra home.
4. Re-rodar SQL.

**Esperado**:
- `records_active` incrementou em 1.
- `records_unrated` decrementou em 1.
- `records_total` permanece igual.
- `updated_at` da row é recente (≤1s atrás).

---

## Cenário 4 — DJ adiciona prateleira nova → vocabulário reflete (US2, SC-004)

**Passos**:
1. Em `/disco/[id]`, abrir picker de prateleira (Inc 21).
2. Digitar nome novo (ex: "TESTE-Z9") e clicar "+ Adicionar".
3. Abrir `/disco/[outro_id]` e abrir picker.

**Esperado**:
- Lista de prateleiras inclui "TESTE-Z9".
- `getUserFacets` retornou row atualizada (recompute disparou em
  `updateRecordAuthorFields`).

---

## Cenário 5 — DJ ativa moods em uma faixa → vocabulário aparece (US2)

**Passos**:
1. Em `/disco/[id]`, adicionar mood novo (ex: "atmosférico") a
   uma faixa.
2. Abrir `/sets/[id]/montar` em set qualquer.
3. Buscar/filtrar por mood.

**Esperado**:
- Vocabulário de moods sugere "atmosférico".
- `moods_json` da row contém o termo.

---

## Cenário 6 — Multi-user isolation (US3, SC-006)

**Setup**: 2 contas (DJ A, DJ B).

**Passos**:
1. DJ A: anotar `records_total` da row de A.
2. DJ A: edita 1 disco (qualquer mudança que dispare recompute).
3. SQL: `SELECT user_id, records_total, updated_at FROM user_facets;`.

**Esperado**:
- Apenas a row de DJ A teve `updated_at` atualizado.
- Row de DJ B intacta (mesmo `updated_at`, mesmos contadores).

---

## Cenário 7 — Recompute ≤500ms (SC-005)

**Passos**:
1. Em DevTools Network, abrir aba Performance.
2. Editar 1 disco.
3. Medir tempo total da Server Action (do clique até resposta).

**Esperado**:
- Action retorna em ≤700ms (write principal + recompute síncrono).

---

## Cenário 8 — Falha de recompute não bloqueia write (FR-008)

**Setup**: simular DB indisponível durante recompute (parar Turso
local OU cortar conexão durante teste).

**Passos**:
1. Em dev local com sqlite, editar disco.
2. Simular falha durante recompute.

**Esperado**:
- Write principal é completado.
- Console loga `[recomputeFacets] erro pós-write:`.
- Action retorna `{ ok: true }` (não rollback).
- Próximo write tenta recompute de novo.

---

## Cenário 9 — Row ausente retorna defaults (FR-005)

**Setup**: DELETE manualmente row do user_facets pra simular
estado pré-backfill:
```sql
DELETE FROM user_facets WHERE user_id=<USER_ID>;
```

**Passos**:
1. Abrir `/`.
2. Verificar UI.

**Esperado**:
- UI carrega sem crash.
- Contadores mostram 0; filtros vazios.
- Próximo write dispara recompute e popula a row.

---

## Cenário 10 — Sync invalida facets (US2, SC-004)

**Passos**:
1. Anotar `records_total` atual.
2. Disparar sync manual (ou aguardar daily).
3. Verificar SQL de novo.

**Esperado**:
- `records_total` atualizado se sync trouxe novos records.
- `updated_at` recente.

---

## Cenário 11 — Medição global (SC-003)

**Passos**:
1. Anotar contador Turso ANTES.
2. Sessão típica: home + 3 discos + 1 montar + 5 random clicks.
3. Anotar contador.

**Esperado**:
- Total ≤5k reads (vs ~250k antes do Inc 24).
- Em uso de dev iterativo (50-100 loads/dia), ≤200k/dia.

---

## Encerramento

Cobertura mínima: cenários 0 (migration+backfill) + 1 (volume
home) + 3 (refresh status) + 9 (defaults). Resto cobre edge
cases.

Após validação, marcar feature pronta. Se reads continuarem
insustentáveis, investigar próximas otimizações:
- Cron de recompute fallback (drift residual).
- Lazy load `<FilterBar>` se mesmo `getUserFacets` virar gargalo.
