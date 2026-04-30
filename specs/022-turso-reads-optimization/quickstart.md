# Quickstart — Inc 23: Otimização de leituras Turso

**Feature**: 022-turso-reads-optimization
**Audience**: Felipe (validação manual + medição via dashboard Turso)

Pré-requisitos:
- App em prod (deploy completo).
- Acesso ao dashboard Turso (https://app.turso.tech) pra ver
  contadores de row reads.
- Capturar baseline ANTES do deploy desta feature
  (já estouramos cota — referência atual estourada).

---

## Cenário 0 — Aplicar migration de índices em prod

**Passos**:
1. Conectar via `turso db shell sulco-prod`.
2. Rodar:
   ```sql
   CREATE INDEX IF NOT EXISTS records_user_archived_status_idx
     ON records(user_id, archived, status);

   CREATE INDEX IF NOT EXISTS tracks_record_is_bomb_idx
     ON tracks(record_id, is_bomb);
   ```
3. Confirmar:
   ```sql
   SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'records';
   SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tracks';
   ```

**Esperado**:
- Os 2 nomes aparecem listados.
- Operação foi instantânea (tabelas pequenas) — sem downtime.

---

## Cenário 1 — Cache hit zero reads (US1, US3, FR-005)

**Passos**:
1. Anotar contador de row reads atual no dashboard Turso.
2. Abrir `/` em prod.
3. **Aguardar 5 segundos** e abrir `/` de novo (mesma URL).
4. Conferir contador no dashboard.

**Esperado**:
- 1ª visita: ~12.5k reads (cache miss — encheu o cache).
- 2ª visita: **0 reads adicionais** (cache hit; dentro do TTL de 300s).
- Variantes (`?status=unrated`, etc.): cada filtro novo é miss inicial → hit em revisitas.

---

## Cenário 2 — `queryCandidates` limitado a ~1000 reads (FR-002)

**Passos**:
1. Anotar reads.
2. Abrir `/sets/[id]/montar` em set existente com candidatos.
3. Conferir reads.

**Esperado**:
- Antes (Inc 21 atual): ~10k reads.
- Após Inc 23: **≤1000 reads**.
- Inc 18 preservado: digitar `joao` no campo de busca acha
  `João Gilberto` na listagem (cenários quickstart 021 passam).

---

## Cenário 3 — Botão 🎲 fast path (FR-003)

**Passos**:
1. Anotar reads.
2. Abrir `/` SEM termo de busca digitado.
3. Clicar botão 🎲 (Random).
4. Conferir reads.

**Esperado**:
- Antes Inc 23: ~2500 reads (post-Inc 21).
- Após Inc 23: **1 row read** (caminho rápido `RANDOM() LIMIT 1`).
- Repetir clique 5×: 5 reads totais (vs 12.5k antes).

**Variante com text**:
1. Digitar termo de busca (ex: `joao`).
2. Clicar 🎲.

**Esperado**:
- Caminho slow (JS post-filter Inc 18). Reads ~2500 (subconjunto matching), mas **dispara apenas quando há text** — caso minoria.

---

## Cenário 4 — Cache invalida em write (FR-006)

**Passos**:
1. Abrir `/` (cache populado pra `queryCollection` + counts).
2. Em outra aba: abrir `/disco/[id]`. Mudar status do disco
   via `<RecordStatusActions>` (Inc 19) ou Curadoria.
3. Voltar pra `/`.

**Esperado**:
- Mudança aparece imediato (cache invalidado pelo
  `revalidateUserCache(user.id)` no fim da Server Action).
- Sem stale data; sem hard refresh.
- Dashboard Turso mostra reads adicionais (cache foi invalidado e
  re-populado na próxima visita).

---

## Cenário 5 — Multi-user isolation (FR-008 / SC-007)

**Passos**:
1. DJ A: navegar pelo app, povoar cache.
2. DJ A: editar status de um disco (invalida tag `user:A`).
3. DJ B (outra conta): abrir `/`. Cache de DJ B intacto?

**Esperado**:
- DJ B vê próprios discos sem invalidação cruzada.
- `user:A` tag NÃO invalida `user:B` cache.

---

## Cenário 6 — Cold start mass de cache miss (Edge Case Hobby)

**Setup**: deixar app sem requests por ≥15min (Vercel Hobby
desliga função). Próxima visita = cold start = cache vazio.

**Passos**:
1. Abrir `/` após cold start.
2. Conferir reads.

**Esperado**:
- 1ª visita: ~12.5k reads (cache miss completo).
- Visitas seguintes na próxima ~15min: hit (assumindo TTL 5min e
  warm-up).
- Aceito como trade-off do Hobby (sem replicação cache entre
  regions/cold starts).

---

## Cenário 7 — TTL fallback após 5min (Clarification Q2)

**Passos**:
1. Abrir `/` (cache miss → populado).
2. Aguardar **6+ minutos** sem fazer write nenhum.
3. Abrir `/` de novo.

**Esperado**:
- 2ª visita: cache miss (TTL 300s expirou) → re-executa query
  → ~12.5k reads.
- Após 2ª visita: cache repopulado, próximas visitas em ≤5min
  = hit.

---

## Cenário 8 — Inc 18 preservado (FR-004 / SC-006)

**Passos**:
1. Abrir `/`. Digitar `joao`.
2. Verificar `João Gilberto` aparece nos resultados.
3. Repetir em `/sets/[id]/montar` com termo `aguas`.
4. Verificar `Águas de Março` aparece.

**Esperado**:
- Idêntico aos cenários quickstart 021.
- Sem regressão.

---

## Cenário 9 — Inc 11 random com filtros preservado (FR-003 slow path)

**Passos**:
1. Em `/`, aplicar filtro `?status=unrated&q=joao`.
2. Clicar 🎲.

**Esperado**:
- Random escolhe disco que case com `joao` E unrated.
- Caminho slow (JS post-filter) executado — reads ~2500.

---

## Cenário 10 — Mobile (Princípio V — SC-005)

**Passos**:
1. DevTools 375×667.
2. Abrir `/` mobile, navegar (cache populando).
3. Verificar latência percebida.

**Esperado**:
- Latência igual ou MELHOR vs antes (cache hit é instantâneo).
- UI mobile inalterada — feature é puramente backend.

---

## Cenário 11 — Medição global (SC-001)

**Setup**: anotar contador de row reads do dia ANTES do deploy
(linha de base do estouro).

**Passos**:
1. Deploy completo.
2. Sessão típica: abrir home, abrir 3 discos, montar 1 set,
   clicar random 5× — conforme spec User Story 1.
3. Anotar reads consumidos.

**Esperado**:
- Sessão típica consome **≤2k row reads** (vs ~50k+ antes —
  SC-001).
- Acompanhar consumo diário no dashboard Turso por 24-48h pra
  confirmar volume sustentável.

---

## Encerramento

**Cobertura mínima**: cenários 0 (migration) + 1 (cache hit) +
2 (queryCandidates limit) + 3 (random fast path) + 4
(invalidation) cobrem o caminho fundador. Cenários 5-11 cobrem
edge cases e validações específicas.

**Critério de pronto**: SC-001 a SC-008 da spec verificáveis no
dashboard Turso após uso real de 24h.

Após validação, commit + merge + deploy. Branch
`022-turso-reads-optimization` pode ser deletada local.
