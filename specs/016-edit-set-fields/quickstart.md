# Quickstart — Validar Inc 15 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada com 1 set criado (com briefing preenchido idealmente)

## Cenário 1 — Editar briefing (P1, US1)

1. Abrir `/sets/[id]/montar` de set existente. Confirmar botão
   "✏️ Editar set" visível no header.
2. Clicar botão. Modal abre com 4 campos pré-preenchidos.
3. Editar `briefing` substituindo texto.
4. Clicar **"Salvar"**. Em ≤500ms, modal fecha e a página
   recarrega exibindo o novo briefing no bloco visível.
5. SQL: `SELECT briefing FROM sets WHERE id=<ID>;` retorna o
   novo texto.
6. Clicar "✨ Sugerir com IA" — confirmar (via DevTools Network
   inspect ou logs) que o prompt enviado contém o briefing
   atualizado.

## Cenário 2 — Editar nome (P2, US2)

1. No modal, editar apenas o `name` ("Festa do Roberto" → "Aniversário 30").
2. Salvar. Modal fecha. Página exibe novo nome no header.
3. Acessar `/sets`. Listagem mostra novo nome.
4. SQL: `SELECT name, briefing FROM sets WHERE id=<ID>;` — name
   atualizado, briefing inalterado (partial update).

## Cenário 3 — Editar eventDate (P2, US2)

1. No modal, mudar `eventDate` (calendar input nativo).
2. Salvar. SQL confirma `eventDate` em UTC at-rest, hora local
   exibida na UI.

## Cenário 4 — Apagar location (P2, US2)

1. Set com `location = "Galpão"`. Modal abre com campo
   pré-preenchido.
2. Apagar todo o conteúdo. Salvar.
3. SQL: `location IS NULL`.

## Cenário 5 — Cancelar edição (P3, US3)

1. Abrir modal. Editar 2-3 campos.
2. Clicar **"Cancelar"** (ou ESC ou clicar fora).
3. Modal fecha. SQL confirma valores originais intactos.
4. Reabrir modal — campos exibem valores ORIGINAIS (não os
   edits descartados — Decisão 7 do research).

## Cenário 6 — Validação client-side

1. Abrir modal. Apagar todo o `name`.
2. **Esperado**: botão "Salvar" fica `disabled` (visual claro).
3. Re-preencher name. Botão volta habilitado.
4. Tentar colar 6000 chars no `briefing`. Input restringe a
   5000 (`maxLength`).

## Cenário 7 — ESC e clique fora fecham (UX padrão)

1. Modal aberto. Pressionar `ESC`. Modal fecha.
2. Reabrir. Clicar no overlay escuro (fora do dialog branco).
   Modal fecha.
3. Clicar dentro do dialog. Modal **NÃO** fecha (stop propagation
   funciona).

## Cenário 8 — Auto-focus no nome ao abrir

1. Abrir modal. Cursor de digitação automaticamente em `name`.
2. Tab navega na ordem: name → eventDate → location → briefing
   → cancelar → salvar.

## Cenário 9 — Multi-user isolation (FR-007)

1. Login user A. Criar set X.
2. Logout. Login user B. Forjar URL `/sets/<X>/montar`.
3. Esperado: 404 ou redirect (page já protege via
   `requireCurrentUser`).
4. Forçar `updateSet({ setId: <X>, name: 'hack' })` via DevTools
   console no contexto de B → action retorna `{ ok: false, error: 'Set não encontrado.' }`.

## Cenário 10 — Sem mudanças (no-op)

1. Abrir modal. Não alterar nada. Clicar "Salvar".
2. Esperado: action chamada com valores idênticos. UPDATE
   no-op. Modal fecha. Sem erro. Página recarrega
   (visualmente igual). OK.

## Smoke checks finais

- `npm run build` passa sem erros novos.
- Mobile (≤640px): modal cabe na tela, scroll vertical interno
  funciona quando briefing longo.
- Tap targets ≥ 44×44px nos botões.
- Console sem warnings novos.
