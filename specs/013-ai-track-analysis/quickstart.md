# Quickstart — Validar Inc 13 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada **com config de IA ativa** (Inc 14 entregue + DJ
  configurou key Gemini/Claude/etc em `/conta`).
- Acervo com ≥ 1 disco (`/disco/[id]` acessível).

## Cenário 1 — Gerar análise pela primeira vez (P1, US1)

1. Forçar estado: `sqlite3 sulco.db "UPDATE tracks SET ai_analysis=NULL WHERE id=<TRACK_ID>;"`
2. Abrir `/disco/<RECORD_ID>` e expandir a faixa alvo.
3. Procurar bloco "Análise". Esperar ver placeholder "Sem análise — clique no botão pra gerar com IA" + botão "✨ Analisar com IA" habilitado.
4. Clicar "✨ Analisar com IA". Spinner ou label "Analisando…" no botão.
5. Em ≤10s, ver texto pt-BR aparecer no campo (3-4 frases).
6. Confirmar via DB:
   ```sql
   SELECT ai_analysis FROM tracks WHERE id=<TRACK_ID>;
   ```
   Deve ter texto. Confirmar que `comment` continua intocado:
   ```sql
   SELECT comment FROM tracks WHERE id=<TRACK_ID>;
   ```

## Cenário 2 — Re-gerar análise existente (P1, US2)

1. Track com `ai_analysis` preenchido (resultado do cenário 1).
2. Clicar "✨ Analisar com IA" novamente.
3. **Esperado**: diálogo nativo "Substituir análise existente?".
4. Cancelar. Confirmar via DB que `ai_analysis` permanece com texto antigo. Sem chamada ao provider (network tab silencioso).
5. Repetir, agora confirmar. Texto novo aparece (provavelmente diferente, pois temperature > 0).

## Cenário 3 — Editar análise manualmente (P2, US3)

1. Track com `ai_analysis` preenchido.
2. Clicar dentro do textarea da análise. Modificar uma frase.
3. Clicar fora (blur).
4. **Esperado**: salva automaticamente. SQL confirma novo texto.
5. Recarregar página. Texto editado persiste.

## Cenário 4 — Apagar análise (P3, US4)

1. Track com `ai_analysis` preenchido.
2. Selecionar todo texto no textarea, deletar. Blur.
3. **Esperado**: `ai_analysis` vira `NULL` no DB. UI volta ao estado vazio (placeholder + botão).

## Cenário 5 — DJ sem config de IA

1. `sqlite3 sulco.db "UPDATE users SET ai_provider=NULL, ai_model=NULL, ai_api_key_encrypted=NULL WHERE id=<USER_ID>;"`
2. Abrir `/disco/<RECORD_ID>`.
3. **Esperado**: bloco "Análise" aparece (se track tiver `ai_analysis` preenchido, mostra texto editável). Botão "✨ Analisar com IA" aparece **desabilitado** com tooltip "Configure sua chave em /conta".

## Cenário 6 — Falha do provider (key revogada)

1. Configurar IA em `/conta` com Gemini key válida.
2. SQL: `UPDATE users SET ai_api_key_encrypted='<lixo-cifrado>' WHERE id=<USER_ID>;` (invalidar manualmente).
3. Abrir `/disco/[id]`, clicar "✨ Analisar com IA".
4. **Esperado**: mensagem contextual ("Chave inválida ou revogada — reconfigure" — vinda do mapeamento do Inc 14). Sem persistência. Track permanece com `ai_analysis` antigo (ou null).

## Cenário 7 — Multi-user isolation (FR-010)

1. Login user A. Gerar análise pra um track.
2. Logout. Login user B.
3. Tentar abrir `/disco/<RECORD_ID_DE_A>` direto via URL.
4. **Esperado**: 404 ou redirect (já enforçado pelo `requireCurrentUser` da page). Confirma que B não consegue ler análise de A.
5. Forçar `analyzeTrackWithAI({ trackId: <TRACK_ID_DE_A> })` via DevTools console no contexto de B (chamando a Server Action diretamente, se exposta). **Esperado**: action retorna `{ ok: false, error: 'Faixa não encontrada.' }`.

## Cenário 8 — Análise em faixa não-`selected` (FR-010a)

1. Track com `selected=false` (faixa fora do repertório).
2. Abrir `/disco/[id]`.
3. **Esperado**: bloco "Análise" e botão aparecem (em todas as
   faixas, independente de `selected`). Geração funciona normalmente.

## Smoke checks finais

- `npm run build` passa sem erros novos.
- DevTools Network: chamada de `analyzeTrackWithAI` é uma única
  Server Action POST (não 2). Sem loops.
- Console do browser: sem warnings novos no fluxo de gerar/editar/apagar.
- Mobile (devtools responsive ≤640px): bloco "Análise" empilha sem quebrar layout.
