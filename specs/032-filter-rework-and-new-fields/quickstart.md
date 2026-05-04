# Quickstart — Inc 8 Filter UX rework + 5 novos filtros

**Feature**: 032-filter-rework-and-new-fields
**Audience**: Mantenedor (validação manual via UI + Vercel logs `[DB]` + dashboard Turso)

## Pré-requisitos

- Migration prod aplicada (`user_vocab` recriada sem CHECK constraint) **antes** do code deploy.
- Backfill prod rodado (`recomputeFacets` pra cada user) **antes** do code deploy — popula `user_vocab` com 3 kinds novos (formats/countries/labels).
- Inc 8 deployado em prod.
- Coleção em prod tem records com `format`, `country`, `label`, `year`, `shelfLocation` populados.

---

## Cenário 0 — Migration + backfill em prod (pré-deploy)

**Passos**:

1. Aplicar migration via `turso db shell sulco-prod`:
   ```sql
   CREATE TABLE user_vocab_new (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     term TEXT NOT NULL,
     ref_count INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
     PRIMARY KEY (user_id, kind, term)
   );
   INSERT INTO user_vocab_new SELECT * FROM user_vocab;
   DROP INDEX user_vocab_user_kind_idx;
   DROP TABLE user_vocab;
   ALTER TABLE user_vocab_new RENAME TO user_vocab;
   CREATE INDEX user_vocab_user_kind_idx ON user_vocab(user_id, kind);
   ```

2. Verificar:
   ```sql
   SELECT COUNT(*) FROM user_vocab; -- esperado: ~16k entries Inc 33 preservadas
   SELECT name FROM sqlite_master WHERE type='index' AND name='user_vocab_user_kind_idx'; -- 1 row
   ```

3. Aplicar mesmo SQL em sqlite local (dev).

4. Backfill prod via script `scripts/_backfill-user-vocab-formats-countries-labels.mjs` (ou re-rodar `recomputeFacets` user-por-user) pra popular kinds novos.

5. Gate verificável antes de push:
   ```sql
   SELECT kind, COUNT(*) FROM user_vocab GROUP BY kind;
   -- Esperado: 8 rows (genres, styles, moods, contexts, shelves + formats, countries, labels) com COUNT > 0.
   ```

**Esperado**: `user_vocab` recriada sem CHECK + 3 kinds novos populados.

---

## Cenário 1 — Picker buttons substituem lista expandida (US1, FR-013)

**Passos**:
1. Hard refresh em `https://sulco.vercel.app/`.
2. Inspecionar sidebar de filtros.

**Esperado**:
- Filtros aparecem como **botões compactos** (ex: "Gênero", "Estilo", "Formato", "Prateleira", "Ano", "País", "Selo", "Bomba", "Status").
- Lista expandida de chips (top 10) NÃO aparece mais inline.
- Cada botão mostra count quando ≥1 valor ativo (ex: "Gênero (3)").
- Botão "Limpar todos" visível quando algum filtro ativo.

---

## Cenário 2 — Picker de Gênero mostra todos os termos (US1, SC-002)

**Passos**:
1. Em `/`, clicar no botão "Gênero".
2. Verificar overlay/sheet aberto.

**Esperado**:
- Overlay/sheet mostra **TODOS os ~30+ gêneros** distintos da coleção (não só top 10).
- Chips clicáveis ordenados por frequência DESC.
- Como Gênero tem >20 entries, **busca textual aparece no topo** (Q3=B).
- Click num chip alterna estado (selected/unselected).
- Click fora do overlay OU botão "Aplicar" fecha e aplica filtros.

---

## Cenário 3 — Picker de Formato (sem busca interna) (US2, FR-005)

**Passos**:
1. Em `/`, clicar no botão "Formato".

**Esperado**:
- Picker mostra ~5 chips (LP, 7", 12", CD, EP, etc. — proporcional à coleção).
- Como ≤20 entries, **busca textual NÃO aparece** (Q3=B condicional).
- Selecionar "LP" + "7\"" → fechar → lista mostra apenas records desses formatos.

---

## Cenário 4 — Picker de Ano com chips de décadas (US4, FR-002)

**Passos**:
1. Em `/`, clicar no botão "Ano".

**Esperado**:
- Picker mostra chips: "60s", "70s", "80s", "90s", "00s", "10s", "20s" (apenas décadas com ≥1 record na coleção).
- Sem chips fantasmas de décadas vazias.
- Selecionar "70s" + "80s" → lista mostra records com `year BETWEEN 1970 AND 1989`.
- Records com `year = NULL` NÃO aparecem.

---

## Cenário 5 — Picker de Selo com busca interna (US6, FR-005)

**Passos**:
1. Em `/`, clicar no botão "Selo".

**Esperado**:
- Como Selo tem >20 entries (centenas), **busca textual aparece** no topo do picker.
- Digitar "blue" no campo de busca → lista filtra em tempo real pra mostrar selos com "blue" (case-insensitive).
- Selecionar 2 selos → fechar → lista filtra.

---

## Cenário 6 — Filtro composto (5 kinds) (US7, SC-003)

**Passos**:
1. Aplicar filtros: Gênero="Soul", Estilo="Disco", Formato="LP", País="Brazil", Década="70s".
2. Hard refresh pra confirmar URL search params persistem.

**Esperado**:
- URL contém todos os params: `?genre=Soul&style=Disco&format=LP&country=Brazil&decade=1970`.
- Lista mostra apenas records que satisfazem TODOS (interseção AND).
- Refresh recarrega filtros (state preservado em URL).

---

## Cenário 7 — Empty state (SC-010)

**Passos**:
1. Aplicar combinação que retorna 0 matches (ex: Gênero="Soul" + Década="20s" + País="Japan").

**Esperado**:
- Lista mostra empty state com mensagem clara (não tela em branco).
- Botão "Limpar filtros" disponível.

---

## Cenário 8 — Mobile (Princípio V, FR-017, SC-006)

**Passos**:
1. Em viewport ≤640px (DevTools mobile), abrir `/`.
2. Clicar botão "Filtros" (ou similar).

**Esperado**:
- `<FilterBottomSheet>` abre fullscreen com lista de picker buttons.
- Click num picker abre `<MobileDrawer>` fullscreen com chips clicáveis.
- Tap targets ≥44×44 px.
- Busca textual condicional funciona igual desktop.

---

## Cenário 9 — Custo de leitura no banco (SC-005)

**Passos**:
1. Anotar contador "Rows Read" no Turso ANTES.
2. Hard refresh em `/?genre=Soul&format=LP` 3×.
3. Anotar DEPOIS.

**Esperado**:
- Delta total ≤ 1.500 rows (~500/load: ~250 baseline + ~150 distinct queries + ~100 query records). Comparável a baseline pré-Inc 8.

---

## Cenário 10 — Smoke geral (SC-008)

**Passos** (em sequência):
1. `/` (default) — funciona.
2. `/?status=active` — funciona.
3. `/?q=joao` — busca textual funciona.
4. `/?genre=Rock` — filtro existing funciona.
5. `/?bomba=only` — bomba funciona.
6. `/disco/[id]` — disco abre, curadoria intacta.
7. `/sets/[id]/montar` — pickers de moods/contexts funcionam (Inc 35 não regredido).
8. Mobile smoke em todas as rotas.

**Esperado**: zero regressão em filtros existing ou outros fluxos.

---

## Encerramento

Cobertura mínima: cenários 1 (picker buttons), 2 (gênero todos), 4 (ano décadas), 6 (composto), 8 (mobile), 10 (smoke).

Reversão se necessário:
```bash
git revert <commit-inc-8>
git push origin main
vercel --prod --yes
```
~3min. Sem migration pra reverter.
