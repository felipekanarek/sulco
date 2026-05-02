# Quickstart — Inc 27: Recompute incremental + dedups remanescentes

**Feature**: 025-incremental-recompute
**Audience**: Mantenedor (validação manual via Vercel logs `[DB]`)

---

## Pré-requisitos

- Inc 27 deployado em prod (`sulco.vercel.app`).
- Instrumentação `[DB]` ainda ativa (env var `DB_DEBUG` ≠ `"0"`).
- Terminal aberto com `vercel logs sulco.vercel.app --follow`.
- Mantenedor autenticado.

---

## Cenário 1 — Edição sem impacto em facets faz ZERO queries de delta (US1, SC-001)

**Setup**: abre `/disco/[id]` qualquer.

**Passos**:
1. Limpar terminal de logs.
2. Editar **apenas BPM** de uma faixa (digitar 120, blur).
3. Aguardar 3s.

**Esperado nos logs `[DB]`**:
- 1× `select users` (ownership/auth)
- 1× `select tracks` (ownership check)
- 1× `update tracks` (BPM)
- (re-render pós-revalidate) 1× `select records` + 1× `select tracks` + ~2 selects auxiliares
- **ZERO ocorrências de** `select count(*) from records`, `select value, count(*) from records inner join json_each`, ou `insert into user_facets`.

**Total esperado**: ≤ 6 linhas `[DB]` (vs ~16 hoje). **Zero rows lidas em scan de catálogo.**

---

## Cenário 2 — Toggle status do disco faz 1 UPDATE de delta (US1, SC-001)

**Passos**:
1. Em `/disco/[id]`, mudar status do disco (ex: clique em "Descartar").
2. Aguardar 3s.

**Esperado nos logs**:
- 1× `select users`
- 1× `update records SET status = ?` (pode ter `returning {id}`)
- 1× **`update user_facets SET records_unrated = ..., records_active = ..., records_discarded = ...`** (o delta).
- Re-render pós-revalidate: ~3-5 SELECTs.

**ZERO ocorrências** de `select count(*)` ou `select value, count(*) from records join json_each`.

**SQL do delta** (para conferência via dashboard Turso):
```sql
SELECT records_active, records_unrated, records_discarded FROM user_facets WHERE user_id=2;
```
Antes vs depois: 1 unidade transferida entre os 3 counters.

---

## Cenário 3 — Toggle selected de uma faixa faz 1 UPDATE de delta (US1, SC-001)

**Passos**:
1. Em `/disco/[id]`, alternar checkbox "Selected" de uma faixa.
2. Aguardar 3s.

**Esperado**:
- 1× `select users`, 1× ownership tracks, 1× UPDATE tracks SET selected
- 1× **`update user_facets SET tracks_selected_total = tracks_selected_total ± 1`**
- Re-render: ~3-5 SELECTs.
- **ZERO** queries de scan de tracks (`select COUNT(*) from tracks ...`).

**SQL conferência**:
```sql
SELECT tracks_selected_total FROM user_facets WHERE user_id=2;
```
Antes vs depois: ±1.

---

## Cenário 4 — Adicionar/remover mood faz recompute parcial APENAS de moods (US1)

**Passos**:
1. Em `/disco/[id]`, adicionar 1 mood novo numa faixa (ou remover existente).
2. Aguardar 3s.

**Esperado**:
- 1× `select users`, 1× ownership, 1× UPDATE tracks SET moods
- 1× `select value, count(*) from tracks inner join records on ... inner join json_each(tracks.moods)` — **APENAS para moods**.
- 1× `update user_facets SET moods_json = ?`.
- **ZERO** queries de contexts, genres, styles, shelves, ou counts.

**Custo aceito**: ~10k rows lidas (JOIN tracks). Aceitável porque é evento raro.

---

## Cenário 5 — Mudar prateleira faz recompute parcial APENAS de shelves (US1)

**Passos**:
1. Em `/disco/[id]`, abrir o `<ShelfPicker>` e selecionar uma prateleira diferente.
2. Aguardar 3s.

**Esperado**:
- 1× `select users`, 1× UPDATE records SET shelf_location
- 1× `select distinct shelf_location from records where ...` — **APENAS shelves**.
- 1× `update user_facets SET shelves_json = ?`.
- **ZERO** queries de tracks JOIN, counts, genres, styles.

**Custo aceito**: ~2.5k rows (records).

---

## Cenário 6 — Editar APENAS notes do disco faz ZERO recompute (US1, edge case)

**Passos**:
1. Em `/disco/[id]`, escrever algo no campo "Notes" e blur.
2. Aguardar 3s.

**Esperado**:
- 1× `select users`, 1× UPDATE records SET notes
- **ZERO** chamadas a delta.
- Re-render: ~3-5 SELECTs.

**Total**: ≤ 5 linhas `[DB]`.

---

## Cenário 7 — Curadoria completa de 1 disco com 30 edições mistas (US1, SC-002)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Abrir 1 disco com 12 faixas.
2. Fazer ~30 edições mistas:
   - Mudar status do disco (1×)
   - Editar shelfLocation (1×)
   - Escrever notes (1×)
   - Toggle selected em 5 faixas
   - Editar BPM em 8 faixas
   - Marcar 2 faixas como bomba
   - Escrever comment em 4 faixas
   - Adicionar 1 mood novo em 2 faixas
   - Editar rating em 6 faixas
3. Anotar contador depois.

**Esperado**: delta ≤ 1.000 rows lidas (vs ~2M antes do Inc 27).

**Breakdown estimado**:
- 1 status change → 3 reads
- 1 shelf change → ~2.5k reads (recompute shelves) — **único caro**
- 1 notes → 0 reads delta
- 5 selected toggles → 5 × 3 = 15 reads
- 8 BPM edits → 0 reads delta
- 2 isBomb toggles → 0 reads delta
- 4 comments → 0 reads delta
- 2 mood adds → 2 × ~10k = 20k reads (recompute moods × 2 vezes — **caro**, mas raro)
- 6 ratings → 0 reads delta

**Total estimado**: ~22.5k reads (vs ~2M antes). **-98%.**

Ainda alto pelo recompute parcial de moods (raro). Aceito.

---

## Cenário 8 — Página `/disco/[id]` carrega com queries deduplicadas (US2, FR-011/012)

**Passos**:
1. Hard refresh em `/disco/[id]` (qualquer disco).
2. Aguardar 3s.

**Esperado nos logs**:
- 1× `select users` (com `aiProvider`, `aiModel` no SELECT — confirma campos no objeto cached).
- 1× `select records WHERE id = ?` (loadDisc).
- 1× `select tracks WHERE record_id = ?` (loadDisc).
- (eventualmente) 1× `select user_facets` (se `<ShelfPicker>` precisar).
- **ZERO** ocorrências de `select "ai_provider", "ai_model" from "users"` separadamente.

**Total**: ≤ 5 linhas `[DB]` no load (vs ~6 hoje).

---

## Cenário 9 — Server Action sem revalidatePath obsoleto (US3, FR-013)

**Setup**: grep no código:
```bash
grep -rn "revalidatePath" src/lib/actions.ts src/lib/discogs/
```

**Esperado**: zero ocorrências apontando para rotas inexistentes (ex: `/curadoria` foi deletada no Inc 26 — verificar que sumiu).

---

## Cenário 10 — Cron diário corrige drift (US3, SC-006)

**Setup**: simular drift adulterando manualmente um counter via Turso shell:

```bash
turso db shell sulco-prod
```
```sql
UPDATE user_facets SET records_active = records_active + 5 WHERE user_id = 2;
SELECT records_active FROM user_facets WHERE user_id = 2;
.quit
```

**Passos**:
1. Disparar cron manualmente:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://sulco.vercel.app/api/cron/sync-daily
   ```
   (Ou aguardar próxima execução noturna automática.)
2. Verificar logs do cron no Vercel.
3. Re-rodar SQL.

**Esperado**:
- Cron loga algo como `[cron sync-daily] recomputeFacets executado para user 2`.
- `records_active` voltou ao valor real (drift de +5 corrigido).
- Nenhuma notificação ao DJ (FR-010).

---

## Cenário 11 — Smoke test fluxos principais (SC-007)

**Passos**:
1. `/` — listar coleção, contadores corretos. ✓
2. `/disco/[id]` — abrir disco, fazer 5 edições, salvar. ✓
3. `/sets/[id]/montar` — adicionar 1 candidato a um set. ✓
4. `/status` — ver runs + archived. ✓

**Esperado**:
- Nenhum erro 500.
- Nenhum erro JS no console do browser.
- Contadores em `/` continuam refletindo realidade após edições.

---

## Cenário 12 — Medição global de impacto (SC-004, SC-005)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Sessão típica de 30min: home + 2 curadorias completas + 1 montar set + alguns clicks.
2. Anotar contador depois.

**Esperado**:
- Delta ≤ 50.000 rows lidas (vs ~3-5M antes).
- Projeção 5 users intensos: ≤ 250.000/dia → ≤ 7.5M/mês → 1.5% do free tier.

---

## Encerramento

Cobertura mínima: cenários 1 (skip total), 2 (status delta), 3 (selected delta), 7 (curadoria completa medição), 8 (dedup ai config), 11 (smoke).

Se cenário 7 falhar (delta > 5k): inspecionar logs do Server Action específica que vazou — provável bug em qual delta foi escolhido.

Após validação OK: setar `DB_DEBUG=0` no Vercel se quiser desligar logs `[DB]`. Pode reativar via env var quando precisar de outra investigação.
