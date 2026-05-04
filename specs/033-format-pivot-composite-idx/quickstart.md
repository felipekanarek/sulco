# Quickstart — Inc 36 (033)

Validação manual em 8 cenários. Roda em prod **APÓS** migration +
backfill + deploy.

## Setup pré-validação

1. Migration prod aplicada via `db.batch` atômico (CREATE TABLE
   `record_formats` + 2 indexes). Verificar:
   ```bash
   turso db shell sulco-prod "SELECT name FROM sqlite_master WHERE name IN ('record_formats', 'record_formats_token_idx', 'records_user_archived_year_imported_idx');"
   ```
   Esperado: 3 linhas.

2. Backfill prod via `scripts/_backfill-record-formats.mjs`. Verificar:
   ```bash
   DATABASE_URL=... DATABASE_AUTH_TOKEN=... \
     node scripts/_backfill-record-formats.mjs
   ```
   Esperado: ~10k entries pra Felipe (user 2).

3. Code deploy via Vercel. Confirmar último deploy `Ready` e alias
   `sulco.vercel.app` apontando.

---

## Cenário 1 — Filtro format=LP é leve (US1)

**Setup**: Felipe logado, coleção 2587 records (~2243 LPs).

1. Hard refresh `https://sulco.vercel.app/?format=LP`.
2. Aguardar lista carregar (primeira página).
3. Conferir Turso dashboard → "Rows Read" → comparar antes/depois.

**Sucesso**:
- Lista mostra primeira página de LPs ordenados por `importedAt DESC`.
- Reads adicionais ≤200 rows.
- UI visualmente idêntica (chip "Formato (1)" no picker bar, lista de
  cards/grid igual).

---

## Cenário 2 — EXPLAIN confirma uso de pivot (US1)

**Setup**: acesso ao Turso shell.

```sql
EXPLAIN QUERY PLAN
SELECT id FROM records
WHERE user_id = 2 AND archived = 0
  AND id IN (SELECT record_id FROM record_formats WHERE token IN ('LP'))
ORDER BY imported_at DESC LIMIT 50;
```

**Sucesso**: output inclui:
- `SEARCH record_formats USING COVERING INDEX record_formats_token_idx (token=?)`
- `BLOOM FILTER`
- (Sem `SCAN records`).

---

## Cenário 3 — Filtro year=1985 usa composite (US2)

**Setup**: filtro de ano restritivo (poucos records).

1. Hard refresh `https://sulco.vercel.app/?year=1985`.
2. Conferir Turso dashboard.
3. EXPLAIN:
   ```sql
   EXPLAIN QUERY PLAN
   SELECT id FROM records
   WHERE user_id = 2 AND archived = 0 AND year IN (1985)
   ORDER BY imported_at DESC LIMIT 50;
   ```

**Sucesso**:
- Reads adicionais ≤200 rows.
- EXPLAIN mostra
  `SEARCH records USING COVERING INDEX records_user_archived_year_imported_idx`.

---

## Cenário 4 — Combinação 8 filtros (US3)

**Setup**: Felipe seleciona 1 valor de cada categoria (status + genre +
style + format + year + country + label + shelf).

1. URL completa:
   `https://sulco.vercel.app/?status=active&genre=Funk&style=Soul&format=LP&year=1980&country=BR&label=...&shelf=Compactos`
2. Hard refresh.
3. Conferir Turso dashboard.

**Sucesso**:
- Reads adicionais ≤500 rows.
- Lista correta (vazio ou ≤50 itens) com UI idêntica.

---

## Cenário 5 — Hard refresh sequencial (cacheUser preservado)

**Setup**: continuação do Cenário 4 dentro de 5 minutos.

1. Hard refresh novamente da mesma URL.
2. Conferir Turso dashboard.

**Sucesso**:
- Reads adicionais ≤100 rows (cache hit pros 7 listUser*).
- Apenas `queryCollection` re-executa (sempre, por design).

---

## Cenário 6 — Pivot consistente após sync Discogs (US4)

**Setup**: sync diário cron 04:00 UTC.

1. Aguardar próximo cron daily run.
2. Verificar logs Vercel pra confirmar sync rodou.
3. Verificar via SQL:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM records WHERE user_id=2 AND archived=0 AND format != '') AS expected_records_with_format,
     (SELECT COUNT(DISTINCT record_id) FROM record_formats rf
      INNER JOIN records r ON r.id = rf.record_id
      WHERE r.user_id=2 AND r.archived=0) AS records_with_pivot_entries;
   ```

**Sucesso**: 2 valores iguais (sem drift).

---

## Cenário 7 — Reaparição de record (US4)

**Setup**: Felipe arquiva 1 LP, depois reativa via Discogs adicionar de
volta.

1. **Antes**: SELECT COUNT em pivot pra esse record.id retorna N tokens.
2. Felipe arquiva o LP via UI ou Discogs remove.
3. Verificar pivot: ainda N tokens (archive não toca pivot — filter
   `archived=0` impede aparição em queries).
4. Felipe re-adiciona o LP no Discogs. Sync diário detecta reaparição.
5. Após sync: SELECT COUNT em pivot continua N tokens (idempotência).

**Sucesso**: tokens preservados em todo o fluxo.

---

## Cenário 8 — Mobile smoke (Princípio V)

**Setup**: Felipe abre `https://sulco.vercel.app/` em iPhone Safari
(ou DevTools 375×667).

1. Aplicar 3 filtros via picker buttons → bottom sheet.
2. Confirmar lista carrega rapidamente.
3. Hard refresh.

**Sucesso**:
- UI idêntica ao desktop (Inc 8 já cobre mobile).
- Filtros aplicam sem travamento perceptível.
- Reads ≤500 (mesmo target do Cenário 4).

---

## Métricas-chave esperadas (em prod, pós-Inc 36)

| Métrica | Antes (Inc 8 deployado) | Depois (Inc 36 deployado) |
|---|---|---|
| 1 hard refresh c/ format=LP | ~3.000 reads | ≤200 reads |
| 1 hard refresh c/ year=1985 | ~3.000 reads | ≤200 reads |
| 1 hard refresh c/ 8 filtros | ~3.000 reads | ≤500 reads |
| Sessão de teste 10 cliques | +77-122k reads | ≤2k reads |

Redução esperada total: **≥97%** em fluxos de filtro.
