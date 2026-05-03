# Quickstart — Inc 32: Search text materializado em records

**Feature**: 027-search-text-materialized
**Audience**: Mantenedor (validação manual via Vercel logs `[DB]` + dashboard Turso + SQL shell)

---

## Pré-requisitos

- Migration aplicada em prod (ALTER TABLE + CREATE INDEX) **antes** do code deploy.
- Backfill rodado em prod **antes** do code deploy.
- Inc 32 deployado em prod.
- Instrumentação `[DB]` ainda ativa (env var `DB_DEBUG` ≠ `"0"`).

---

## Cenário 0 — Migration + backfill em prod (pré-deploy)

**Passos**:

1. Aplicar migration via `turso db shell sulco-prod`:
   ```sql
   ALTER TABLE records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
   CREATE INDEX records_user_search_text_idx ON records(user_id, search_text);
   ```

2. Verificar coluna criada:
   ```sql
   PRAGMA table_info(records);
   -- esperado: search_text na lista, type TEXT, notnull=1, dflt_value=''
   ```

3. Rodar backfill local primeiro (dev sqlite):
   ```bash
   node scripts/_backfill-search-text.mjs
   ```
   Confirma sem erros e que records foram atualizados.

4. Rodar backfill em prod:
   ```bash
   DATABASE_URL=libsql://sulco-prod-felipekanarek.aws-us-east-1.turso.io \
   DATABASE_AUTH_TOKEN=<token-prod> \
   node scripts/_backfill-search-text.mjs
   ```

5. Verificar pós-backfill:
   ```sql
   SELECT COUNT(*) AS empty_count FROM records WHERE search_text = '';
   -- esperado: 0
   SELECT id, artist, title, search_text FROM records LIMIT 3;
   -- esperado: search_text populado (ex: "joao gilberto chega de saudade odeon")
   ```

**Esperado**:
- Coluna criada, index criado, todos records têm `search_text` populado.

---

## Cenário 1 — Load `/?q=joao` consome ≤ 50 rows lidas (US1, SC-001)

**Passos**:
1. Terminal: `vercel logs sulco.vercel.app --follow`
2. Browser: hard refresh em `sulco.vercel.app/?q=joao`
3. Aguardar 5s
4. Ctrl+C no terminal

**Esperado nos logs**:
- 1× `select id, artist, title... from records WHERE user_id=? AND archived=? AND search_text LIKE ? LIMIT 50 OFFSET 0` retornando ≤ 50 rows.
- **ZERO ocorrências** de `select id, artist, title... from records WHERE ...` retornando 2588 rows.
- Outras queries esperadas: 1× users (cached), 1× user_facets (cached), 1-2× tracks aggregations (50 record_ids).

**Falha**: se aparecer `rows=2588` na query de records → caminho antigo (Inc 18 JS post-filter) ainda ativo. T015 não completou.

---

## Cenário 2 — Cobertura accent-insensitive preservada (US1, FR-009/SC-002)

**Passos**:
1. Em `/`, digitar `acucar` na barra de busca, Enter.
2. Verificar resultados.
3. Digitar `Açúcar` (com acento), Enter.
4. Verificar resultados.

**Esperado**:
- Ambas buscas retornam **mesmo conjunto** de records (todos os discos cujo artist/title/label contenha "açúcar" em qualquer combinação de acento/caixa).
- Antes do Inc 32 (Inc 18) também retornava o mesmo — paridade total preservada.

---

## Cenário 3 — Cobertura case-insensitive preservada (US1, FR-010)

**Passos**:
1. Digitar `JOAO`, `joao`, `JoAo` na barra de busca em sequência.
2. Cada uma deve retornar mesmo conjunto.

**Esperado**: discos do "João Gilberto" (ou similares) aparecem em todos os 3 termos.

---

## Cenário 4 — Paginação SQL com text filter (US1, FR-007)

**Passos**:
1. Em `/?q=algo&page=1`, anotar lista de records (50 primeiros).
2. Navegar pra `/?q=algo&page=2`.
3. Verificar nos logs do `vercel logs`:

**Esperado**:
- Query SQL com `LIMIT 50 OFFSET 50` (não 0).
- Retorna próxima página de 50 records (ou menos se chegou no fim).
- 0 sobreposição entre página 1 e página 2.

---

## Cenário 5 — Sync incremental atualiza search_text automaticamente (US2, FR-003/FR-004)

**Setup**: opcional, requer adicionar/atualizar record via Discogs externamente. Pode ser simulado via curl forçando `runManualSync`.

**Passos**:
1. Antes do sync, anotar `search_text` de algum record existente:
   ```sql
   SELECT id, search_text FROM records WHERE id = X;
   ```
2. Disparar sync manual via `/status` ou cron.
3. Após sync concluir, re-conferir `search_text`.

**Esperado**:
- Se metadata mudou (ex: title corrigido), `search_text` reflete novo valor.
- Se record é novo (insert), `search_text` populado desde o início.
- Nenhum record com `search_text=''` deve aparecer pós-sync (assumindo backfill já rodou).

---

## Cenário 6 — Idempotência de backfill (US3, FR-012)

**Passos**:
1. Rodar `node scripts/_backfill-search-text.mjs` em local sqlite. Anotar count de records atualizados.
2. Rodar **2ª vez** sem mudar nada.

**Esperado**:
- Segundo run completa sem erros.
- Valores `search_text` permanecem iguais (não causa drift).
- Logs mostram número de UPDATEs equivalente (script atualiza tudo, mesmo se já equivalente — aceito por simplicidade).

---

## Cenário 7 — Tempo de resposta cai (US1, SC-003)

**Passos**:
1. Em `/?q=algo` (qualquer termo com matches), cronometrar tempo até página renderizar (DevTools Network → DOMContentLoaded ou similar).
2. Comparar com tempo pré-Inc 32 (anote referência antes do deploy).

**Esperado**:
- Pós-Inc 32: ≤ 500ms tempo de servidor (Vercel Function Duration no dashboard de Logs).
- Pré-Inc 32: era ~2-3s (Lambda carregava 2588 rows + JS filter).

---

## Cenário 8 — Smoke test fluxos principais (FR-011, SC-007)

**Passos** (em sequência, anotando que tudo funciona):
1. `/` (sem busca) — listar coleção, paginação funciona. ✓
2. `/?q=algo` — busca textual retorna resultados corretos. ✓
3. `/?status=active&q=algo` — combina filtros. ✓
4. `/?genre=Rock` — filtro multi-select de gênero ainda funciona. ✓
5. `/?bomba=only` — filtro bomba funciona. ✓
6. Botão 🎲 (random unrated) com `?q=` ativo — sorteia dentro do conjunto filtrado. ✓
7. `/disco/[id]` — abrir disco, fluxo de curadoria intacto. ✓
8. `/sets/[id]/montar` — busca textual ainda funciona (continua usando JS post-filter por enquanto — fora do escopo Inc 32). ✓

**Esperado**: nenhum erro 500, nenhum erro JS, todas as funcionalidades intactas.

---

## Cenário 9 — Medição global de impacto (SC-004)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Sessão típica: 20 buscas textuais variadas em `/`, navegação entre páginas, alguns refreshes.
2. Anotar contador depois.

**Esperado**:
- Delta de rows lidas ≤ 1.500 (vs ~50.000 antes do Inc 32 com mesmo padrão de uso).
- 20 buscas × ~50 rows/busca = ~1.000 rows. Margem pra outros loads.

---

## Encerramento

Cobertura mínima: cenários 0 (migration+backfill), 1 (paginação SQL), 2 (cobertura accent), 8 (smoke), 9 (medição).

Pós-validação OK:
- Pode setar `DB_DEBUG=0` no Vercel env vars (opcional — instrumentação fica pronta pra próxima investigação).
- Inc 33 (`user_vocab` dedicada) é o próximo passo se quiser continuar atacando reads.

Se cenário 1 falhar (rows=2588 ainda):
- Verificar se backfill rodou em prod (`SELECT COUNT(*) WHERE search_text=''`).
- Verificar se code deploy efetivou (`vercel ls sulco --yes`).
- Verificar se `omitText` flag e `matchesNormalizedText` JS post-filter foram REMOVIDOS de `queryCollection` (não só comentados).
