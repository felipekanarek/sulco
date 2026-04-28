# Quickstart — Validar Inc 1 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada **com config de IA ativa** (Inc 14 entregue, key configurada).
- ≥ 1 set criado em `/sets`. Idealmente com briefing preenchido.
- ≥ 30 faixas com `selected=true` no acervo (pra testar truncamento de catálogo).

## Cenário 1 — Set vazio recebe primeira lista (P1, US1)

1. SQL: garantir set sem set_tracks: `DELETE FROM set_tracks WHERE set_id=<SET_ID>;`
2. Abrir `/sets/<SET_ID>/montar`. Confirmar painel "Sugestões da IA" abaixo do briefing com placeholder/CTA.
3. Clicar **"✨ Sugerir com IA"**. Spinner aparece.
4. Em ≤30s, ver 5-10 cards de sugestão renderizados via `<CandidateRow>` com badge **"✨ Sugestão IA"** + justificativa em itálico.
5. SQL: confirmar `set_tracks` ainda vazio (IA não escreve direto).

## Cenário 2 — Adicionar uma sugestão por vez (P1, US1)

1. Pós-cenário 1, clicar **"Adicionar ao set"** em uma sugestão.
2. **Esperado**: card NÃO some, ganha estado "✓ adicionada" visualmente. Set ganha 1 row em `set_tracks`.
3. Outras sugestões permanecem clicáveis. Adicionar mais 2-3.
4. SQL: cada `addTrackToSet` chamado registra `set_tracks` com `order` incrementado.

## Cenário 3 — Anti-duplicação (P1, US2)

1. Set tem ≥5 faixas em `set_tracks`. Clicar "✨ Sugerir com IA".
2. Em ≤30s, ver sugestões.
3. **Verificação crítica**: nenhuma sugestão tem `trackId` que coincide com tracks já em `set_tracks`. Confirmar via SQL:
   ```sql
   SELECT s.trackId
   FROM /* sugestões mostradas (anotar trackIds) */ s
   WHERE s.trackId IN (SELECT track_id FROM set_tracks WHERE set_id=<SET_ID>);
   -- esperado: 0 rows
   ```

## Cenário 4 — Filtros respeitados (P2, US4)

1. No `/montar`, aplicar filtro estreito (ex: `style=Samba`) via UI.
2. Clicar "✨ Sugerir com IA".
3. **Esperado**: 100% das sugestões pertencem a records com "Samba" em `records.styles`. Confirmar via SQL pra cada trackId mostrado.

## Cenário 5 — Catálogo zerado curto-circuita (FR-011, SC-006)

1. Aplicar combinação de filtros que comprovadamente zera elegíveis (ex: `BPM 200-220` + `style=Bolero`).
2. Clicar "✨ Sugerir com IA".
3. **Esperado**: mensagem "Nenhum candidato elegível com os filtros atuais. Relaxe os filtros e tente de novo." aparece **imediatamente** (sem spinner prolongado, sem chamada ao provider).
4. DevTools Network: zero request HTTP pra Gemini/Claude/etc.

## Cenário 6 — Re-gerar com confirmação (P2, US3)

1. Pós-cenário 1, ainda há sugestões não-adicionadas visíveis.
2. Clicar "✨ Sugerir com IA" novamente.
3. **Esperado**: `window.confirm` aparece ("Substituir as N sugestões pendentes por uma nova lista?").
4. Cancelar → lista atual permanece.
5. Confirmar → nova lista substitui (cards "✓ adicionada" antigos somem; novos cards aparecem).

## Cenário 7 — DJ sem config de IA (FR-002, SC-006)

1. SQL: `UPDATE users SET ai_provider=NULL, ai_model=NULL, ai_api_key_encrypted=NULL WHERE id=<USER_ID>;`
2. Abrir `/sets/<SET_ID>/montar`.
3. **Esperado**: botão "✨ Sugerir com IA" aparece **desabilitado** com tooltip "Configure sua chave em /conta".

## Cenário 8 — Falha do provider (FR-012)

1. Configurar IA com Gemini válido. Gerar 1 sugestão pra confirmar funciona.
2. SQL: `UPDATE users SET ai_api_key_encrypted='<lixo>' WHERE id=<USER_ID>;` (invalidar manualmente).
3. Clicar "✨ Sugerir com IA".
4. **Esperado**: mensagem contextual "Chave inválida ou revogada — reconfigure" (vinda do mapping do Inc 14). Sem persistir nada.

## Cenário 9 — Multi-user isolation (FR-013, SC-007)

1. Login user A. Criar set X com briefing.
2. Logout. Login user B.
3. Tentar abrir `/sets/<X>/montar` direto via URL.
4. **Esperado**: 404 ou redirect (já enforçado pelo `requireCurrentUser` da page).
5. Forçar `suggestSetTracks({ setId: <X> })` via DevTools console no contexto de B → action retorna `{ ok: false, error: 'Set não encontrado.' }`.

## Cenário 10 — IA hallucination de trackId (filtragem defensiva)

Difícil de forçar manualmente, mas o ponto é confirmar o filtro
funciona:
1. Modificar temporariamente o prompt builder pra incluir um
   trackId fake (ex: 999999999) na L3 — só pra teste.
2. Pedir IA pra retornar esse trackId.
3. Confirmar via DevTools que o trackId fake foi removido pelo
   filtro server-side antes do client receber.

(Cenário opcional, pode pular se confiança nos testes acima.)

## Cenário 11 — Set grande (60+ faixas) — performance (FR-014)

1. Set com 60+ faixas em `set_tracks` (criar via SQL pra teste).
2. Clicar "✨ Sugerir com IA".
3. **Esperado**: geração ainda em ≤30s típico, ≤60s hard limit.
4. Confirmar L2 do prompt incluiu **todas** as 60+ faixas (via debug log temporário OU inferir das justificativas que mencionam tracks atuais).

## Smoke checks finais

- `npm run build` passa sem erros novos.
- DevTools: chamada de `suggestSetTracks` é uma única Server Action POST.
- Console do browser: sem warnings novos.
- Mobile (≤640px): painel empilha sem quebrar layout. Cards `<CandidateRow>` já são responsivos (Inc 009).
- Tempo médio de geração com 50 candidatos no L3: 10-20s em condições normais.
