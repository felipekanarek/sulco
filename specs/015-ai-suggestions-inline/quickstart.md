# Quickstart — Validar Inc 16 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada com config IA ativa (Inc 14 entregue)
- 1 set criado com briefing
- Acervo com ≥30 candidatos elegíveis matching filtros

## Cenário 1 — Lista única com sugestões inline (P1, US1)

1. Abrir `/sets/[id]/montar`. Confirmar visualmente ordem da página: briefing → filtros → header "Candidatos" + botão "Sugerir com IA" → listagem.
2. Clicar **"✨ Sugerir com IA"**. Em ≤30s, ver listagem re-renderizar.
3. **Esperado**: 5-10 cards no topo com **moldura accent + bg paper-raised + badge solid "✨ Sugestão IA"** + justificativa em fonte maior. Logo abaixo, candidatos comuns sem moldura.
4. Inspecionar DOM via DevTools: confirmar **um único `<ol>`** com cards de sugestão e cards comuns como filhos diretos (não duas listas separadas).

## Cenário 2 — Reposicionamento (P1, US2)

1. Abrir `/sets/[id]/montar` em estado idle (sem ter clicado Sugerir ainda).
2. **Esperado**: ordem visual (de cima pra baixo): briefing → bloco de filtros (form completo desktop, collapsible mobile) → header "Candidatos" + botão "Sugerir com IA" → listagem.
3. Confirmar ausência de painel/seção "Sugestões da IA" entre briefing e filtros (estava lá no Inc 14).

## Cenário 3 — Dedup (FR-002a)

1. Aplicar filtro que retorna ≥10 candidatos. Anotar trackIds dos primeiros 5.
2. Clicar "Sugerir com IA". Anotar trackIds das sugestões IA.
3. **Esperado**: nenhum trackId aparece tanto nas sugestões IA (com moldura, no topo) quanto na lista comum abaixo. Cada faixa visível **uma única vez**.
4. Confirmar via DOM: contar `<article>` com badge "Sugestão IA" + `<article>` sem badge — soma deve bater com `total candidatos elegíveis`.

## Cenário 4 — Botão "Ignorar sugestões" (P2, US3)

1. Pós-cenário 1, ver botão "Ignorar sugestões" no header (ao lado direito do título "Candidatos").
2. Clicar **"Ignorar sugestões"**. Em ≤200ms, ver:
   - Cards com moldura desaparecem do topo.
   - Listagem volta com TODOS os candidatos comuns (incluindo os que estavam como sugestão antes — agora sem moldura).
   - Botão "Ignorar" some.
   - Botão "Sugerir com IA" volta a aparecer (habilitado).
3. Clicar "Sugerir com IA" novamente — geração nova roda **sem confirmação** (não há sugestões pendentes pra preservar).

## Cenário 5 — Cards adicionados permanecem visíveis (FR-009)

1. Pós-cenário 1 (sugestões visíveis), clicar "Adicionar ao set" em uma sugestão.
2. **Esperado**: card permanece visível com moldura E justificativa, mas botão "Adicionar" muda pra estado "✓ no set" (pattern do CandidateRow). Bag à direita ganha 1 faixa.
3. Clicar em outra sugestão. Idem.

## Cenário 6 — Re-gerar com confirmação (Inc 14 preservado)

1. Pós-cenário 5 (≥3 sugestões visíveis), clicar "Sugerir com IA" novamente.
2. **Esperado**: `window.confirm("Substituir as N sugestões atuais por uma nova lista?")`.
3. Cancelar → lista atual permanece. Confirmar → nova geração substitui (cards adicionados podem ser substituídos por sugestões diferentes; faixas adicionadas continuam no set).

## Cenário 7 — Sem config IA (Inc 14 preservado)

1. SQL: `UPDATE users SET ai_provider=NULL, ai_model=NULL, ai_api_key_encrypted=NULL WHERE id=<USER_ID>;`
2. Abrir `/sets/[id]/montar`.
3. **Esperado**: header "Candidatos" mostra botão "✨ Sugerir com IA" disabled com tooltip "Configure sua chave em /conta". Listagem mostra candidatos comuns normalmente. Botão "Ignorar" não aparece.

## Cenário 8 — Mobile (≤640px)

1. DevTools responsive 375px-640px.
2. Abrir `/sets/[id]/montar`.
3. Clicar "Sugerir com IA".
4. **Esperado**: header pode ter botões em 2 linhas (`flex-wrap`). Cards de sugestão empilham com moldura legível (border 2px continua visível). Cards comuns abaixo sem quebra de layout. Sem scroll horizontal.

## Cenário 9 — Estado vazio com sugestões (edge case)

1. Aplicar filtro super restritivo que retorne só 5 candidatos.
2. Clicar "Sugerir com IA". IA retorna ~3 sugestões (todos do recorte de 5).
3. **Esperado**: 3 cards de sugestão no topo com moldura. Embaixo, 2 candidatos comuns (os que sobraram após dedup). Lista total = 5, dedup correto.

## Cenário 10 — Ignorar enquanto há geração pendente (race)

1. Clicar "Sugerir com IA". Imediatamente clicar "Ignorar sugestões" antes da resposta chegar.
2. **Esperado**: `handleIgnore` reseta state pra idle. Quando a resposta chegar, **provavelmente** vai re-setar pra ready (depende de qual transição venceu — race aceitável). DJ pode clicar Ignorar de novo se quiser.

## Smoke checks finais

- `npm run build` passa sem erros novos.
- DevTools: lista é uma `<ol>` única com cards mistos. Sem duplicação.
- Console sem warnings novos.
- Mobile: `flex-wrap` nos botões funciona em viewport estreita.
- Botão "Ignorar" tem tap target ≥44×44px.
