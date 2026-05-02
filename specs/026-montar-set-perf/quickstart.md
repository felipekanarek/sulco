# Quickstart — Inc 28: Otimização do fluxo de montar set

**Feature**: 026-montar-set-perf
**Audience**: Mantenedor (validação manual via Vercel logs `[DB]`)

---

## Pré-requisitos

- Inc 28 deployado em prod (`sulco.vercel.app`).
- Instrumentação `[DB]` ainda ativa (env var `DB_DEBUG` ≠ `"0"`).
- Terminal aberto com `vercel logs sulco.vercel.app --follow > /tmp/inc28.log 2>&1 &`.
- Mantenedor autenticado, com pelo menos 1 set criado.

---

## Cenário 1 — Load `/sets/[id]/montar` com ≤ 5 queries (US1, SC-001/SC-002)

**Passos**:
1. Limpar logs (`> /tmp/inc28.log` ou novo file).
2. Hard refresh em `sulco.vercel.app/sets/[id]/montar`.
3. Aguardar 3s.
4. Contar linhas `[DB]`.

**Esperado**:
- ≤ 5 linhas `[DB]`:
  - 1× `select users` (cached)
  - 1× `select sets` (loadSet)
  - 1× `select set_tracks JOIN tracks` (listSetTracks)
  - 1× `select user_facets` (getUserFacets — cached, alimenta vocab via Frente C)
  - 1× `select tracks JOIN records WHERE archived=0 AND status='active'` (queryCandidates LIMIT 1000)
- **ZERO ocorrências** de:
  - `select DISTINCT value FROM tracks INNER JOIN records JOIN json_each(tracks.moods)` (Frente C eliminou)
  - `select DISTINCT value FROM tracks INNER JOIN records JOIN json_each(tracks.contexts)` (Frente C eliminou)
  - `select "ai_provider", "ai_model" from users` (Frente B eliminou — vem do user cached)

**Falha**: > 6 queries → algo da Frente B ou C não foi aplicado.

---

## Cenário 2 — Sequência rápida de 5 toggles ≤ 2 persists (US1, SC-003)

**Passos**:
1. Em `/sets/[id]/montar`, clicar 5 chips de filtro rapidamente (intervalo <500ms entre cada — pode ser 5 chips diferentes ou alternar mesmo chip).
2. Aguardar 1.5s após o último click.
3. Contar `update sets set montar_filters_json` nos logs.

**Esperado**:
- ≤ 2 POSTs `update sets set montar_filters_json`.
- Idealmente **1 POST** se DJ clicou todos em <500ms entre cada (debounce coalesce).
- Estado persistido reflete o estado final visível na UI.

**Falha**: ≥ 5 POSTs → debounce não foi aplicado ou timer foi resetado errado.

---

## Cenário 3 — Toggle isolado dispara 1 persist após 500ms (US1)

**Passos**:
1. Toggle 1 único chip.
2. **Aguardar exatamente 1s** sem clicar mais nada.
3. Contar POSTs.

**Esperado**:
- Exatamente 1 POST `update sets`.
- Timing: POST aparece nos logs ~500ms após o toggle (não imediato).

---

## Cenário 4 — Flush on unmount (US1, FR-004)

**Passos**:
1. Em `/sets/[id]/montar`, toggle 1 chip de filtro.
2. **Imediatamente** (em <500ms) clicar no link "Sets" (volta para `/sets`).
3. Verificar logs.

**Esperado**:
- 1 POST `update sets` é disparado mesmo com a navegação rápida (cleanup do `useEffect` força flush).
- Não esperar 500ms — flush é imediato no unmount.

**Falha**: 0 POSTs nos logs após esse passo → flush não foi implementado corretamente.

**Verificação adicional**: ao voltar pra `/sets/[id]/montar` (refresh), o filtro toggled deve estar persistido (chip ativo).

---

## Cenário 5 — UI imediata (US1, SC-009)

**Passos**:
1. Em `/sets/[id]/montar`, observar lista de candidatos (painel direito).
2. Toggle 1 chip de gênero.
3. Cronometrar quanto tempo até a lista de candidatos atualizar.

**Esperado**:
- Lista de candidatos atualiza em ≤ 100ms (state client + URL change → RSC re-render).
- Persistência da preferência ocorre 500ms depois (debounced) — invisível pra DJ.

**Importante**: a percepção do DJ NÃO deve ser de "lento" — atualização visual é instantânea, só o write em background é debounced.

---

## Cenário 6 — Adicionar candidato em ≤ 4 queries de Server Action (US2, SC-004)

**Passos**:
1. Em `/sets/[id]/montar`, clicar "+ Adicionar" em qualquer candidato.
2. Aguardar 2s.
3. Contar queries da Server Action POST `/sets/[id]/montar` (excluir GET re-render que vem depois).

**Esperado** (4 queries):
1. `select users` (auth via cached `requireCurrentUser`)
2. `select sets WHERE id=? AND user_id=?` (ownership)
3. `select tracks JOIN records WHERE id=? AND user_id=?` (ownership track)
4. `select COUNT(*), COALESCE(MAX(order), -1) from set_tracks WHERE set_id=?` (combinado, Frente D)
5. `insert into set_tracks ... ON CONFLICT DO NOTHING`

= 4 SELECTs + 1 INSERT = 5 queries (vs 6 hoje). **Nota**: contagem inclui o INSERT — se contar só SELECTs, são 4.

**Verificação SQL**:
- ❌ NÃO deve aparecer 2 queries separadas (`SELECT COUNT(*)` + `SELECT MAX(order)`).
- ✅ DEVE aparecer 1 query combinada com `COUNT(*)` E `MAX(order)` no SELECT.

**Falha**: 2 queries separadas pra count+max → Frente D não foi aplicada.

---

## Cenário 7 — Adicionar duplicado retorna mensagem clara (US2, FR-008)

**Passos**:
1. Em `/sets/[id]/montar`, adicionar candidato X.
2. Tentar adicionar X de novo (mesmo botão "+ Adicionar").
3. Observar resposta.

**Esperado**:
- Server Action retorna mensagem ou flag indicando "já está no set" (não erro genérico).
- INSERT executa com `ON CONFLICT DO NOTHING` (sem inserção dupla).
- UI mostra estado claro pro DJ (ex: botão troca pra "✓ adicionado" ou similar).

---

## Cenário 8 — Curadoria completa de set: agregado ≤ 5k rows (SC-005)

**Setup**: anotar contador "Rows Read" no dashboard Turso ANTES.

**Passos**:
1. Criar novo set (`/sets/novo`).
2. Em `/sets/[id]/montar`:
   - 30 toggles de filtros mistos (gêneros, estilos, moods, contexts)
   - 20 adds de candidatos
   - 5 removes
   - Reordenar 2 vezes (drag-and-drop)
3. Voltar pra `/sets/[id]`.
4. Anotar contador depois.

**Esperado**:
- Delta ≤ 5.000 rows lidas (vs ~1.000.000 antes).
- Distribuição: ~50 queries totais; nenhuma com `rows >= 1000`.

---

## Cenário 9 — Smoke test fluxos principais (SC-008)

**Passos**:
1. `/` — listar coleção. ✓
2. `/disco/[id]` — abrir disco, fazer 2 edições. ✓ (Inc 27 path)
3. `/sets/[id]/montar` — adicionar candidatos, filtrar. ✓ (Inc 28 path)
4. `/status` — ver runs + archived. ✓
5. `/conta` — ver config IA. ✓

**Esperado**:
- Nenhum erro 500.
- Nenhum erro JS no console do browser.
- Vocabulário no chip picker (moods/contexts) reflete catálogo real.
- Filtros persistidos entre refreshes.

---

## Cenário 10 — Multi-aba: last-write-wins aceito (Edge case)

**Setup**: 2 abas com mesmo set aberto em `/sets/[id]/montar`.

**Passos**:
1. Aba 1: toggle "rock" ON. Aguardar 1s (persist disparado).
2. Aba 2: toggle "rock" OFF (não recarregou ainda; UI mostra "ON" desatualizado).
3. Aba 2: clica OFF → state local muda; após 500ms persist com `genres: []`.
4. Refresh ambas abas.

**Esperado**:
- Última write (Aba 2) venceu — `montar_filters_json.genres` está `[]`.
- Aceito por design — feature é preferência, não dado crítico.

---

## Encerramento

Cobertura mínima: cenários 1 (load -2 queries), 2 (debounce sequência), 4 (flush unmount), 6 (addTrack -1 query), 8 (curadoria total), 9 (smoke).

Após validação OK: pode setar `DB_DEBUG=0` no Vercel pra desligar logs `[DB]` (opcional). Próxima frente potencial: auditar `suggestSetTracks` (IA) que ficou de fora desta feature, se mostrar gargalo em uso real.
